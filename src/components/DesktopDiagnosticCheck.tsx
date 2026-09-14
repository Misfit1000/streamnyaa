import { useEffect, useRef, useState } from 'react';
import { fetchAniList, fetchJikanPath, fetchAnimeEpisodes } from '../api/jikan';
import { getDesktopRuntimeStatus } from '../lib/desktop';
import { desktopDataError } from '../lib/desktopData';

type Check = { label: string; status: string; action: string };
export default function DesktopDiagnosticCheck() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const run = async () => {
    if (busy) return;
    const active = new AbortController(); controller.current = active;
    setBusy(true); setChecks([]);
    const record = (value: Check) => { if (!active.signal.aborted) setChecks(previous => [...previous, value]); };
    try {
      const runtime = await getDesktopRuntimeStatus();
      record({ label: 'Native playback tools', status: runtime.ready ? 'Ready' : 'Needs attention', action: runtime.ready ? 'The configured engine and player are available.' : 'Check the bundled binaries and executable overrides below.' });
    } catch { record({ label: 'Native playback tools', status: 'Unavailable', action: 'Restart the desktop app, then run this check again.' }); }
    for (const check of [{ provider: 'anilist', label: 'Primary catalog', path: '' }, { provider: 'jikan', label: 'Fallback details', path: '/anime/1' }, { provider: 'jikan', label: 'Episode metadata', path: '/anime/1/episodes' }, { provider: 'jikan', label: 'Calendar broadcasts', path: '/schedules' }, { provider: 'jikan', label: 'MAL rankings', path: '/top/anime' }] as const) {
      const { provider } = check;
      if (active.signal.aborted) break;
      try {
        if (check.label === 'Episode metadata') {
          const episodes = await fetchAnimeEpisodes('1', 1, { signal: active.signal });
          const saved = episodes.streamnyaa?.cached || episodes.streamnyaa?.status === 'stale';
          record({ label:check.label, status:saved ? 'Saved episode data' : 'Responding', action:saved ? 'Episode data is readable from cache. Live refresh is not confirmed.' : `${episodes.data.length} entries returned for the diagnostic sample. Other anime are resolved separately.` });
          continue;
        }
        const response = provider === 'anilist'
          ? await fetchAniList({ query: 'query { Media(id: 1, type: ANIME) { id idMal } }' }, 60, { signal: active.signal })
          : await fetchJikanPath(check.path, 60, { signal: active.signal });
        if (!response.ok) throw desktopDataError(provider, new Error('Provider unavailable'), response.status);
        const cached = response.headers.get('X-StreamNyaa-Local-Cache') || ['memory', 'disk', 'stale'].includes(response.headers.get('X-StreamNyaa-Desktop-Cache') || '');
        record({ label: check.label, status: cached ? 'Cached response' : 'Responding', action: cached ? 'Saved metadata is readable; this does not prove live provider access.' : 'This endpoint responded; other features are checked separately.' });
      } catch (issue) {
        const failure = desktopDataError(provider, issue);
        record({ label: check.label, status: failure.statusCode ? `HTTP ${failure.statusCode}` : failure.code === 'error' ? 'Endpoint unavailable' : failure.code,
          action: failure.code === 'access-denied' ? 'Access was declined. Other internet services may still work. Supported shelves can use the fallback.'
            : failure.code === 'rate-limited' ? 'Allow the provider cooldown to finish before checking again.'
            : failure.code === 'offline' ? 'Windows reports this device offline. Reconnect, then retry.'
            : failure.code === 'invalid' ? 'The provider returned an unreadable response. Retry later; this is not a confirmed connection problem.'
            : check.label === 'Episode metadata' ? 'Jikan could not return the episode list for the diagnostic sample. This does not mean all anime are unavailable. Open your anime: saved episode titles and numbered navigation remain usable. Retry this endpoint after cooldown.'
            : failure.code === 'timeout' || (failure.statusCode || 0) >= 500 ? 'The provider timed out or returned a server error. Retry later; other features may still work.'
            : 'This endpoint failed. Retry after cooldown or inspect the other checks to see which features still respond.' });
      }
    }
    if (!active.signal.aborted) setBusy(false);
  };
  const exportChecks = () => {
    const blob = new Blob([JSON.stringify({ version: 1, checkedAt: new Date().toISOString(), checks }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'streamnyaa-catalog-diagnostics.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label="Guided diagnostics" className="mt-5 border-t border-white/10 pt-4">
    <h3 className="font-semibold">Guided diagnostics</h3>
    <p className="mt-1 text-sm text-white/60">Check playback tools, details, episode lists, Calendar and rankings separately. No account data is sent.</p>
    <button disabled={busy} onClick={() => void run()} className="sn-secondary-action mt-3 w-full px-3 py-2 disabled:opacity-50">{busy ? 'Checking…' : 'Run checks'}</button>
    {checks.length > 0 && !busy && <button onClick={exportChecks} className="sn-secondary-action mt-2 w-full px-3 py-2">Export check results</button>}
    <ul className="mt-3 space-y-3" aria-live="polite">{checks.map(check => <li key={check.label}><p className="text-sm font-semibold">{check.label} · {check.status}</p><p className="mt-1 text-sm text-white/60">{check.action}</p></li>)}</ul>
  </section>;
}
