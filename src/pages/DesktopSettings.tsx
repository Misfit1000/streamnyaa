import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Download, HardDrive, History, PlayCircle, RefreshCw, ServerCog, ShieldCheck, Square, Trash2, Upload } from 'lucide-react';
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
  exportDesktopSettingsBackup,
  getDesktopDiagnostics,
  getDesktopRuntimeStatus,
  importDesktopSettingsBackup,
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

function statusTone(ready: boolean) {
  return ready
    ? 'border-emerald-300/18 bg-emerald-400/10 text-emerald-100'
    : 'border-amber-300/18 bg-amber-400/10 text-amber-100';
}

function PreferenceCard({
  title,
  description,
  checked,
  onChange,
  enabledLabel,
  disabledLabel,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  enabledLabel: string;
  disabledLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="sn-card-hover sn-glass-card group flex w-full items-center justify-between gap-4 rounded-[1.35rem] p-4 text-left transition-all"
      aria-pressed={checked}
    >
      <span className="min-w-0">
        <span className="block text-base font-black text-white">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-white/52">{description}</span>
        <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${checked ? 'bg-primary text-white' : 'bg-white/8 text-white/58'}`}>
          {checked ? enabledLabel : disabledLabel}
        </span>
      </span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${checked ? 'bg-primary shadow-lg shadow-primary/25' : 'bg-white/12'}`}>
        <span className={`block h-6 w-6 rounded-full bg-white shadow-lg transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}

function SectionHeader({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary shadow-lg shadow-primary/10">
        {icon}
      </span>
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-white">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-white/54">{description}</p>
      </div>
    </div>
  );
}

function SupportRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] py-3 last:border-b-0">
      <span className="text-sm font-bold text-white/48">{label}</span>
      <span className="max-w-[62%] break-words text-right text-sm font-bold text-white/78">{value}</span>
    </div>
  );
}

export default function DesktopSettings() {
  const [settings, setSettings] = useState<DesktopPlaybackSettings>(() => loadDesktopPlaybackSettings());
  const [audioPreference, setAudioPreference] = useState<DesktopAudioPreference>(() => loadDesktopAudioPreference());
  const [autoOpenBestSource, setAutoOpenBestSource] = useState(() => loadDesktopAutoOpenBestSource());
  const [autoPlayNextEpisode, setAutoPlayNextEpisode] = useState(() => loadDesktopAutoPlayNextEpisode());
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(() => loadCachedDesktopRuntimeStatus());
  const [diagnostics, setDiagnostics] = useState<DesktopDiagnosticsStatus | null>(null);
  const [historyCount, setHistoryCount] = useState(() => loadLocalPlaybackHistory().length);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: 'neutral' | 'success' | 'error'; text: string } | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = async (includeDiagnostics = false, activeSettings = settings) => {
    try {
      const nextRuntime = await getDesktopRuntimeStatus(activeSettings);
      if (nextRuntime) setRuntime(nextRuntime);
      if (includeDiagnostics) {
        const nextDiagnostics = await getDesktopDiagnostics(activeSettings);
        if (nextDiagnostics) setDiagnostics(nextDiagnostics);
      }
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Settings status could not be refreshed.' });
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
    setMessage({ tone: 'success', text: 'Audio preference saved.' });
  };

  const updateAutoOpenBestSource = (enabled: boolean) => {
    setAutoOpenBestSource(enabled);
    saveDesktopAutoOpenBestSource(enabled);
    setMessage({ tone: 'success', text: enabled ? 'Episodes will start the best source automatically.' : 'Episodes will wait for you to press play.' });
  };

  const updateAutoPlayNextEpisode = (enabled: boolean) => {
    setAutoPlayNextEpisode(enabled);
    saveDesktopAutoPlayNextEpisode(enabled);
    void controlLocalPlayer('auto_next_episode', enabled ? 1 : 0).catch(() => {
      // The player may be closed while users change settings.
    });
    setMessage({ tone: 'success', text: enabled ? 'Auto-play next episode is on.' : 'Auto-play next episode is off.' });
  };

  const clearStorage = async () => {
    try {
      const status = await clearDesktopPlaybackCache(settings);
      setMessage({ tone: 'success', text: `Temporary playback files cleared. Current usage: ${formatBytes(status.total_bytes)}.` });
      await refresh(true);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Temporary playback files could not be cleared.' });
    }
  };

  const clearWatchHistory = () => {
    clearLocalPlaybackHistory();
    setHistoryCount(0);
    setMessage({ tone: 'success', text: 'Watch history and Continue Watching were cleared.' });
  };

  const exportSettings = () => {
    try {
      const payload = exportDesktopSettingsBackup();
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `streamnyaa-desktop-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage({ tone: 'success', text: 'Desktop settings backup saved.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Desktop settings could not be exported.' });
    }
  };

  const importSettings = async (file?: File) => {
    if (!file) return;
    try {
      const imported = importDesktopSettingsBackup(await file.text());
      setSettings(loadDesktopPlaybackSettings());
      setAudioPreference(loadDesktopAudioPreference());
      setAutoOpenBestSource(loadDesktopAutoOpenBestSource());
      setAutoPlayNextEpisode(loadDesktopAutoPlayNextEpisode());
      setHistoryCount(loadLocalPlaybackHistory().length);
      setMessage({ tone: 'success', text: `Imported ${imported} desktop setting group${imported === 1 ? '' : 's'}.` });
      await refresh(true, loadDesktopPlaybackSettings());
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Desktop settings backup could not be imported.' });
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  const stopPlayback = async () => {
    try {
      const status = await stopDesktopPlayback(settings);
      setMessage({ tone: 'success', text: status.message || 'Playback stopped.' });
      await refresh(true);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Playback could not be stopped.' });
    }
  };

  const copyDiagnostics = async () => {
    try {
      await copyDesktopDiagnosticsReport(diagnostics);
      setMessage({ tone: 'success', text: 'Support report copied.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Support report could not be copied.' });
    }
  };

  const ready = Boolean(runtime?.ready);
  const cache = diagnostics?.cache;
  const activeSession = diagnostics?.active_session;
  const diagnosticsSummary = buildDesktopDiagnosticsReport(diagnostics);
  const cacheLimit = cache?.max_bytes || 6 * 1024 * 1024 * 1024;
  const cachePercent = cacheLimit ? Math.min(100, Math.round(((cache?.total_bytes || 0) / cacheLimit) * 100)) : 0;

  return (
    <div className="sn-page mx-auto max-w-7xl py-6">
      <Seo title="Settings | StreamNyaa Desktop" description="StreamNyaa desktop settings." canonicalPath="/desktop-settings" robots="noindex, nofollow" />

      <section className="sn-hero-panel overflow-hidden p-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Settings</p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.04em] text-white md:text-5xl">Make StreamNyaa feel right.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/56">
              Control playback, temporary storage, watch history, and app health from one simple place.
            </p>
          </div>
          <div className={`rounded-2xl border px-4 py-3 shadow-lg ${statusTone(ready)}`}>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5" />
              <div>
                <p className="text-sm font-black">{ready ? 'Ready to stream' : 'Needs attention'}</p>
                <p className="mt-0.5 max-w-[320px] text-xs font-bold opacity-75">{runtime?.message || 'Checking playback status...'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {message ? (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold shadow-lg ${
            message.tone === 'error'
              ? 'border-red-400/25 bg-red-500/10 text-red-100 shadow-red-950/20'
              : message.tone === 'success'
                ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100 shadow-emerald-950/20'
                : 'border-white/12 bg-white/[0.06] text-white/78 shadow-black/20'
          }`}
          role="status"
          aria-live="polite"
        >
          {message.text}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="sn-glass-card rounded-[1.6rem] p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/34">Playback</p>
          <p className="mt-2 text-2xl font-black text-white">{ready ? 'Ready' : 'Check setup'}</p>
          <p className="mt-1 text-sm text-white/50">Native player and streaming engine status.</p>
        </div>
        <div className="sn-glass-card rounded-[1.6rem] p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/34">Temporary files</p>
          <p className="mt-2 text-2xl font-black text-white">{formatBytes(cache?.total_bytes)}</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-primary" style={{ width: `${cachePercent}%` }} />
          </div>
        </div>
        <div className="sn-glass-card rounded-[1.6rem] p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/34">Watch history</p>
          <p className="mt-2 text-2xl font-black text-white">{historyCount} item{historyCount === 1 ? '' : 's'}</p>
          <p className="mt-1 text-sm text-white/50">Used for Continue Watching and resume points.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_380px]">
        <main className="space-y-5">
          <section className="sn-glass-panel p-5">
            <SectionHeader
              icon={<PlayCircle className="h-5 w-5" />}
              eyebrow="Watching"
              title="Playback preferences"
              description="Choose how episodes start, continue, and pick audio. These are the settings most viewers use."
            />

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <PreferenceCard
                title="Auto-open best source"
                description="When you choose an episode, StreamNyaa can open the best ranked source right away."
                checked={autoOpenBestSource}
                onChange={updateAutoOpenBestSource}
                enabledLabel="Instant play"
                disabledLabel="Ask first"
              />
              <PreferenceCard
                title="Auto-play next episode"
                description="When an episode ends, the next aired episode can start without another click."
                checked={autoPlayNextEpisode}
                onChange={updateAutoPlayNextEpisode}
                enabledLabel="Auto next"
                disabledLabel="Manual next"
              />
            </div>

            <div className="sn-glass-card mt-5 rounded-[1.35rem] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-black text-white">Preferred audio</p>
                  <p className="mt-1 text-sm leading-6 text-white/52">This guides source ranking before playback starts.</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateAudioPreference(DEFAULT_DESKTOP_AUDIO_PREFERENCE)}
                  className="sn-secondary-action h-10 px-4 text-xs"
                >
                  Reset
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {([
                  ['sub-preferred', 'Sub preferred', 'Prioritize Japanese audio with subtitles.'],
                  ['dual-preferred', 'Dual Audio', 'Prefer releases with both sub and dub.'],
                  ['dub-only', 'Dub only', 'Look for English dub sources first.'],
                ] as const).map(([value, label, helper]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateAudioPreference(value)}
                    className={`rounded-2xl p-4 text-left transition-all ${
                      audioPreference === value
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-white/[0.055] text-white/68 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <span className="block text-sm font-black">{label}</span>
                    <span className="mt-1 block text-xs leading-5 opacity-70">{helper}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="sn-glass-panel p-5">
            <SectionHeader
              icon={<HardDrive className="h-5 w-5" />}
              eyebrow="Storage"
              title="Temporary files and cleanup"
              description="Streaming uses temporary files while an episode is open. StreamNyaa cleans them automatically, and you can clear them manually anytime."
            />

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px]">
              <div className="sn-glass-card rounded-[1.35rem] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-base font-black text-white">Current temporary usage</p>
                    <p className="mt-1 break-all text-sm leading-6 text-white/48">{runtime?.cache_dir || 'Windows Temp\\StreamNyaa'}</p>
                  </div>
                  <p className="text-xl font-black text-white">{formatBytes(cache?.total_bytes)}</p>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${cachePercent}%` }} />
                </div>
                <p className="mt-3 text-xs font-bold text-white/42">Limit shown: {formatBytes(cacheLimit)}. Cache pressure: {cache?.pressure || 'unknown'}.</p>
              </div>
              <div className="grid gap-3">
                <button onClick={clearStorage} className="sn-primary-action h-12 px-5 text-sm">
                  <Trash2 className="h-4 w-4" />
                  Clear temp files
                </button>
                <button onClick={stopPlayback} className="sn-secondary-action h-12 px-5 text-sm">
                  <Square className="h-4 w-4" />
                  Stop stream
                </button>
              </div>
            </div>
          </section>

          <section className="sn-glass-panel p-5">
            <SectionHeader
              icon={<History className="h-5 w-5" />}
              eyebrow="Privacy"
              title="Local watch data"
              description="History is stored on this device and powers Continue Watching. Clearing it does not affect the app install."
            />

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[1.35rem] bg-white/[0.045] p-4">
              <div>
                <p className="text-base font-black text-white">{historyCount} saved history item{historyCount === 1 ? '' : 's'}</p>
                <p className="mt-1 text-sm text-white/50">Resume progress, recent sources, and Continue Watching entries.</p>
              </div>
              <button onClick={clearWatchHistory} className="sn-secondary-action h-12 px-5 text-sm">
                <Trash2 className="h-4 w-4" />
                Clear history
              </button>
            </div>

            <div className="mt-4 rounded-[1.35rem] bg-white/[0.045] p-4">
              <input
                ref={backupInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void importSettings(event.target.files?.[0])}
              />
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-base font-black text-white">Backup local desktop data</p>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-white/50">
                    Export or restore playback preferences, local history, Continue Watching, and reminders for this desktop app.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={exportSettings} className="sn-secondary-action h-11 px-4 text-sm">
                    <Download className="h-4 w-4" />
                    Export desktop settings
                  </button>
                  <button type="button" onClick={() => backupInputRef.current?.click()} className="sn-primary-action h-11 px-4 text-sm">
                    <Upload className="h-4 w-4" />
                    Import desktop settings
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="sn-glass-panel p-5">
            <button
              type="button"
              onClick={() => setAdvancedOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-4 text-left"
              aria-expanded={advancedOpen}
            >
              <SectionHeader
                icon={<ServerCog className="h-5 w-5" />}
                eyebrow="Support"
                title="Advanced app paths"
                description="Most users should leave these on Auto. Change them only if your bundled player or storage path needs a custom location."
              />
              <span className="rounded-full bg-white/8 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/62">
                {advancedOpen ? 'Hide' : 'Show'}
              </span>
            </button>

            {advancedOpen ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-wider text-white/42">Streaming engine path</span>
                  <input
                    value={settings.torrent_engine_path}
                    onChange={(event) => updateSetting('torrent_engine_path', event.target.value)}
                    placeholder="Auto"
                    className="sn-input mt-2 h-12 w-full px-4"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-wider text-white/42">Player path</span>
                  <input
                    value={settings.player_path}
                    onChange={(event) => updateSetting('player_path', event.target.value)}
                    placeholder="Auto"
                    className="sn-input mt-2 h-12 w-full px-4"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-xs font-black uppercase tracking-wider text-white/42">Temporary file folder</span>
                  <input
                    value={settings.cache_dir}
                    onChange={(event) => updateSetting('cache_dir', event.target.value)}
                    placeholder="Auto: Windows Temp\\StreamNyaa"
                    className="sn-input mt-2 h-12 w-full px-4"
                  />
                </label>
              </div>
            ) : null}
          </section>
        </main>

        <aside className="space-y-5">
          <section className="sn-glass-card rounded-[2rem] p-5">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <p className="mt-3 text-xs font-black uppercase tracking-wider text-white/42">App health</p>
            <p className="mt-1 text-2xl font-black text-white">{ready ? 'Ready' : 'Needs attention'}</p>
            <p className="mt-2 text-sm leading-6 text-white/52">{runtime?.message || 'Checking playback status...'}</p>
            <div className="mt-4 grid gap-2">
              <button onClick={() => void refresh(true)} className="sn-secondary-action h-11 px-4 text-sm">
                <RefreshCw className="h-4 w-4" />
                Refresh status
              </button>
              <button onClick={copyDiagnostics} className="sn-secondary-action h-11 px-4 text-sm">
                <Copy className="h-4 w-4" />
                Copy support report
              </button>
            </div>
          </section>

          <section className="sn-glass-card rounded-[2rem] p-5">
            <p className="text-xs font-black uppercase tracking-wider text-white/42">Support details</p>
            <div className="mt-3">
              <SupportRow label="App version" value={diagnostics?.app_version || '0.1.1'} />
              <SupportRow label="Player" value={runtime?.player_version || 'Auto'} />
              <SupportRow label="Engine" value={runtime?.torrent_engine_version || 'Auto'} />
              <SupportRow label="Temp usage" value={`${formatBytes(cache?.total_bytes)} / ${formatBytes(cacheLimit)}`} />
              <SupportRow label="Saved history" value={historyCount} />
              {activeSession ? <SupportRow label="Active stream" value={formatBytes(activeSession.cache_bytes)} /> : null}
            </div>
            {diagnostics?.recent_errors?.length ? (
              <div className="mt-4 rounded-2xl border border-red-400/15 bg-red-500/10 p-3">
                <p className="text-[11px] font-black uppercase tracking-wider text-red-100/70">Recent problem</p>
                <p className="mt-1 line-clamp-3 text-xs font-bold leading-5 text-red-50/72">{diagnostics.recent_errors[0]}</p>
              </div>
            ) : null}
          </section>

          <details className="sn-glass-card rounded-[2rem] p-5">
            <summary className="cursor-pointer text-sm font-black text-white">Full support report</summary>
            <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-black/35 p-3 text-xs leading-6 text-white/58">
              {diagnosticsSummary}
            </pre>
          </details>
        </aside>
      </div>
    </div>
  );
}
