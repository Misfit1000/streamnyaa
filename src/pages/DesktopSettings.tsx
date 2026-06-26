import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, HardDrive, History, PlayCircle, RefreshCw, ServerCog, Square, Trash2 } from 'lucide-react';
import Seo from '../components/Seo';
import {
  buildDesktopDiagnosticsReport,
  clearLocalPlaybackHistory,
  clearDesktopPlaybackCache,
  controlLocalPlayer,
  copyDesktopDiagnosticsReport,
  DEFAULT_DESKTOP_AUDIO_PREFERENCE,
  DEFAULT_DESKTOP_AUTO_OPEN_BEST_SOURCE,
  DEFAULT_DESKTOP_AUTO_PLAY_NEXT_EPISODE,
  getDesktopDiagnostics,
  getDesktopRuntimeStatus,
  loadDesktopAutoPlayNextEpisode,
  loadDesktopAutoOpenBestSource,
  loadCachedDesktopRuntimeStatus,
  loadDesktopAudioPreference,
  loadDesktopPlaybackSettings,
  loadLocalPlaybackHistory,
  saveDesktopAutoOpenBestSource,
  saveDesktopAutoPlayNextEpisode,
  saveDesktopAudioPreference,
  saveDesktopPlaybackSettings,
  stopDesktopPlayback,
  subscribeLocalPlaybackHistory,
  type DesktopAudioPreference,
  type DesktopDiagnosticsStatus,
  type DesktopPlaybackSettings,
  type DesktopRuntimeStatus,
} from '../lib/desktop';

