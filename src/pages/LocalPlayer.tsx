import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clipboard, Download, FolderOpen, HardDrive, Loader2, MonitorPlay, Play, RefreshCw, RotateCcw, Terminal } from 'lucide-react';
import Seo from '../components/Seo';
import {
  getDesktopRuntimeStatus,
  getLocalPlaybackProgress,
  isDesktopApp,
  loadDesktopPlaybackSettings,
  loadLocalPlaybackSource,
  openDesktopCacheFolder,
  saveDesktopPlaybackSettings,
  startLocalPlaybackWithSettings,
  type DesktopPlaybackSettings,
  type DesktopPlaybackProgress,
  type DesktopRuntimeStatus,
} from '../lib/desktop';

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function LocalPlayer() {
  const desktop = isDesktopApp();
  const source = useMemo(() => loadLocalPlaybackSource(), []);
  const [status, setStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(null);
  const [playback, setPlayback] = useState<DesktopPlaybackProgress | null>(null);
  const [activeTorrentId, setActiveTorrentId] = useState('');
  const [settings, setSettings] = useState<DesktopPlaybackSettings>(() => loadDesktopPlaybackSettings());
  const [copiedCommand, setCopiedCommand] = useState('');

  const refreshRuntime = async (nextSettings = settings) => {
    const nextRuntime = await getDesktopRuntimeStatus(nextSettings);
    if (nextRuntime) setRuntime(nextRuntime);
  };

  const copyCommand = async (label: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(label);
      window.setTimeout(() => setCopiedCommand(''), 1800);
    } catch {
      setCopiedCommand('');
      setMessage(command);
    }
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
            torrent_engine_version: null,
            player_version: null,
            message: 'Desktop runtime status could not be read yet.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop || !activeTorrentId) return undefined;
    let cancelled = false;

    const refreshPlayback = async () => {
      try {
        const nextPlayback = await getLocalPlaybackProgress(activeTorrentId);
        if (!cancelled) setPlayback(nextPlayback);
      } catch (error) {
        if (!cancelled) {
          setPlayback((current) => current);
          setMessage(error instanceof Error ? error.message : 'Could not read local playback progress yet.');
        }
      }
    };

    refreshPlayback();
    const interval = window.setInterval(refreshPlayback, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTorrentId, desktop]);

  const start = async () => {
    if (!source) {
      setStatus('error');
      setMessage('No local playback source was selected. Go back to downloads and choose Play locally.');
      return;
    }
    setStatus('starting');
    setMessage('Starting local rqbit engine...');
    try {
      const result = await startLocalPlaybackWithSettings(source, settings);
      setStatus(result.ok ? 'ready' : 'error');
      setMessage(result.message || 'Local playback request sent to the desktop engine.');
      if (result.torrent_id) {
        setActiveTorrentId(result.torrent_id);
        setPlayback({
          ok: true,
          torrent_id: result.torrent_id,
          state: result.state,
          message: result.message,
          progress: null,
          downloaded_bytes: null,
          total_bytes: null,
          peers: null,
          download_speed: null,
          playlist_url: result.playlist_url || `http://127.0.0.1:3030/torrents/${result.torrent_id}/playlist`,
        });
      }
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

  const openCacheFolder = async () => {
    try {
      await openDesktopCacheFolder(settings);
      setMessage('Cache folder opened.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not open the cache folder.');
    }
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

          {playback ? (
            <div className="mt-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-primary">Local torrent stream</p>
                  <p className="mt-1 text-sm font-bold text-foreground">{playback.message}</p>
                </div>
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-300">
                  {playback.state || 'active'}
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.max(4, Math.min(100, playback.progress ?? 6))}%` }}
                />
              </div>
              <div className="mt-3 grid gap-2 text-xs font-bold text-muted-foreground sm:grid-cols-3">
                <span>{playback.progress != null ? `${Math.round(playback.progress)}% ready` : 'Preparing stream'}</span>
                <span>{formatBytes(playback.downloaded_bytes)} / {formatBytes(playback.total_bytes)}</span>
                <span>{playback.peers ?? 0} peers · {formatBytes(playback.download_speed)}/s</span>
              </div>
              <p className="mt-3 truncate font-mono text-[11px] text-muted-foreground">{playback.playlist_url}</p>
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
                <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3 text-xs">
                  <div>
                    <span className="font-black uppercase tracking-wider text-muted-foreground">Engine</span>
                    <p className="mt-0.5 truncate font-mono text-foreground">{runtime.torrent_engine_version || runtime.torrent_engine_path || 'Not detected'}</p>
                  </div>
                  <div>
                    <span className="font-black uppercase tracking-wider text-muted-foreground">Player</span>
                    <p className="mt-0.5 truncate font-mono text-foreground">{runtime.player_version || runtime.player_path || 'Not detected'}</p>
                  </div>
                  <div>
                    <span className="font-black uppercase tracking-wider text-muted-foreground">Cache</span>
                    <p className="mt-0.5 truncate font-mono text-foreground">{runtime.cache_dir || 'System temp folder'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => refreshRuntime()}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/55 px-3 py-2 text-xs font-black text-foreground transition-colors hover:border-primary/40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={openCacheFolder}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/55 px-3 py-2 text-xs font-black text-foreground transition-colors hover:border-primary/40"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Open cache
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                This screen is ready for Tauri to connect a local torrent engine and MPV playback. Web users still get download/source search only.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)] p-5">
            <div className="flex items-center gap-2 font-black text-foreground">
              <Terminal className="h-4 w-4 text-primary" />
              Windows setup
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Install both tools once, then keep the command fields as `rqbit` and `mpv`.
            </p>
            <div className="mt-4 space-y-2">
              {[
                ['rqbit', 'cargo install rqbit'],
                ['MPV', 'winget install --id shinchiro.mpv -e'],
                ['Desktop app', '.\\desktop-dev.cmd'],
              ].map(([label, command]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => copyCommand(label, command)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background/50 px-3 py-2 text-left transition-colors hover:border-primary/40"
                >
                  <span>
                    <span className="block text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-foreground">{command}</span>
                  </span>
                  <Clipboard className="h-4 w-4 shrink-0 text-primary" />
                </button>
              ))}
            </div>
            {copiedCommand ? (
              <p className="mt-3 text-xs font-bold text-emerald-300">{copiedCommand} command copied.</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)] p-5">
            <h2 className="font-black text-foreground">Local playback settings</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Use `rqbit` and `mpv` when both commands are available in PATH, or paste the full executable paths.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">rqbit command/path</span>
                <input
                  value={settings.torrent_engine_path}
                  onChange={(event) => setSettings((current) => ({ ...current, torrent_engine_path: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm font-bold text-foreground outline-none transition-colors focus:border-primary"
                  placeholder="rqbit"
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
