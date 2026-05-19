import { useEffect, useState } from 'react';
import { AlertTriangle, FolderOpen, HardDrive, MonitorPlay, RefreshCw, Settings, ShieldCheck, Trash2 } from 'lucide-react';
import Seo from '../components/Seo';
import {
  clearDesktopPlaybackCache,
  getDesktopCacheStatus,
  getDesktopDiagnostics,
  getDesktopRuntimeStatus,
  loadCachedDesktopRuntimeStatus,
  loadDesktopPlaybackSettings,
  openDesktopCacheFolder,
  prepareLocalPlayback,
  saveDesktopPlaybackSettings,
  testDesktopVlc,
  type DesktopCacheStatus,
  type DesktopDiagnosticsStatus,
  type DesktopPlaybackSettings,
  type DesktopRuntimeStatus,
} from '../lib/desktop';

function formatBytes(bytes = 0) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function pressureLabel(pressure?: string) {
  if (pressure === 'critical') return 'Critical space saver';
  if (pressure === 'low') return 'Low-space mode';
  if (pressure === 'guarded') return 'Guarded cache';
  return 'Normal cache';
}

export default function DesktopSettings() {
  const [settings, setSettings] = useState<DesktopPlaybackSettings>(() => loadDesktopPlaybackSettings());
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(() => loadCachedDesktopRuntimeStatus());
  const [cache, setCache] = useState<DesktopCacheStatus | null>(null);
  const [diagnostics, setDiagnostics] = useState<DesktopDiagnosticsStatus | null>(null);
  const [message, setMessage] = useState('');

  const refresh = async (nextSettings = settings, includeHeavy = false) => {
    const nextRuntime = await getDesktopRuntimeStatus(nextSettings);
    if (nextRuntime) setRuntime(nextRuntime);
    if (includeHeavy) {
      const [nextCache, nextDiagnostics] = await Promise.all([
        getDesktopCacheStatus(nextSettings),
        getDesktopDiagnostics(nextSettings),
      ]);
      if (nextCache) setCache(nextCache);
      if (nextDiagnostics) setDiagnostics(nextDiagnostics);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) void refresh(settings, false);
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const save = async () => {
    saveDesktopPlaybackSettings(settings);
    setMessage('Desktop settings saved.');
    await refresh(settings, true);
  };

  const testPlayer = async () => {
    const result = await testDesktopVlc(settings);
    setMessage(result.message);
    await refresh(settings, true);
  };

  const warmupPlayback = async () => {
    const result = await prepareLocalPlayback(settings);
    if (result) {
      setRuntime(result);
      setMessage(result.message);
    }
    await refresh(settings, true);
  };

  const openCache = async () => {
    await openDesktopCacheFolder(settings);
    setMessage('Cache folder opened.');
  };

  const clearCache = async () => {
    const nextCache = await clearDesktopPlaybackCache(settings);
    setCache(nextCache);
    setMessage('Playback storage cleared.');
  };

  const friendlyMessage = (value = '') => value
    .replace(/rqbit/gi, 'the local engine')
    .replace(/VLC/gi, 'VLC')
    .replace(/command or full executable path/gi, 'setup path')
    .replace(/commands are configured/gi, 'is ready');

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-7">
      <Seo title="Desktop Settings | StreamNyaa" description="StreamNyaa desktop playback settings." canonicalPath="/desktop-settings" robots="noindex, nofollow" />

      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Desktop</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-white md:text-5xl">Settings</h1>
        <p className="mt-2 text-sm text-white/48">Manage local playback, storage, and app readiness without leaving StreamNyaa.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-black text-white">Playback setup</h2>
          </div>
          <div className="mt-5 grid gap-4">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-white/42">Local playback engine path</span>
              <input
                value={settings.torrent_engine_path}
                onChange={(event) => setSettings((current) => ({ ...current, torrent_engine_path: event.target.value }))}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/28 focus:border-primary"
                placeholder="Auto"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-white/42">VLC player path</span>
              <input
                value={settings.vlc_path}
                onChange={(event) => setSettings((current) => ({ ...current, vlc_path: event.target.value, player_mode: 'vlc' }))}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/28 focus:border-primary"
                placeholder="Auto"
              />
              <span className="mt-1 block text-xs text-white/40">Leave this on Auto unless VLC is installed in a custom folder.</span>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-white/42">Storage folder</span>
              <input
                value={settings.cache_dir}
                onChange={(event) => setSettings((current) => ({ ...current, cache_dir: event.target.value }))}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/28 focus:border-primary"
                placeholder="Automatic storage folder"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={save} className="rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground hover:bg-primary/90">Save settings</button>
            <button onClick={testPlayer} className="rounded-2xl border border-white/10 bg-black/25 px-5 py-3 text-sm font-black text-white hover:border-primary/40">Test VLC</button>
            <button onClick={warmupPlayback} className="rounded-2xl border border-white/10 bg-black/25 px-5 py-3 text-sm font-black text-white hover:border-primary/40">Check readiness</button>
            <button onClick={openCache} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-5 py-3 text-sm font-black text-white hover:border-primary/40">
              <FolderOpen className="h-4 w-4" />
              Open storage
            </button>
            <button onClick={clearCache} className="inline-flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-3 text-sm font-black text-primary hover:bg-primary hover:text-white">
              <Trash2 className="h-4 w-4" />
              Clear storage
            </button>
          </div>
          {message ? <p className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm font-bold text-white/55">{friendlyMessage(message)}</p> : null}

          <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-black/25 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Advanced playback profile</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ['Preferred player', 'VLC external playback'],
                ['Hardware acceleration', 'VLC automatic decode'],
                ['Torrent mode', 'Sequential stream while downloading'],
                ['Subtitle renderer', 'VLC subtitle and track selector'],
                ['Audio handling', 'Multi-track anime release support'],
                ['Buffering strategy', 'Single-session stream cache'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-white/34">{label}</span>
                  <span className="mt-1 block text-sm font-bold text-white/72">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-black/25 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Playback storage</p>
                <p className="mt-1 text-sm text-white/52">Keep local episode cache under control before it fills the drive.</p>
              </div>
              <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-sm font-black text-white">
                {formatBytes(cache?.total_bytes || 0)} / {formatBytes(cache?.max_bytes || 10 * 1024 ** 3)}
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, ((cache?.total_bytes || 0) / (cache?.max_bytes || 10 * 1024 ** 3)) * 100)}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/40">
              <span>{cache?.file_count || 0} cached files. StreamNyaa clears the oldest cached files when this limit is crossed.</span>
              <span className={`rounded-full px-2.5 py-1 font-black ${
                cache?.pressure === 'critical'
                  ? 'bg-red-500/15 text-red-200'
                  : cache?.pressure === 'low'
                    ? 'bg-amber-500/15 text-amber-200'
                    : 'bg-white/[0.06] text-white/52'
              }`}>
                {pressureLabel(cache?.pressure)}
              </span>
            </div>
            <p className="mt-2 text-xs text-white/36">Free space on this drive: {cache?.free_bytes ? formatBytes(cache.free_bytes) : 'checking...'}</p>
            <div className="mt-4 space-y-2">
              {(cache?.entries || []).slice(0, 5).map((entry) => (
                <div key={entry.path} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
                  <span className="min-w-0 truncate text-xs font-bold text-white/62">{entry.name}</span>
                  <span className="shrink-0 text-xs font-black text-white/44">{formatBytes(entry.size_bytes)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="font-black text-white">Status</h2>
            </div>
            <div className="mt-4 space-y-2">
              {[
                ['Playback engine', runtime?.torrent_engine_configured],
                ['In-app player', runtime?.player_configured],
              ].map(([label, ready]) => (
                <div key={String(label)} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                  <span className="text-sm font-bold text-white">{label}</span>
                  <span className={ready ? 'text-xs font-black text-emerald-300' : 'text-xs font-black text-amber-300'}>{ready ? 'Ready' : 'Needed'}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-white/48">{friendlyMessage(runtime?.message || 'Checking local playback.')}</p>
            <button onClick={() => refresh(settings, true)} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-black text-white/70 hover:border-primary/40">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <HardDrive className="h-5 w-5 text-primary" />
            <p className="mt-3 text-xs font-black uppercase tracking-wider text-white/42">Storage folder</p>
            <p className="mt-1 break-all font-mono text-xs text-white/70">{runtime?.cache_dir || 'Automatic folder'}</p>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <p className="mt-3 text-xs font-black uppercase tracking-wider text-white/42">Diagnostics</p>
            <div className="mt-3 space-y-2 text-xs text-white/56">
              <p>App version: <span className="font-mono text-white/75">{diagnostics?.app_version || '0.1.0'}</span></p>
              <p>Engine: <span className="font-mono text-white/75">{runtime?.torrent_engine_version || 'not detected'}</span></p>
              <p>Player: <span className="font-mono text-white/75">{runtime?.player_version || 'not detected'}</span></p>
              <p>Storage: <span className="font-mono text-white/75">{formatBytes(cache?.total_bytes || 0)}</span></p>
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <MonitorPlay className="h-5 w-5 text-primary" />
            <p className="mt-3 text-xs font-black uppercase tracking-wider text-white/42">Player readiness</p>
            <p className="mt-1 text-sm font-black text-white">{runtime?.player_configured ? 'Ready' : 'Not detected yet'}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