function formatBytes(bytes?: number | null) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export default function DesktopSettings() {
  const [settings, setSettings] = useState<DesktopPlaybackSettings>(() => loadDesktopPlaybackSettings());
  const [audioPreference, setAudioPreference] = useState<DesktopAudioPreference>(() => loadDesktopAudioPreference());
  const [autoOpenBestSource, setAutoOpenBestSource] = useState(() => loadDesktopAutoOpenBestSource());
  const [autoPlayNextEpisode, setAutoPlayNextEpisode] = useState(() => loadDesktopAutoPlayNextEpisode());
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(() => loadCachedDesktopRuntimeStatus());
  const [diagnostics, setDiagnostics] = useState<DesktopDiagnosticsStatus | null>(null);
  const [historyCount, setHistoryCount] = useState(() => loadLocalPlaybackHistory().length);
  const [message, setMessage] = useState<{ tone: 'neutral' | 'success' | 'error'; text: string } | null>(null);

  const refresh = async (includeDiagnostics = false, activeSettings = settings) => {
    try {
      const nextRuntime = await getDesktopRuntimeStatus(activeSettings);
      if (nextRuntime) setRuntime(nextRuntime);
      if (includeDiagnostics) {
        const nextDiagnostics = await getDesktopDiagnostics(activeSettings);
        if (nextDiagnostics) setDiagnostics(nextDiagnostics);
      }
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Desktop diagnostics could not be refreshed.' });
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => subscribeLocalPlaybackHistory(() => {
    setHistoryCount(loadLocalPlaybackHistory().length);
  }), []);

  const updateSetting = (key: keyof DesktopPlaybackSettings, value: string) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveDesktopPlaybackSettings(next);
  };

  const updateAudioPreference = (nextPreference: DesktopAudioPreference) => {
    setAudioPreference(nextPreference);
    saveDesktopAudioPreference(nextPreference);
    setMessage({ tone: 'success', text: 'Audio preference saved for new watch sessions.' });
  };

  const updateAutoOpenBestSource = (enabled: boolean) => {
    setAutoOpenBestSource(enabled);
    saveDesktopAutoOpenBestSource(enabled);
    setMessage({ tone: 'success', text: enabled ? 'Episode clicks now open the best source directly.' : 'Episode clicks now select first, then wait for your play action.' });
  };

  const updateAutoPlayNextEpisode = (enabled: boolean) => {
    setAutoPlayNextEpisode(enabled);
    saveDesktopAutoPlayNextEpisode(enabled);
    void controlLocalPlayer('auto_next_episode', enabled ? 1 : 0).catch(() => {
      // No active player is normal on the settings screen; the watch page syncs this on playback start.
    });
    setMessage({ tone: 'success', text: enabled ? 'Finished episodes will open the next available episode automatically.' : 'Finished episodes will wait for your next-episode action.' });
  };

  const clearStorage = async () => {
    try {
      const status = await clearDesktopPlaybackCache(settings);
      setMessage({ tone: 'success', text: `Playback cache cleared. Current usage: ${formatBytes(status.total_bytes)}.` });
      await refresh(true);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Playback cache could not be cleared.' });
    }
  };

  const clearWatchHistory = () => {
    clearLocalPlaybackHistory();
    setHistoryCount(0);
    setMessage({ tone: 'success', text: 'Watch history and Continue Watching entries were cleared.' });
  };

  const stopPlayback = async () => {
    try {
      const status = await stopDesktopPlayback(settings);
      setMessage({ tone: 'success', text: status.message || 'Playback was stopped.' });
      await refresh(true);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Playback could not be stopped.' });
    }
  };

  const copyDiagnostics = async () => {
    try {
      await copyDesktopDiagnosticsReport(diagnostics);
      setMessage({ tone: 'success', text: 'Diagnostics copied.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Diagnostics could not be copied.' });
    }
  };

  const ready = Boolean(runtime?.ready);
  const cache = diagnostics?.cache;
  const activeSession = diagnostics?.active_session;
  const diagnosticsSummary = buildDesktopDiagnosticsReport(diagnostics);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-7">
      <Seo title="Desktop Settings | StreamNyaa" description="StreamNyaa desktop streaming settings." canonicalPath="/desktop-settings" robots="noindex, nofollow" />

      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Desktop Streaming</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-white md:text-5xl">Playback setup</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
          StreamNyaa uses one persistent player window and one isolated torrent session at a time. Playback files stay inside your Temp folder and are cleaned on stream switch, cache clear, and app close.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <ServerCog className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-black text-white">Engine and player</h2>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-white/42">Torrent engine override</span>
              <input
                value={settings.torrent_engine_path}
                onChange={(event) => updateSetting('torrent_engine_path', event.target.value)}
                placeholder="Leave blank to use bundled engine"
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm font-bold text-white outline-none focus:border-primary/50"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-white/42">Native player override</span>
              <input
                value={settings.player_path}
                onChange={(event) => updateSetting('player_path', event.target.value)}
                placeholder="Leave blank to use bundled player"
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm font-bold text-white outline-none focus:border-primary/50"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs font-black uppercase tracking-wider text-white/42">Cache folder</span>
              <input
                value={settings.cache_dir}
                onChange={(event) => updateSetting('cache_dir', event.target.value)}
                placeholder="Auto: Temp\\StreamNyaa"
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm font-bold text-white outline-none focus:border-primary/50"
              />
            </label>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ['Global player', 'Single instance'],
              ['Session mode', 'One active stream'],
              ['Per-session guard', '3 GB target'],
              ['Global cache guard', '6 GB max'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <span className="block text-[11px] font-black uppercase tracking-wider text-white/34">{label}</span>
                <span className="mt-1 block text-sm font-black text-white">{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-black/25 p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-white/34">Pinned audio preference</p>
            <p className="mt-2 text-sm leading-6 text-white/54">
              New watch sessions start with this audio preference unless a specific watch link overrides it.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {([
                ['sub-preferred', 'Sub preferred'],
                ['dual-preferred', 'Dual Audio preferred'],
                ['dub-only', 'Dub only'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateAudioPreference(value)}
                  className={`rounded-2xl border px-4 py-3 text-sm font-black transition-colors ${
                    audioPreference === value
                      ? 'border-primary/60 bg-primary text-white'
                      : 'border-white/10 bg-black/35 text-white/70 hover:border-primary/40 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => updateAudioPreference(DEFAULT_DESKTOP_AUDIO_PREFERENCE)}
                className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-black text-white/52 transition-colors hover:border-primary/40 hover:text-white"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-black/25 p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-white/34">Episode click behavior</p>
            <p className="mt-2 text-sm leading-6 text-white/54">
              Choose whether episode cards should start playback immediately or only change the selected episode.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => updateAutoOpenBestSource(true)}
                className={`rounded-2xl border px-4 py-3 text-sm font-black transition-colors ${
                  autoOpenBestSource
                    ? 'border-primary/60 bg-primary text-white'
                    : 'border-white/10 bg-black/35 text-white/70 hover:border-primary/40 hover:text-white'
                }`}
              >
                Auto-open best source
              </button>
              <button
                type="button"
                onClick={() => updateAutoOpenBestSource(DEFAULT_DESKTOP_AUTO_OPEN_BEST_SOURCE)}
                className={`rounded-2xl border px-4 py-3 text-sm font-black transition-colors ${
                  !autoOpenBestSource
                    ? 'border-primary/60 bg-primary text-white'
                    : 'border-white/10 bg-black/35 text-white/70 hover:border-primary/40 hover:text-white'
                }`}
              >
                Select episode first
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-black/25 p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-white/34">Next episode behavior</p>
            <p className="mt-2 text-sm leading-6 text-white/54">
              The MPV player next button always opens the next aired episode. Automatic next episode only runs when this is enabled.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => updateAutoPlayNextEpisode(true)}
                className={`rounded-2xl border px-4 py-3 text-sm font-black transition-colors ${
                  autoPlayNextEpisode
                    ? 'border-primary/60 bg-primary text-white'
                    : 'border-white/10 bg-black/35 text-white/70 hover:border-primary/40 hover:text-white'
                }`}
              >
                Auto-play next episode
              </button>
              <button
                type="button"
                onClick={() => updateAutoPlayNextEpisode(DEFAULT_DESKTOP_AUTO_PLAY_NEXT_EPISODE)}
                className={`rounded-2xl border px-4 py-3 text-sm font-black transition-colors ${
                  !autoPlayNextEpisode
                    ? 'border-primary/60 bg-primary text-white'
                    : 'border-white/10 bg-black/35 text-white/70 hover:border-primary/40 hover:text-white'
                }`}
              >
                Ask before next episode
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-[1.4rem] border border-primary/25 bg-primary/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-black text-white">{ready ? 'Streaming stack ready' : 'Setup needed'}</p>
                <p className="mt-1 text-sm leading-6 text-white/56">{runtime?.message || 'Checking desktop playback status.'}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={() => void refresh(true)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-5 py-3 text-sm font-black text-white hover:border-primary/40">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button onClick={copyDiagnostics} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-5 py-3 text-sm font-black text-white hover:border-primary/40">
              <Copy className="h-4 w-4" />
              Copy diagnostics
            </button>
            <button onClick={stopPlayback} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-5 py-3 text-sm font-black text-white hover:border-primary/40">
              <Square className="h-4 w-4" />
              Stop playback
            </button>
            <button onClick={clearStorage} className="inline-flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-3 text-sm font-black text-primary hover:bg-primary hover:text-white">
              <Trash2 className="h-4 w-4" />
              Clear cache
            </button>
            <button onClick={clearWatchHistory} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-5 py-3 text-sm font-black text-white hover:border-primary/40">
              <History className="h-4 w-4" />
              Clear watch history
            </button>
          </div>

          {message ? (
            <p className={`mt-4 rounded-2xl border p-3 text-sm font-bold ${
              message.tone === 'error'
                ? 'border-red-400/20 bg-red-500/10 text-red-50/80'
                : message.tone === 'success'
                  ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-50/80'
                  : 'border-white/10 bg-black/25 text-white/58'
            }`}
            >
              {message.text}
            </p>
          ) : null}

          <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-black/25 p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-white/34">Diagnostics summary</p>
            <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-white/58">{diagnosticsSummary}</pre>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <PlayCircle className="h-5 w-5 text-primary" />
            <p className="mt-3 text-xs font-black uppercase tracking-wider text-white/42">Runtime</p>
            <p className="mt-1 text-lg font-black text-white">{ready ? 'Ready' : 'Not ready'}</p>
            <div className="mt-3 space-y-2 text-xs text-white/56">
              <p>Engine: <span className="font-mono text-white/75">{runtime?.torrent_engine_version || 'missing'}</span></p>
              <p>Native player: <span className="font-mono text-white/75">{runtime?.player_version || 'missing'}</span></p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <HardDrive className="h-5 w-5 text-primary" />
            <p className="mt-3 text-xs font-black uppercase tracking-wider text-white/42">Playback cache</p>
            <p className="mt-1 text-lg font-black text-white">{formatBytes(cache?.total_bytes)} / {formatBytes(cache?.max_bytes || 6 * 1024 * 1024 * 1024)}</p>
            <p className="mt-2 break-all text-xs leading-5 text-white/42">{runtime?.cache_dir || 'Temp\\StreamNyaa'}</p>
            {activeSession ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3 text-xs text-white/58">
                <p className="font-black text-white">Active session</p>
                <p className="mt-1 font-mono text-[11px]">{activeSession.torrent_id}</p>
                <p className="mt-1">Current cache: {formatBytes(activeSession.cache_bytes)}</p>
                {activeSession.media_url ? <p className="mt-1 break-all font-mono text-[11px] text-white/42">{activeSession.media_url}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <p className="text-xs font-black uppercase tracking-wider text-white/42">Diagnostics</p>
            <div className="mt-3 space-y-2 text-xs text-white/56">
              <p>App version: <span className="font-mono text-white/75">{diagnostics?.app_version || '0.1.0'}</span></p>
              <p>Cache pressure: <span className="font-mono text-white/75">{cache?.pressure || 'unknown'}</span></p>
              <p>Cached items: <span className="font-mono text-white/75">{cache?.file_count || 0}</span></p>
              <p>Watch history: <span className="font-mono text-white/75">{historyCount}</span></p>
              <p>Logs: <span className="font-mono text-white/75 break-all">{diagnostics?.logs_dir || 'Unavailable'}</span></p>
            </div>
            {diagnostics?.recent_errors?.length ? (
              <div className="mt-4 rounded-2xl border border-red-400/15 bg-red-500/10 p-3">
                <p className="text-[11px] font-black uppercase tracking-wider text-red-100/70">Recent error</p>
                <p className="mt-1 line-clamp-3 text-xs font-bold leading-5 text-red-50/72">{diagnostics.recent_errors[0]}</p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
