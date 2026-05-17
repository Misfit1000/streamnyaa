import { useEffect, useState } from 'react';
import { FolderOpen, HardDrive, MonitorPlay, RefreshCw, Settings, ShieldCheck } from 'lucide-react';
import Seo from '../components/Seo';
import {
  getDesktopRuntimeStatus,
  loadDesktopPlaybackSettings,
  openDesktopCacheFolder,
  saveDesktopPlaybackSettings,
  testDesktopMpv,
  type DesktopPlaybackSettings,
  type DesktopRuntimeStatus,
} from '../lib/desktop';

export default function DesktopSettings() {
  const [settings, setSettings] = useState<DesktopPlaybackSettings>(() => loadDesktopPlaybackSettings());
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(null);
  const [message, setMessage] = useState('');

  const refresh = async (nextSettings = settings) => {
    const nextRuntime = await getDesktopRuntimeStatus(nextSettings);
    if (nextRuntime) setRuntime(nextRuntime);
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    saveDesktopPlaybackSettings(settings);
    setMessage('Desktop settings saved.');
    await refresh(settings);
  };

  const testPlayer = async () => {
    const result = await testDesktopMpv(settings);
    setMessage(result.message);
    await refresh(settings);
  };

  const openCache = async () => {
    await openDesktopCacheFolder(settings);
    setMessage('Cache folder opened.');
  };

  const friendlyMessage = (value = '') => value
    .replace(/rqbit/gi, 'the local engine')
    .replace(/MPV/gi, 'the local player')
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
              <span className="text-xs font-black uppercase tracking-wider text-white/42">Local player helper path</span>
              <input
                value={settings.mpv_path}
                onChange={(event) => setSettings((current) => ({ ...current, mpv_path: event.target.value }))}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/28 focus:border-primary"
                placeholder="Auto"
              />
              <span className="mt-1 block text-xs text-white/40">Leave this on Auto unless you installed your player helper in a custom folder.</span>
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
            <button onClick={testPlayer} className="rounded-2xl border border-white/10 bg-black/25 px-5 py-3 text-sm font-black text-white hover:border-primary/40">Test player</button>
            <button onClick={openCache} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-5 py-3 text-sm font-black text-white hover:border-primary/40">
              <FolderOpen className="h-4 w-4" />
              Open storage
            </button>
          </div>
          {message ? <p className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm font-bold text-white/55">{friendlyMessage(message)}</p> : null}

          <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-black/25 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Advanced playback profile</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ['Preferred engine', 'Native preview with compatibility fallback'],
                ['Hardware acceleration', 'Auto-safe GPU decode'],
                ['Torrent mode', 'Sequential stream while downloading'],
                ['Subtitle renderer', 'ASS/SRT with embedded font support'],
                ['Audio handling', 'Multi-track anime release support'],
                ['Buffering strategy', '25s playback cache with 60s read-ahead'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-white/34">{label}</span>
                  <span className="mt-1 block text-sm font-bold text-white/72">{value}</span>
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
            <button onClick={() => refresh()} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-black text-white/70 hover:border-primary/40">
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
            <MonitorPlay className="h-5 w-5 text-primary" />
            <p className="mt-3 text-xs font-black uppercase tracking-wider text-white/42">Player readiness</p>
            <p className="mt-1 text-sm font-black text-white">{runtime?.player_configured ? 'Ready' : 'Not detected yet'}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
