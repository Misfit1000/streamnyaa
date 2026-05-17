import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Gauge,
  HardDrive,
  Heart,
  Info,
  Languages,
  ListVideo,
  Loader2,
  Maximize,
  MonitorPlay,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import Seo from '../components/Seo';
import { searchNyaa, type NyaaItem } from '../api/nyaa';
import {
  clearLocalPlaybackHistory,
  getDesktopRuntimeStatus,
  getLocalPlaybackProgress,
  isDesktopApp,
  loadDesktopPlaybackSettings,
  loadLocalPlaybackHistory,
  loadLocalPlaybackSource,
  openLocalTorrentPlayer,
  saveLocalPlaybackSource,
  startLocalDownloadWithSettings,
  startLocalPlaybackWithSettings,
  stopLocalPlayback,
  type DesktopPlaybackProgress,
  type DesktopPlaybackSettings,
  type DesktopRuntimeStatus,
  type LocalPlaybackSource,
} from '../lib/desktop';
import { getTorrentBadges, torrentBadgeClassName } from '../lib/torrentBadges';
import { sourceFreshnessLabel, sourceQualityScore } from '../lib/sourceQuality';

type PanelTab = 'episodes' | 'sources' | 'info';
type PlayState = 'idle' | 'starting' | 'ready' | 'error';

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function sourceKind(title = '') {
  if (/\b(batch|complete|season pack|complete season)\b/i.test(title)) return 'batch';
  if (/\b(dual[\s-]?audio|multi[\s-]?audio|dub|dubbed)\b/i.test(title)) return 'dual audio';
  if (/\b(raw)\b/i.test(title)) return 'raw';
  return 'sub';
}

function shortTitle(source: LocalPlaybackSource | null) {
  if (!source) return 'Select a source';
  if (source.animeTitle && source.episode && source.episode !== 'batch') {
    return `${source.animeTitle} - Episode ${source.episode}`;
  }
  return source.animeTitle || source.title;
}

function sourceEpisodeMatch(title: string, selectedEpisode: string) {
  const episodeNumber = Number(selectedEpisode);
  if (!Number.isFinite(episodeNumber) || episodeNumber <= 0) return 'none';
  if (sourceKind(title) === 'batch') return 'batch';

  const padded = String(episodeNumber).padStart(2, '0');
  const loose = String(episodeNumber);
  const exactPatterns = [
    new RegExp(`\\bS\\d{1,2}E0?${episodeNumber}\\b`, 'i'),
    new RegExp(`\\bEP(?:ISODE)?\\.?\\s*0?${episodeNumber}\\b`, 'i'),
    new RegExp(`(?:^|[\\s._\\-[\\(])${padded}(?:[\\s._\\-\\]\\)]|$)`, 'i'),
    new RegExp(`(?:^|[\\s._\\-[\\(])${loose}(?:[\\s._\\-\\]\\)]|$)`, 'i'),
  ];
  if (exactPatterns.some((pattern) => pattern.test(title))) return 'exact';

  const anyEpisodeMarker = /\bS\d{1,2}E\d{1,4}\b|\bEP(?:ISODE)?\.?\s*\d{1,4}\b|(?:^|[\s._\-[\(])\d{2,4}(?:[\s._\-\]\)]|$)/i;
  return anyEpisodeMarker.test(title) ? 'mismatch' : 'unknown';
}

function runtimeLabel(runtime: DesktopRuntimeStatus | null) {
  if (!runtime) return 'Checking';
  if (runtime.ready) return 'Ready';
  if (!runtime.torrent_engine_configured) return 'Engine needed';
  if (!runtime.player_configured) return 'Player needed';
  return 'Setup needed';
}

function cleanRuntimeMessage(message = '') {
  return message
    .replace(/rqbit/gi, 'the local engine')
    .replace(/MPV/gi, 'the local player')
    .replace(/command or full executable path/gi, 'setup path');
}

function qualityFromTitle(title = '') {
  if (/\b2160p|4k\b/i.test(title)) return '4K';
  if (/\b1080p\b/i.test(title)) return '1080p';
  if (/\b720p\b/i.test(title)) return '720p';
  if (/\b480p\b/i.test(title)) return '480p';
  return 'Auto';
}

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 place-items-center rounded-xl border transition-colors ${
        active
          ? 'border-primary/45 bg-primary/18 text-white'
          : 'border-white/10 bg-white/[0.055] text-white/70 hover:border-primary/35 hover:bg-white/[0.085] hover:text-white'
      } disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {children}
    </button>
  );
}

function StatCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 shadow-lg shadow-black/15">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-primary">{icon}</span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-white/42">{label}</p>
          <p className="mt-0.5 text-lg font-semibold text-white">{value}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-white/42">{detail}</p>
    </div>
  );
}

export default function LocalPlayer() {
  const desktop = isDesktopApp();
  const desktopBridgeReady = Boolean(window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke);
  const [settings] = useState<DesktopPlaybackSettings>(() => loadDesktopPlaybackSettings());
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(null);
  const [source, setSource] = useState<LocalPlaybackSource | null>(() => loadLocalPlaybackSource());
  const [history, setHistory] = useState<LocalPlaybackSource[]>(() => loadLocalPlaybackHistory());
  const [playback, setPlayback] = useState<DesktopPlaybackProgress | null>(null);
  const [activeTorrentId, setActiveTorrentId] = useState('');
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [message, setMessage] = useState('Choose a source, then press play.');
  const [panelTab, setPanelTab] = useState<PanelTab>('episodes');
  const [sourceQuery, setSourceQuery] = useState(() => loadLocalPlaybackSource()?.animeTitle || '');
  const [selectedEpisode, setSelectedEpisode] = useState(() => {
    const episode = loadLocalPlaybackSource()?.episode;
    return episode && episode !== 'batch' ? String(episode) : '';
  });
  const [quality, setQuality] = useState<'1080p' | '720p' | ''>('1080p');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const playerTitle = shortTitle(source);
  const runtimeReady = Boolean(runtime?.ready);
  const progress = Math.max(0, Math.min(100, playback?.progress ?? (playState === 'ready' ? 100 : playState === 'starting' ? 22 : 0)));
  const peers = playback?.peers ?? Number(source?.seeders || 0) ?? 0;
  const episodeBase = Number(selectedEpisode || source?.episode || 1);
  const episodeItems = useMemo(() => {
    const start = Math.max(1, episodeBase - 6);
    return Array.from({ length: 12 }, (_, index) => start + index);
  }, [episodeBase]);

  const builtQuery = [
    sourceQuery.trim(),
    selectedEpisode ? selectedEpisode.padStart(2, '0') : '',
    quality,
  ].filter(Boolean).join(' ');

  const {
    data: searchedSources = [],
    isFetching: sourcesLoading,
    isError: sourcesError,
    error: sourcesErrorValue,
    refetch: refetchSources,
  } = useQuery({
    queryKey: ['local-player-sources', submittedQuery, quality],
    queryFn: () => searchNyaa(submittedQuery, '1_2', '0', '1', { pages: 2, wide: true }),
    enabled: desktopBridgeReady && submittedQuery.length >= 2,
    staleTime: 1000 * 60 * 2,
  });

  const rankedSources = useMemo(() => {
    const weights: Record<string, number> = { exact: 5, unknown: 3, none: 3, batch: 2, mismatch: 0 };
    return [...searchedSources].sort((a, b) => {
      const aMatch = selectedEpisode ? sourceEpisodeMatch(a.title, selectedEpisode) : 'none';
      const bMatch = selectedEpisode ? sourceEpisodeMatch(b.title, selectedEpisode) : 'none';
      const byEpisode = (weights[bMatch] ?? 0) - (weights[aMatch] ?? 0);
      if (byEpisode) return byEpisode;
      return sourceQualityScore(b) - sourceQualityScore(a);
    });
  }, [searchedSources, selectedEpisode]);

  const relatedCards = useMemo(() => {
    const recent = history.filter((item) => item.magnet !== source?.magnet).slice(0, 5);
    if (recent.length) return recent;
    return rankedSources.slice(0, 5).map((item) => ({
      title: item.title,
      magnet: item.magnet,
      animeTitle: sourceQuery.trim() || 'Source result',
      episode: selectedEpisode || null,
      size: item.size,
      seeders: item.seeders,
    }));
  }, [history, rankedSources, selectedEpisode, source?.magnet, sourceQuery]);

  const selectSource = (nextSource: LocalPlaybackSource) => {
    saveLocalPlaybackSource(nextSource);
    setSource(nextSource);
    setHistory(loadLocalPlaybackHistory());
    setPlayback(null);
    setActiveTorrentId('');
    setPlayState('idle');
    setMessage('Source selected. Press play when ready.');
    if (nextSource.animeTitle) setSourceQuery(nextSource.animeTitle);
    if (nextSource.episode && nextSource.episode !== 'batch') setSelectedEpisode(String(nextSource.episode));
  };

  const selectTorrentSource = (torrent: NyaaItem) => {
    selectSource({
      title: torrent.title,
      magnet: torrent.magnet,
      animeTitle: sourceQuery.trim() || source?.animeTitle || 'Selected anime',
      episode: selectedEpisode || null,
      size: torrent.size,
      seeders: torrent.seeders,
    });
  };

  const searchSources = () => {
    const query = builtQuery.trim();
    setSubmittedQuery(query);
    setPanelTab('sources');
    if (query && query === submittedQuery) void refetchSources();
  };

  const playSelectedSource = async () => {
    if (!source) {
      setPanelTab('sources');
      setMessage('Choose a source first.');
      return;
    }
    if (!desktopBridgeReady) {
      setPlayState('error');
      setMessage('Local playback is available inside the desktop app.');
      return;
    }
    if (!runtimeReady) {
      setPlayState('error');
      setMessage(cleanRuntimeMessage(runtime?.message || 'The local playback tools are not ready yet.'));
      return;
    }

    setPlayState('starting');
    setMessage('Preparing source and opening the player...');
    try {
      saveLocalPlaybackSource(source);
      setHistory(loadLocalPlaybackHistory());
      const result = await startLocalPlaybackWithSettings(source, settings);
      setPlayState(result.ok ? 'ready' : 'error');
      setMessage(result.ok ? 'Playback opened in the local player.' : cleanRuntimeMessage(result.message || 'Playback could not start.'));
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
      setPlayState('error');
      setMessage(error instanceof Error ? cleanRuntimeMessage(error.message) : 'Playback could not start.');
    }
  };

  const reopenPlayer = async () => {
    if (!activeTorrentId) {
      await playSelectedSource();
      return;
    }
    setMessage('Opening the player...');
    try {
      const result = await openLocalTorrentPlayer(activeTorrentId, playerTitle, settings);
      setPlayState(result.ok ? 'ready' : 'error');
      setMessage(result.ok ? 'Player opened.' : cleanRuntimeMessage(result.message || 'Player could not open.'));
    } catch (error) {
      setPlayState('error');
      setMessage(error instanceof Error ? cleanRuntimeMessage(error.message) : 'Player could not open.');
    }
  };

  const downloadSelectedSource = async () => {
    if (!source) {
      setPanelTab('sources');
      setMessage('Choose a source first.');
      return;
    }
    setMessage('Starting local download...');
    try {
      const result = await startLocalDownloadWithSettings(source, settings);
      setMessage(cleanRuntimeMessage(result.message || 'Download started.'));
      if (result.torrent_id) setActiveTorrentId(result.torrent_id);
    } catch (error) {
      setMessage(error instanceof Error ? cleanRuntimeMessage(error.message) : 'Download could not start.');
    }
  };

  const stopActive = async () => {
    if (!activeTorrentId) {
      setMessage('Nothing active to stop.');
      return;
    }
    try {
      await stopLocalPlayback(activeTorrentId);
      setActiveTorrentId('');
      setPlayback(null);
      setPlayState('idle');
      setMessage('Local stream stopped.');
    } catch (error) {
      setPlayState('error');
      setMessage(error instanceof Error ? cleanRuntimeMessage(error.message) : 'Could not stop playback.');
    }
  };

  const clearSources = () => {
    clearLocalPlaybackHistory();
    setSource(null);
    setHistory([]);
    setPlayback(null);
    setActiveTorrentId('');
    setPlayState('idle');
    setMessage('Source history cleared.');
  };

  useEffect(() => {
    let cancelled = false;
    if (!desktopBridgeReady) return undefined;
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
            message: 'Playback status could not be read yet.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [desktopBridgeReady, settings]);

  useEffect(() => {
    if (!activeTorrentId || !desktopBridgeReady) return undefined;
    let cancelled = false;
    const updateProgress = async () => {
      try {
        const next = await getLocalPlaybackProgress(activeTorrentId);
        if (!cancelled) setPlayback(next);
      } catch {
        if (!cancelled) setMessage('Playback is open. Progress will update when the local engine reports it.');
      }
    };
    void updateProgress();
    const timer = window.setInterval(updateProgress, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTorrentId, desktopBridgeReady]);

  useEffect(() => {
    if (!desktopBridgeReady || submittedQuery || builtQuery.length < 2) return;
    setSubmittedQuery(builtQuery);
  }, [builtQuery, desktopBridgeReady, submittedQuery]);

  return (
    <div className="mx-auto max-w-[1680px] px-4 py-5 lg:px-6">
      <Seo title="Local Player | StreamNyaa" description="StreamNyaa desktop local player." canonicalPath="/local-player" robots="noindex, nofollow" />

      <section className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#090a0d] shadow-2xl shadow-black/45">
        <div className="flex items-center gap-4 border-b border-white/10 bg-white/[0.025] px-5 py-4">
          <Link to="/" className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.055] text-white/70 hover:border-primary/40 hover:text-white" aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="relative w-full max-w-[560px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
            <input
              value={sourceQuery}
              onChange={(event) => setSourceQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') searchSources();
              }}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/28 pl-12 pr-20 text-sm font-medium text-white outline-none placeholder:text-white/36 focus:border-primary/55"
              placeholder="Search anime, episode, or source..."
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-white/40">Ctrl K</span>
          </div>
          <button
            type="button"
            onClick={searchSources}
            className="hidden h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-primary/15 hover:bg-primary/90 md:inline-flex"
          >
            <Search className="h-4 w-4" />
            Sources
          </button>
          <div className="ml-auto flex items-center gap-3">
            <span className={`hidden rounded-full border px-3 py-1.5 text-xs font-semibold lg:inline-flex ${runtimeReady ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-300'}`}>
              {runtimeLabel(runtime)}
            </span>
            <IconButton label="Notifications"><Bell className="h-4 w-4" /></IconButton>
            <IconButton label="Player settings"><Settings className="h-4 w-4" /></IconButton>
          </div>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="min-w-0">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/40">
              <div className="pointer-events-none absolute -inset-12 bg-[radial-gradient(circle_at_45%_10%,rgba(225,29,72,0.36),transparent_34%),radial-gradient(circle_at_80%_70%,rgba(59,130,246,0.16),transparent_30%)] blur-2xl" />
              <div className="relative aspect-video overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(155,21,36,0.65),rgba(6,7,11,0.42)_40%,rgba(3,3,5,0.9)),radial-gradient(circle_at_65%_35%,rgba(255,55,85,0.35),transparent_28%)]" />
                <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(115deg,transparent_0%,transparent_35%,rgba(255,255,255,0.08)_36%,transparent_44%),radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.10),transparent_24%)]" />
                <div className="absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/76 to-transparent p-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Local player</p>
                    <h1 className="mt-1 line-clamp-1 text-2xl font-semibold tracking-[-0.02em] text-white md:text-3xl">{playerTitle}</h1>
                  </div>
                  <div className="flex gap-2 text-xs font-semibold text-white/58">
                    <span className="rounded-md bg-white/10 px-2.5 py-1">{qualityFromTitle(source?.title || '')}</span>
                    <span className="rounded-md bg-white/10 px-2.5 py-1">{sourceKind(source?.title || '')}</span>
                  </div>
                </div>

                <div className="absolute inset-0 grid place-items-center">
                  <button
                    type="button"
                    onClick={() => void playSelectedSource()}
                    disabled={playState === 'starting'}
                    className="grid h-20 w-20 place-items-center rounded-full border border-primary/45 bg-primary text-white shadow-[0_0_55px_rgba(225,29,72,0.42)] transition-transform hover:scale-105 disabled:opacity-60"
                    aria-label="Play selected source"
                  >
                    {playState === 'starting' ? <Loader2 className="h-9 w-9 animate-spin" /> : playState === 'ready' ? <Pause className="h-9 w-9 fill-current" /> : <Play className="ml-1 h-9 w-9 fill-current" />}
                  </button>
                </div>

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/92 via-black/68 to-transparent p-5">
                  <div className="mb-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/14">
                      <div className="h-full rounded-full bg-primary shadow-[0_0_20px_rgba(225,29,72,0.6)] transition-all" style={{ width: `${Math.max(4, progress)}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] font-semibold text-white/46">
                      <span>{progress > 0 ? `${Math.round(progress)}% ready` : 'Waiting'}</span>
                      <span>{source?.size || 'Source size unknown'}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <IconButton label="Back 10 seconds" disabled><SkipBack className="h-4 w-4" /></IconButton>
                      <button
                        type="button"
                        onClick={() => void playSelectedSource()}
                        disabled={playState === 'starting'}
                        className="grid h-14 w-14 place-items-center rounded-full border border-primary/45 bg-black/52 text-primary shadow-xl shadow-black/25 hover:bg-primary hover:text-white disabled:opacity-60"
                        aria-label="Play"
                      >
                        {playState === 'starting' ? <Loader2 className="h-6 w-6 animate-spin" /> : playState === 'ready' ? <Pause className="h-6 w-6 fill-current" /> : <Play className="ml-0.5 h-6 w-6 fill-current" />}
                      </button>
                      <IconButton label="Next episode"><SkipForward className="h-4 w-4" /></IconButton>
                      <button type="button" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-white/62 hover:border-primary/35 hover:text-white">Skip intro</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <IconButton label="Volume"><Volume2 className="h-4 w-4" /></IconButton>
                      <IconButton label="Subtitles"><Captions className="h-4 w-4" /></IconButton>
                      <button className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-white/72">English</button>
                      <button className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-white/72">{qualityFromTitle(source?.title || '')}</button>
                      <IconButton label="Fullscreen"><Maximize className="h-4 w-4" /></IconButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="line-clamp-1 text-2xl font-semibold tracking-[-0.02em] text-white">{source?.animeTitle || playerTitle}</h2>
                  <Heart className="h-5 w-5 text-primary" />
                </div>
                <p className="mt-1 text-sm font-medium text-white/58">
                  {source?.episode ? `Episode ${source.episode}` : 'Selected source'} {source?.title ? `- ${source.title}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-white/64">
                  <span className="rounded-md bg-white/8 px-2.5 py-1">{source?.size || 'Unknown size'}</span>
                  <span className="rounded-md bg-white/8 px-2.5 py-1">{peers || 0} peers</span>
                  <span className="rounded-md bg-primary/16 px-2.5 py-1 text-primary">{qualityFromTitle(source?.title || '')}</span>
                  <span className="rounded-md bg-white/8 px-2.5 py-1">{sourceKind(source?.title || '')}</span>
                </div>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-white/52">{message}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void reopenPlayer()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-primary/15 hover:bg-primary/90"
                >
                  <MonitorPlay className="h-4 w-4" />
                  Open player
                </button>
                <button
                  type="button"
                  onClick={() => void downloadSelectedSource()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-4 text-sm font-semibold text-white/70 hover:border-primary/35 hover:text-white"
                >
                  <Download className="h-4 w-4" />
                  Save
                </button>
              </div>
            </div>

            <section className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">More like this</h2>
                <Link to="/nyaa?desktop=1" className="inline-flex items-center gap-1 text-sm font-medium text-white/48 hover:text-white">
                  View all
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                {relatedCards.length ? relatedCards.map((item, index) => (
                  <button
                    key={`${item.magnet}-${index}`}
                    type="button"
                    onClick={() => selectSource(item)}
                    className="group w-[190px] shrink-0 text-left"
                  >
                    <span className="relative block aspect-video overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(225,29,72,0.38),rgba(255,255,255,0.06)),#131217] shadow-lg shadow-black/20">
                      <span className="absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,rgba(255,255,255,0.20),transparent_30%)] transition-transform duration-500 group-hover:scale-105" />
                      <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-white/70">{qualityFromTitle(item.title)}</span>
                    </span>
                    <span className="mt-2 line-clamp-1 block text-sm font-semibold text-white">{item.animeTitle || item.title}</span>
                    <span className="mt-1 block text-xs text-white/42">{item.episode ? `Episode ${item.episode}` : item.size || 'Recent source'}</span>
                  </button>
                )) : (
                  <div className="rounded-xl border border-dashed border-white/12 px-4 py-5 text-sm text-white/44">No related sources yet.</div>
                )}
              </div>
            </section>
          </main>

          <aside className="min-w-0 space-y-4">
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055] shadow-xl shadow-black/20">
              <div className="flex border-b border-white/10 px-4 pt-4">
                {([
                  ['episodes', 'Episodes', ListVideo],
                  ['sources', 'Sources', Download],
                  ['info', 'Info', Info],
                ] as const).map(([tab, label, Icon]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setPanelTab(tab)}
                    className={`relative flex items-center gap-2 px-3 pb-3 text-sm font-semibold transition-colors ${panelTab === tab ? 'text-white' : 'text-white/44 hover:text-white'}`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    {panelTab === tab ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
                  </button>
                ))}
              </div>

              {panelTab === 'episodes' ? (
                <div className="max-h-[560px] overflow-y-auto p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Season 1</p>
                      <p className="text-xs text-white/38">Pick an episode to search matching sources.</p>
                    </div>
                    <select
                      value={selectedEpisode}
                      onChange={(event) => setSelectedEpisode(event.target.value)}
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs font-semibold text-white outline-none [&>option]:bg-background"
                    >
                      <option value="">Batch</option>
                      {Array.from({ length: 200 }, (_, index) => index + 1).map((episode) => (
                        <option key={episode} value={episode}>Ep {episode}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    {episodeItems.map((episode) => {
                      const active = String(episode) === String(selectedEpisode || source?.episode || '');
                      return (
                        <button
                          key={episode}
                          type="button"
                          onClick={() => {
                            setSelectedEpisode(String(episode));
                            setSubmittedQuery([sourceQuery.trim(), String(episode).padStart(2, '0'), quality].filter(Boolean).join(' '));
                            setPanelTab('sources');
                          }}
                          className={`grid w-full grid-cols-[24px_82px_1fr_auto] items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                            active ? 'border-primary/45 bg-primary/14' : 'border-white/8 bg-black/24 hover:border-primary/30 hover:bg-white/[0.055]'
                          }`}
                        >
                          <span className="text-xs font-semibold text-white/50">{episode}</span>
                          <span className="block aspect-video overflow-hidden rounded-lg bg-[linear-gradient(135deg,rgba(225,29,72,0.42),rgba(255,255,255,0.07))]" />
                          <span className="min-w-0">
                            <span className="line-clamp-1 block text-sm font-semibold text-white">Episode {episode}</span>
                            <span className="mt-0.5 block text-xs text-white/38">{active ? 'Selected' : 'Find source'}</span>
                          </span>
                          {active ? <Check className="h-4 w-4 text-primary" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {panelTab === 'sources' ? (
                <div className="max-h-[560px] overflow-y-auto p-4">
                  <div className="grid grid-cols-[1fr_92px] gap-2">
                    <input
                      value={sourceQuery}
                      onChange={(event) => setSourceQuery(event.target.value)}
                      className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-semibold text-white outline-none placeholder:text-white/32 focus:border-primary/55"
                      placeholder="Anime title"
                    />
                    <select
                      value={quality}
                      onChange={(event) => setQuality(event.target.value as typeof quality)}
                      className="rounded-xl border border-white/10 bg-black/30 px-2 py-2.5 text-sm font-semibold text-white outline-none focus:border-primary/55 [&>option]:bg-background"
                    >
                      <option value="1080p">1080p</option>
                      <option value="720p">720p</option>
                      <option value="">Any</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={searchSources}
                    disabled={sourceQuery.trim().length < 2 || sourcesLoading}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    {sourcesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Search sources
                  </button>

                  <div className="mt-4 space-y-2">
                    {sourcesLoading ? (
                      [0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl border border-white/10 bg-black/24" />)
                    ) : sourcesError ? (
                      <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">
                        {sourcesErrorValue instanceof Error ? sourcesErrorValue.message : 'Source search failed.'}
                      </div>
                    ) : rankedSources.length ? rankedSources.slice(0, 12).map((torrent) => {
                      const active = source?.magnet === torrent.magnet;
                      const match = selectedEpisode ? sourceEpisodeMatch(torrent.title, selectedEpisode) : 'none';
                      return (
                        <button
                          key={torrent.infoHash || torrent.magnet}
                          type="button"
                          onClick={() => selectTorrentSource(torrent)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? 'border-primary/45 bg-primary/14' : 'border-white/8 bg-black/24 hover:border-primary/30 hover:bg-white/[0.055]'}`}
                        >
                          <span className="line-clamp-2 text-sm font-semibold text-white">{torrent.title}</span>
                          <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-white/42">
                            <span>Score {sourceQualityScore(torrent)}</span>
                            <span>{torrent.size}</span>
                            <span>{torrent.seeders} seeders</span>
                            <span>{sourceFreshnessLabel(torrent)}</span>
                            {selectedEpisode ? <span>{match === 'exact' ? 'Exact episode' : match === 'batch' ? 'Batch' : match === 'mismatch' ? 'Different episode' : 'Related'}</span> : null}
                          </span>
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {getTorrentBadges(torrent).slice(0, 3).map((badge) => (
                              <span key={`${torrent.infoHash}-${badge.label}`} className={torrentBadgeClassName(badge.tone)}>{badge.label}</span>
                            ))}
                          </span>
                        </button>
                      );
                    }) : (
                      <div className="rounded-xl border border-dashed border-white/12 p-4 text-sm leading-6 text-white/42">
                        Search an anime title or open a source from the downloads page.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {panelTab === 'info' ? (
                <div className="max-h-[560px] overflow-y-auto p-4">
                  <div className="space-y-3">
                    {[
                      [Info, 'Current source', source?.title || 'No source selected'],
                      [Languages, 'Audio mode', sourceKind(source?.title || '')],
                      [Captions, 'Subtitles', /\braw\b/i.test(source?.title || '') ? 'May be unavailable' : 'Source dependent'],
                      [Gauge, 'Quality', qualityFromTitle(source?.title || '')],
                      [HardDrive, 'Size', source?.size || 'Unknown'],
                    ].map(([Icon, label, value]) => {
                      const RowIcon = Icon as typeof Info;
                      return (
                        <div key={label as string} className="flex gap-3 rounded-xl border border-white/10 bg-black/24 p-3">
                          <RowIcon className="mt-0.5 h-4 w-4 text-primary" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-white/36">{label as string}</p>
                            <p className="mt-1 line-clamp-2 text-sm font-medium text-white/70">{value as string}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 shadow-xl shadow-black/20">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Source details</h2>
                <span className={`text-xs font-semibold ${runtimeReady ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {runtimeLabel(runtime)}
                </span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {[
                  ['File size', source?.size || 'Unknown'],
                  ['Peers', String(peers || 0)],
                  ['Speed', formatBytes(playback?.download_speed) + '/s'],
                  ['Buffer health', `${Math.round(progress)}%`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 text-white/52">
                    <span>{label}</span>
                    <span className="font-semibold text-white/78">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${Math.max(5, progress)}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void playSelectedSource()}
                  disabled={!source || playState === 'starting'}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {playState === 'starting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                  Play
                </button>
                <button
                  type="button"
                  onClick={() => void stopActive()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/24 px-3 py-2.5 text-sm font-semibold text-white/64 hover:border-primary/35 hover:text-white"
                >
                  <X className="h-4 w-4" />
                  Stop
                </button>
              </div>
            </section>
          </aside>
        </div>

        <div className="grid gap-3 border-t border-white/10 bg-black/18 p-5 md:grid-cols-5">
          <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="Status" value={playState === 'ready' ? 'Playing' : runtimeLabel(runtime)} detail={cleanRuntimeMessage(message)} />
          <StatCard icon={<Gauge className="h-4 w-4" />} label="Peers" value={String(peers || 0)} detail="Connected source health" />
          <StatCard icon={<SlidersHorizontal className="h-4 w-4" />} label="Bandwidth" value={`${formatBytes(playback?.download_speed)}/s`} detail="Current transfer speed" />
          <StatCard icon={<HardDrive className="h-4 w-4" />} label="Storage" value={formatBytes(playback?.downloaded_bytes)} detail={playback?.total_bytes ? `of ${formatBytes(playback.total_bytes)}` : 'Cache managed locally'} />
          <StatCard icon={<Clock className="h-4 w-4" />} label="Buffer" value={`${Math.round(progress)}%`} detail="Ready for playback" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-white/[0.025] px-5 py-4">
          <div className="text-xs text-white/42">
            {history.length ? `${history.length} recent source${history.length === 1 ? '' : 's'} saved on this device.` : 'No recent sources saved yet.'}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void getDesktopRuntimeStatus(settings).then((next) => next && setRuntime(next))}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-white/62 hover:border-primary/35 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={clearSources}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-white/62 hover:border-primary/35 hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear history
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
