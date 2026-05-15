import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, HardDrive, Loader2, MonitorPlay, Play, RotateCcw } from 'lucide-react';
import Seo from '../components/Seo';
import {
  getDesktopRuntimeStatus,
  isDesktopApp,
  loadDesktopPlaybackSettings,
  loadLocalPlaybackSource,
  saveDesktopPlaybackSettings,
  startLocalPlaybackWithSettings,
  type DesktopPlaybackSettings,
  type DesktopRuntimeStatus,
} from '../lib/desktop';

export default function LocalPlayer() {
  const desktop = isDesktopApp();
  const source = useMemo(() => loadLocalPlaybackSource(), []);
  const [status, setStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(null);
  const [settings, setSettings] = useState<DesktopPlaybackSettings>(() => loadDesktopPlaybackSettings());

  const refreshRuntime = async (nextSettings = settings) => {
    const nextRuntime = await getDesktopRuntimeStatus(nextSettings);
    if (nextRuntime) setRuntime(nextRuntime);
  };

  useEffect(() => {
    let cancelled = false;
    if (!desktop) return undefined;

    getDesktopRuntimeStatus(settings)
      .then((nextRuntime) => {
        if (!cancelled && nextRuntime) setRuntime(nextRuntime);
      })
      .catch(() => {
        if (!cancelled) {
          setRuntime({
            ready: false,
            torrent_engine_configured: false,
            player_configured: false,
            cache_dir: '',
            message: 'Desktop runtime status could not be read yet.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktop]);

  const start = async () => {
    if (!source) {
      setStatus('error');
      setMessage('No local playback source was selected. Go back to downloads and choose Play locally.');
      return;
    }
    setStatus('starting');
    setMessage('Starting local torrent engine...');
    try {
      const result = await startLocalPlaybackWithSettings(source, settings);
      setStatus(result.ok ? 'ready' : 'error');
      setMessage(result.message || 'Local playback request sent to the desktop engine.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Desktop playback could not start.');
    }
  };

  const saveSettings = async () => {
    saveDesktopPlaybackSettings(settings);
    setStatus('idle');
    setMessage('Desktop playback settings saved.');
    await refreshRuntime(settings);
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <Seo
        title="Local Desktop Player | StreamNyaa"
        description="StreamNyaa desktop local torrent playback screen."
        canonicalPath="/local-player"
        robots="noindex, nofollow"
      />

      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-primary">Home</Link>
        <span>/</span>
        <Link to="/nyaa" className="hover:text-primary">Downloads</Link>
        <span>/</span>
        <span className="text-foreground">Local Player</span>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="relative aspect-video overflow-hidden rounded-[24px] border border-[var(--glass-border)] bg-[#050507] shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,29,72,0.18),transparent_38%),#050507]" />
            <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-wrap gap-2">
              <span className="rounded-full border border-primary/25 bg-black/55 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-primary backdrop-blur">
                Desktop local player
              </span>
              <span className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[11px] font-bold text-white/80 backdrop-blur">
                No web streaming provider
              </span>
            </div>

            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
              {!desktop ? (
                <>
                  <AlertTriangle className="h-12 w-12 text-primary" />
                  <h1 className="mt-4 text-2xl font-black text-white">Desktop app required</h1>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-white/65">
                    Local torrent playback needs the StreamNyaa desktop app because browsers cannot run the local torrent engine or MPV layer.
                  </p>
                </>
              ) : status === 'starting' ? (
                <>
                  <Loader2 className="h-14 w-14 animate-spin text-primary" />
                  <h1 className="mt-4 text-2xl font-black text-white">Starting local playback</h1>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-white/65">{message}</p>
                </>
              ) : status === 'ready' ? (
                <>
                  <CheckCircle2 className="h-14 w-14 text-primary" />
                  <h1 className="mt-4 text-2xl font-black text-white">Playback request sent</h1>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-white/65">{message}</p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={start}
                    disabled={!source}
                    className="rounded-full border border-primary/30 bg-primary/20 p-7 text-primary shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Play className="ml-1 h-14 w-14 fill-current" />
                  </button>
                  <h1 className="mt-5 text-2xl font-black text-white">{source ? 'Play locally' : 'No source selected'}</h1>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-white/65">
                    {runtime && !runtime.ready
                      ? runtime.message
                      : source
                      ? 'The desktop app will pass this source to the local torrent engine and open it in the local video player.'
                      : 'Open a source from the desktop download page first.'}
                  </p>
                </>
              )}
            </div>
          </div>

          {message && status === 'error' ? (
            <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm leading-6 text-red-200">
              {message}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/nyaa" className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/55 px-4 py-2.5 text-sm font-black text-foreground hover:border-primary/40">
              <RotateCcw className="h-4 w-4" />
              Back to downloads
            </Link>
            {source?.magnet ? (
              <a href={source.magnet} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90">
                <Download className="h-4 w-4" />
                Open source link
              </a>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)] p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <MonitorPlay className="h-5 w-5" />
              </span>
              <div>
                <p className="font-black text-foreground">Selected source</p>
                <p className="text-xs text-muted-foreground">Local desktop playback queue</p>
              </div>
            </div>
            {source ? (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Title</p>
                  <p className="mt-1 line-clamp-3 text-sm font-bold text-foreground">{source.title}</p>
                </div>
                {source.animeTitle ? (
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Anime</p>
                    <p className="mt-1 text-sm font-bold text-foreground">{source.animeTitle}</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 text-xs font-black uppercase">
                  {source.episode ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">Ep {source.episode}</span> : null}
                  {source.size ? <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">{source.size}</span> : null}
                  {source.seeders ? <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-400">{source.seeders} seeders</span> : null}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-muted-foreground">No source has been selected for local playback yet.</p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)] p-5">
            <div className="flex items-center gap-2 font-black text-foreground">
              <HardDrive className="h-4 w-4 text-primary" />
              Desktop runtime
            </div>
            {runtime ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <span className={`rounded-xl border px-3 py-2 text-xs font-black ${runtime.torrent_engine_configured ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-border bg-background/45 text-muted-foreground'}`}>
                    Engine {runtime.torrent_engine_configured ? 'ready' : 'missing'}
                  </span>
                  <span className={`rounded-xl border px-3 py-2 text-xs font-black ${runtime.player_configured ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-border bg-background/45 text-muted-foreground'}`}>
                    MPV {runtime.player_configured ? 'ready' : 'missing'}
                  </span>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{runtime.message}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                This screen is ready for Tauri to connect a local torrent engine and MPV playback. Web users still get download/source search only.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)] p-5">
            <h2 className="font-black text-foreground">Local playback settings</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Use `webtorrent` and `mpv` when both commands are available in PATH, or paste the full executable paths.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">WebTorrent command/path</span>
                <input
                  value={settings.torrent_engine_path}
                  onChange={(event) => setSettings((current) => ({ ...current, torrent_engine_path: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm font-bold text-foreground outline-none transition-colors focus:border-primary"
                  placeholder="webtorrent"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">MPV command/path</span>
                <input
                  value={settings.mpv_path}
                  onChange={(event) => setSettings((current) => ({ ...current, mpv_path: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm font-bold text-foreground outline-none transition-colors focus:border-primary"
                  placeholder="mpv"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Cache folder</span>
                <input
                  value={settings.cache_dir}
                  onChange={(event) => setSettings((current) => ({ ...current, cache_dir: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm font-bold text-foreground outline-none transition-colors focus:border-primary"
                  placeholder="Leave blank for system temp"
                />
              </label>
              <button
                type="button"
                onClick={saveSettings}
                className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Save desktop settings
              </button>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
