import { useState } from 'react';
import { Play, X } from 'lucide-react';
import { clearInterruptedPlayback, readInterruptedPlayback, interruptedSourceKey } from '../lib/desktopInterruptedSession';
import { loadLocalPlaybackHistory, openLocalSourceNow, resolveDesktopPlaybackCheckpoint, formatPlaybackTime } from '../lib/desktop';

// Capture once at application startup, never from a currently running stream
// when the user navigates between pages.
const launchMarker = readInterruptedPlayback();
let dismissedForLaunch = false;
export default function DesktopSessionRecovery() {
  const [dismissed, setDismissed] = useState(dismissedForLaunch);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const source = launchMarker && loadLocalPlaybackHistory().find(item =>
    String(item.animeId || item.animeTitle) === launchMarker.animeId && String(item.episode) === launchMarker.episode
    && (!launchMarker.sourceKey || interruptedSourceKey(item) === launchMarker.sourceKey));
  const checkpoint = launchMarker?.positionSeconds !== undefined ? {
    positionSeconds: launchMarker.positionSeconds,
    durationSeconds: launchMarker.durationSeconds || 0,
    completed: !!launchMarker.durationSeconds && launchMarker.positionSeconds / launchMarker.durationSeconds >= 0.95,
  } : source ? resolveDesktopPlaybackCheckpoint(source) : null;
  if (dismissed || !source || checkpoint?.completed || !checkpoint || checkpoint.positionSeconds <= 0) return null;
  const dismiss = () => { dismissedForLaunch = true; setDismissed(true); if (launchMarker) clearInterruptedPlayback(launchMarker); };
  const resume = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await openLocalSourceNow({ ...source, resumeSeconds: checkpoint.positionSeconds,
        durationSeconds: checkpoint.durationSeconds, progressUpdatedAt: Date.now(), completed: false });
      if (!result.ok) throw new Error(result.message || 'Playback could not resume.');
      // New playback will write its own interruption marker from real progress.
      dismiss();
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Playback could not resume. Your progress is saved.'); }
    finally { setBusy(false); }
  };
  return <section aria-label="Resume interrupted playback" className="mx-5 mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-4">
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">Continue your last session?</h2>
        <p className="mt-1 text-sm text-white/65">{source.animeTitle || source.title} · Episode {source.episode} · {formatPlaybackTime(checkpoint.positionSeconds)}</p>
      </div>
      <button disabled={busy} onClick={() => void resume()} className="sn-primary-action px-4 py-2 disabled:opacity-50"><Play className="h-4 w-4" />{busy ? 'Opening…' : 'Resume'}</button>
      <button disabled={busy} onClick={dismiss} aria-label="Dismiss interrupted session" className="sn-icon-action h-10 w-10"><X className="h-4 w-4" /></button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
  </section>;
}
