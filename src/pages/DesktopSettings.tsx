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

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <Seo title="Desktop Settings | StreamNyaa" description="StreamNyaa desktop playback settings." canonicalPath="/desktop-settings" robots="noindex, nofollow" />

      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Desktop</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage local playback tools, cache location, and player detection.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border border-border bg-[var(--glass)] p-5">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-black text-foreground">Playback tools</h2>
          </div>
          <div className="mt-5 grid gap-4">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">rqbit command/path</span>
              <input
                value={settings.torrent_engine_path}
                onChange={(event) => setSettings((current) => ({ ...current, torrent_engine_path: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm font-bold text-foreground outline-none focus:border-primary"
                placeholder="rqbit"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">MPV command/path</span>
              <input
                value={settings.mpv_path}
                onChange={(event) => setSettings((current) => ({ ...current, mpv_path: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm font-bold text-foreground outline-none focus:border-primary"
                placeholder="mpv"
              />
              <span className="mt-1 block text-xs text-muted-foreground">Leave this as `mpv` for automatic Program Files detection on Windows.</span>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Cache folder</span>
              <input
                value={settings.cache_dir}
                onChange={(event) => setSettings((current) => ({ ...current, cache_dir: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm font-bold text-foreground outline-none focus:border-primary"
                placeholder="Leave blank for system temp"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={save} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90">Save settings</button>
            <button onClick={testPlayer} className="rounded-xl border border-border bg-background/55 px-5 py-2.5 text-sm font-black text-foreground hover:border-primary/40">Test MPV</button>
            <button onClick={openCache} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/55 px-5 py-2.5 text-sm font-black text-foreground hover:border-primary/40">
              <FolderOpen className="h-4 w-4" />
              Open cache
            </button>
          </div>
          {message ? <p className="mt-4 rounded-xl border border-border bg-background/45 p-3 text-sm font-bold text-muted-foreground">{message}</p> : null}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="font-black text-foreground">Status</h2>
            </div>
            <div className="mt-4 space-y-2">
              {[
                ['rqbit', runtime?.torrent_engine_configured],
                ['MPV', runtime?.player_configured],
              ].map(([label, ready]) => (
                <div key={String(label)} className="flex items-center justify-between rounded-xl border border-border bg-background/45 px-3 py-2">
                  <span className="text-sm font-bold text-foreground">{label}</span>
                  <span className={ready ? 'text-xs font-black text-emerald-300' : 'text-xs font-black text-amber-300'}>{ready ? 'Ready' : 'Needed'}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{runtime?.message || 'Checking local tools.'}</p>
            <button onClick={() => refresh()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground hover:border-primary/40">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
            <HardDrive className="h-5 w-5 text-primary" />
            <p className="mt-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Cache folder</p>
            <p className="mt-1 break-all font-mono text-xs text-foreground">{runtime?.cache_dir || 'System temp folder'}</p>
          </div>
          <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
            <MonitorPlay className="h-5 w-5 text-primary" />
            <p className="mt-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Detected player</p>
            <p className="mt-1 break-all font-mono text-xs text-foreground">{runtime?.player_path || runtime?.player_version || 'Not detected yet'}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
