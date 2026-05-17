import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Captions,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FastForward,
  Gauge,
  Headphones,
  Info,
  Keyboard,
  Languages,
  ListVideo,
  Loader2,
  Maximize,
  MessageCircle,
  Minimize,
  MonitorPlay,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  Rewind,
  Search,
  Settings,
  SkipForward,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
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
  stopLocalPlayback,
  type DesktopPlaybackProgress,
  type DesktopPlaybackSettings,
  type DesktopRuntimeStatus,
  type LocalPlaybackSource,
} from '../lib/desktop';
import { getTorrentBadges, torrentBadgeClassName } from '../lib/torrentBadges';
import { sourceFreshnessLabel, sourceQualityScore } from '../lib/sourceQuality';

type SidebarTab = 'episodes' | 'sources' | 'info';

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTime(value = 0) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function runtimeLabel(runtime: DesktopRuntimeStatus | null) {
  if (!runtime) return 'Checking';
  if (runtime.ready) return 'Ready';
  if (!runtime.torrent_engine_configured) return 'Playback engine needed';
  if (!runtime.player_configured) return 'Player setup needed';
  return 'Setup needed';
}

function friendlyRuntimeMessage(message = '') {
  return message
    .replace(/rqbit/gi, 'the local engine')
    .replace(/MPV/gi, 'the local player')
    .replace(/command or full executable path/gi, 'setup path')
    .replace(/commands are configured/gi, 'is ready');
}

function shortTitle(source: LocalPlaybackSource) {
  if (source.animeTitle && source.episode && source.episode !== 'batch') {
    return `${source.animeTitle} - Episode ${source.episode}`;
  }
  return source.animeTitle || source.title;
}

function sourceKind(title = '') {
  if (/\b(batch|complete|season pack|complete season)\b/i.test(title)) return 'batch';
  if (/\b(dual[\s-]?audio|multi[\s-]?audio|dub|dubbed)\b/i.test(title)) return 'dual';
  if (/\b(raw)\b/i.test(title)) return 'raw';
  return 'sub';
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

function PlayerIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="group relative inline-flex h-10 w-10 items-center justify-center rounded-full text-white/78 transition-colors hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-[10px] font-black text-black shadow-xl group-hover:block">
        {label}
      </span>
    </button>
  );
}

export default function LocalPlayer() {
  const desktop = isDesktopApp();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const fallbackOpenedRef = useRef('');
  const [source, setSource] = useState<LocalPlaybackSource | null>(() => loadLocalPlaybackSource());
  const [sourceHistory, setSourceHistory] = useState<LocalPlaybackSource[]>(() => loadLocalPlaybackHistory());
  const [status, setStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(null);
  const [playback, setPlayback] = useState<DesktopPlaybackProgress | null>(null);
  const [activeTorrentId, setActiveTorrentId] = useState('');
  const [settings] = useState<DesktopPlaybackSettings>(() => loadDesktopPlaybackSettings());
  const [sourceQuery, setSourceQuery] = useState(() => loadLocalPlaybackSource()?.animeTitle || '');
  const [selectedEpisode, setSelectedEpisode] = useState(() => {
    const episode = loadLocalPlaybackSource()?.episode;
    return episode && episode !== 'batch' ? String(episode) : '';
  });
  const [quality, setQuality] = useState<'1080p' | '720p' | 'raw' | ''>('1080p');
  const [submittedSourceQuery, setSubmittedSourceQuery] = useState('');
  const [autoSelectedQuery, setAutoSelectedQuery] = useState('');
  const [strictEpisode, setStrictEpisode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('episodes');
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [theatreMode, setTheatreMode] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.86);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [subtitleSize, setSubtitleSize] = useState(18);
  const [ambientStrength, setAmbientStrength] = useState(72);
  const [showResume, setShowResume] = useState(true);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);

  const sourceOptions = sourceHistory.length ? sourceHistory : source ? [source] : [];
  const runtimeReady = Boolean(runtime?.ready);
  const canPlay = Boolean(desktop && source && runtimeReady && status !== 'starting');
  const playbackUrl = playback?.playlist_url || '';
  const playerTitle = source ? shortTitle(source) : 'No source selected';
  const builtSourceQuery = [
    sourceQuery.trim(),
    selectedEpisode ? selectedEpisode.padStart(2, '0') : '',
    quality && quality !== 'raw' ? quality : '',
  ].filter(Boolean).join(' ');
  const sourceWarnings = source ? [
    Number(source.seeders || 0) > 0 && Number(source.seeders || 0) < 10 ? 'Low seed count; playback may take longer.' : '',
    selectedEpisode && source.episode && String(source.episode) !== selectedEpisode ? 'Selected source episode differs from the episode selector.' : '',
    /\b(batch|complete|season pack|complete season)\b/i.test(source.title) && selectedEpisode ? 'This looks like a batch source, not a single episode.' : '',
    /\braw\b/i.test(source.title) ? 'Raw source may not include subtitles.' : '',
  ].filter(Boolean) : [];

  const {
    data: searchedSources = [],
    isFetching: sourcesLoading,
    isError: sourcesError,
    error: sourcesErrorValue,
    refetch: refetchSources,
  } = useQuery({
    queryKey: ['local-player-sources', submittedSourceQuery, quality],
    queryFn: () => searchNyaa(submittedSourceQuery, quality === 'raw' ? '1_4' : '1_2', '0', '1', {
      pages: 2,
      wide: true,
    }),
    enabled: desktop && submittedSourceQuery.length >= 2,
    staleTime: 1000 * 60 * 2,
  });

  const rankedSearchedSources = useMemo(() => {
    const sorted = [...searchedSources].sort((a, b) => {
      const aMatch = selectedEpisode ? sourceEpisodeMatch(a.title, selectedEpisode) : 'none';
      const bMatch = selectedEpisode ? sourceEpisodeMatch(b.title, selectedEpisode) : 'none';
      const matchWeight: Record<string, number> = { exact: 4, unknown: 3, none: 3, batch: 2, mismatch: 0 };
      const aWeight = matchWeight[aMatch] ?? 0;
      const bWeight = matchWeight[bMatch] ?? 0;
      if (aWeight !== bWeight) return bWeight - aWeight;
      return sourceQualityScore(b) - sourceQualityScore(a);
    });
    if (!strictEpisode || !selectedEpisode) return sorted;
    const exact = sorted.filter((item) => sourceEpisodeMatch(item.title, selectedEpisode) === 'exact');
    return exact.length ? exact : sorted;
  }, [searchedSources, selectedEpisode, strictEpisode]);

  const exactEpisodeCount = selectedEpisode
    ? searchedSources.filter((item) => sourceEpisodeMatch(item.title, selectedEpisode) === 'exact').length
    : 0;

  const episodeItems = useMemo(() => {
    const current = Number(selectedEpisode || source?.episode || 1);
    const start = Math.max(1, current - 5);
    return Array.from({ length: 14 }, (_, index) => start + index);
  }, [selectedEpisode, source?.episode]);

  const refreshRuntime = async (nextSettings = settings) => {
    const nextRuntime = await getDesktopRuntimeStatus(nextSettings);
    if (nextRuntime) setRuntime(nextRuntime);
  };

  const revealControls = () => {
    setShowControls(true);
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 3200);
  };

  const togglePlay = async () => {
    if (!playbackUrl) {
      await start();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
    } else {
      video.pause();
    }
  };

  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    revealControls();
  };

  const seekToPercent = (value: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = (value / 100) * duration;
    revealControls();
  };

  const updateVolume = (value: number) => {
    const video = videoRef.current;
    setVolume(value);
    if (video) video.volume = value;
    if (value > 0) setMuted(false);
  };

  const toggleFullscreen = async () => {
    const container = document.querySelector('.streamnyaa-watch-stage') as HTMLElement | null;
    if (!container) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await container.requestFullscreen();
    }
  };

  const togglePictureInPicture = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled) await video.requestPictureInPicture();
    } catch {
      setMessage('Picture-in-picture is not available for this source yet.');
    }
  };

  const selectSource = (nextSource: LocalPlaybackSource) => {
    saveLocalPlaybackSource(nextSource);
    setSource(nextSource);
    setSourceHistory(loadLocalPlaybackHistory());
    setStatus('idle');
    setMessage('Source selected.');
    setActiveTorrentId('');
    setPlayback(null);
    setCurrentTime(0);
    setDuration(0);
    setShowResume(true);
    setNextCountdown(null);
    if (nextSource.animeTitle) setSourceQuery(nextSource.animeTitle);
    if (nextSource.episode && nextSource.episode !== 'batch') setSelectedEpisode(String(nextSource.episode));
  };

  const selectTorrentSource = (torrent: NyaaItem) => {
    selectSource({
      title: torrent.title,
      magnet: torrent.magnet,
      animeTitle: sourceQuery.trim() || source?.animeTitle,
      episode: selectedEpisode || null,
      size: torrent.size,
      seeders: torrent.seeders,
    });
  };

  const chooseBestSource = () => {
    const best = rankedSearchedSources[0];
    if (best) selectTorrentSource(best);
  };

  const applyPreset = (nextQuality: typeof quality, label?: string) => {
    setQuality(nextQuality);
    const nextQuery = [
      sourceQuery.trim(),
      selectedEpisode ? selectedEpisode.padStart(2, '0') : '',
      label || (nextQuality && nextQuality !== 'raw' ? nextQuality : ''),
    ].filter(Boolean).join(' ');
    setSubmittedSourceQuery(nextQuery);
    setSidebarTab('sources');
  };

  const clearSources = () => {
    clearLocalPlaybackHistory();
    setSource(null);
    setSourceHistory([]);
    setActiveTorrentId('');
    setPlayback(null);
    setStatus('idle');
    setMessage('Source list cleared.');
  };

  const start = async () => {
    if (!source) {
      setStatus('error');
      setMessage('Choose a source first.');
      return;
    }

    setStatus('starting');
    setMessage('Preparing in-app playback...');
    setShowResume(false);
    try {
      saveLocalPlaybackSource(source);
      setSourceHistory(loadLocalPlaybackHistory());
      const result = await startLocalDownloadWithSettings(source, settings);
      if (result.torrent_id) fallbackOpenedRef.current = '';
      setStatus(result.ok ? 'ready' : 'error');
      setMessage(result.ok ? 'Playback is ready inside StreamNyaa.' : result.message || 'Playback could not start.');

      if (result.torrent_id) {
        setActiveTorrentId(result.torrent_id);
        setPlayback({
          ok: true,
          torrent_id: result.torrent_id,
          state: result.state,
          message: 'In-app stream is preparing. Playback will begin when enough data is ready.',
          progress: null,
          downloaded_bytes: null,
          total_bytes: null,
          peers: null,
          download_speed: null,
          playlist_url: result.playlist_url || `http://127.0.0.1:3030/torrents/${result.torrent_id}/playlist`,
        });
        revealControls();
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Desktop playback could not start.');
    }
  };

  const startDownloadOnly = async () => {
    if (!source) {
      setStatus('error');
      setMessage('Choose a source first.');
      return;
    }

    setDownloadStatus('starting');
    setMessage('Starting local download...');
    try {
      const result = await startLocalDownloadWithSettings(source, settings);
      setDownloadStatus(result.ok ? 'ready' : 'error');
      setMessage(result.message || 'Local download started.');
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
      setDownloadStatus('error');
      setMessage(error instanceof Error ? error.message : 'Local download could not start.');
    }
  };

  const stopActive = async () => {
    if (!activeTorrentId) {
      setStatus('idle');
      setDownloadStatus('idle');
      setMessage('Nothing active to stop.');
      return;
    }
    try {
      await stopLocalPlayback(activeTorrentId);
      setActiveTorrentId('');
      setPlayback(null);
      setStatus('idle');
      setDownloadStatus('idle');
      setMessage('Local stream stopped.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not stop local playback.');
    }
  };

  const openDedicatedPlayer = async (reason = 'Opening the dedicated player...') => {
    if (!activeTorrentId) {
      setMessage('Start a source first.');
      return;
    }

    setMessage(reason);
    try {
      const result = await openLocalTorrentPlayer(
        activeTorrentId,
        source ? shortTitle(source) : 'Local stream',
        settings,
      );
      setStatus(result.ok ? 'ready' : 'error');
      setMessage(result.ok ? 'Dedicated player opened. It supports more anime video formats than the in-app preview.' : result.message || 'Dedicated player could not open.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not open the dedicated player.');
    }
  };

  const handleEmbeddedPlayerError = () => {
    if (!activeTorrentId || fallbackOpenedRef.current === activeTorrentId) {
      setMessage('This source is not playable in the in-app preview. Try the dedicated player or choose another source.');
      return;
    }

    fallbackOpenedRef.current = activeTorrentId;
    void openDedicatedPlayer('This source needs the dedicated player. Opening it now...');
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
            message: 'Local playback status could not be read yet.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktop, settings]);

  useEffect(() => {
    if (!desktop || submittedSourceQuery || builtSourceQuery.length < 2) return;
    setSubmittedSourceQuery(builtSourceQuery);
  }, [builtSourceQuery, desktop, submittedSourceQuery]);

  useEffect(() => {
    if (!rankedSearchedSources.length || !submittedSourceQuery || autoSelectedQuery === submittedSourceQuery) return;
    if (!source) {
      selectTorrentSource(rankedSearchedSources[0]);
      setMessage('Best source selected automatically.');
    }
    setAutoSelectedQuery(submittedSourceQuery);
  }, [autoSelectedQuery, rankedSearchedSources, source, submittedSourceQuery]);

  useEffect(() => {
    if (!desktop || !activeTorrentId) return undefined;
    let cancelled = false;

    const refreshPlayback = async () => {
      try {
        const nextPlayback = await getLocalPlaybackProgress(activeTorrentId);
        if (!cancelled) setPlayback(nextPlayback);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not read playback progress.');
      }
    };

    refreshPlayback();
    const interval = window.setInterval(refreshPlayback, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTorrentId, desktop]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    video.playbackRate = playbackRate;
  }, [muted, playbackRate, volume, playbackUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;
      if (event.code === 'Space') {
        event.preventDefault();
        void togglePlay();
      } else if (event.code === 'ArrowLeft') {
        seekBy(-10);
      } else if (event.code === 'ArrowRight') {
        seekBy(10);
      } else if (event.key.toLowerCase() === 'f') {
        void toggleFullscreen();
      } else if (event.key.toLowerCase() === 'm') {
        setMuted((value) => !value);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    if (!duration || duration < 30) return;
    const remaining = duration - currentTime;
    if (remaining > 0 && remaining <= 12) {
      setNextCountdown(Math.ceil(remaining));
    } else {
      setNextCountdown(null);
    }
  }, [currentTime, duration]);

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const buffering = status === 'starting' || (activeTorrentId && playback && !playbackUrl);

  return (
    <div className={`streamnyaa-watch-page mx-auto px-4 py-5 lg:px-7 ${theatreMode ? 'max-w-[1680px]' : 'max-w-[1480px]'}`}>
      <Seo
        title="Local Desktop Player | StreamNyaa"
        description="StreamNyaa desktop local torrent playback screen."
        canonicalPath="/local-player"
        robots="noindex, nofollow"
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 hover:border-primary/40 hover:text-white"
            aria-label="Back home"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Now watching</p>
            <h1 className="truncate text-xl font-black text-white md:text-2xl">{playerTitle}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`hidden rounded-full border px-3 py-1.5 text-xs font-black md:inline-flex ${runtimeReady ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-300'}`}>
            {runtimeLabel(runtime)}
          </span>
          <button
            type="button"
            onClick={() => setTheatreMode((value) => !value)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 text-xs font-black text-white/68 hover:border-primary/40 hover:text-white"
          >
            {theatreMode ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            {theatreMode ? 'Compact' : 'Theatre'}
          </button>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 text-xs font-black text-white/68 hover:border-primary/40 hover:text-white"
          >
            {sidebarCollapsed ? <ListVideo className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {sidebarCollapsed ? 'Episodes' : 'Hide panel'}
          </button>
        </div>
      </div>

      <section className={`grid gap-5 ${sidebarCollapsed ? 'grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_420px]'}`}>
        <div className="space-y-5">
          <div
            className="streamnyaa-watch-stage group relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#020204] shadow-2xl shadow-black/45"
            onMouseMove={revealControls}
            onMouseEnter={revealControls}
          >
            <div
              className="pointer-events-none absolute -inset-20 opacity-70 blur-3xl"
              style={{
                background: `radial-gradient(circle at 24% 14%, rgba(225,29,72,${ambientStrength / 320}), transparent 30%), radial-gradient(circle at 78% 86%, rgba(79,70,229,${ambientStrength / 420}), transparent 34%)`,
              }}
            />
            <div className="relative aspect-video overflow-hidden bg-black">
              {playbackUrl ? (
                <video
                  ref={videoRef}
                  key={playbackUrl}
                  src={playbackUrl}
                  autoPlay
                  playsInline
                  preload="auto"
                  className="h-full w-full bg-black object-contain"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onLoadedMetadata={(event) => {
                    setDuration(event.currentTarget.duration || 0);
                    event.currentTarget.volume = volume;
                    event.currentTarget.muted = muted;
                    event.currentTarget.playbackRate = playbackRate;
                  }}
                  onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
                  onEnded={() => setNextCountdown(10)}
                  onError={handleEmbeddedPlayerError}
                  onDoubleClick={() => void toggleFullscreen()}
                />
              ) : (
                <div className="relative grid h-full place-items-center overflow-hidden">
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(225,29,72,0.22),transparent_36%),radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.10),transparent_28%)]" />
                  {buffering ? (
                    <div className="relative text-center">
                      <div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.5rem] border border-primary/25 bg-primary/10 shadow-2xl shadow-primary/10">
                        <Loader2 className="h-9 w-9 animate-spin text-primary" />
                      </div>
                      <p className="mt-5 text-lg font-black text-white">Preparing stream</p>
                      <p className="mt-2 text-sm text-white/48">Buffering enough pieces for smooth playback.</p>
                    </div>
                  ) : source ? (
                    <div className="relative max-w-lg text-center">
                      <button
                        type="button"
                        onClick={() => void togglePlay()}
                        disabled={!canPlay}
                        className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-white text-black shadow-2xl shadow-black/30 transition-transform hover:scale-105 disabled:opacity-45"
                      >
                        <Play className="ml-1 h-10 w-10 fill-current" />
                      </button>
                      <h2 className="mt-6 text-3xl font-black text-white">Ready when you are</h2>
                      <p className="mt-3 text-sm leading-6 text-white/58">Start local playback, then the custom player controls will take over.</p>
                    </div>
                  ) : (
                    <div className="relative max-w-md text-center">
                      <MonitorPlay className="mx-auto h-14 w-14 text-primary" />
                      <h2 className="mt-5 text-3xl font-black text-white">Choose a source</h2>
                      <p className="mt-3 text-sm leading-6 text-white/56">Search from the episode panel or open the Sources page.</p>
                    </div>
                  )}
                </div>
              )}

              <div className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/78 to-transparent p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/42">StreamNyaa Theatre</p>
                      <p className="mt-1 truncate text-lg font-black text-white">{playerTitle}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-black text-white/58">
                      <span>{source?.episode ? `Episode ${source.episode}` : 'Source selected'}</span>
                      <span className="h-1 w-1 rounded-full bg-white/35" />
                      <span>{quality || 'Auto'}</span>
                    </div>
                  </div>
                </div>

                {showResume && source && !playbackUrl ? (
                  <div className="pointer-events-auto absolute left-5 top-24 max-w-sm rounded-2xl border border-white/10 bg-black/58 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
                    <p className="text-sm font-black text-white">Resume from selected source?</p>
                    <p className="mt-1 text-xs leading-5 text-white/48">Your last source is ready in the player queue.</p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => void start()} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-black">Resume</button>
                      <button onClick={() => setShowResume(false)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-white/62">Dismiss</button>
                    </div>
                  </div>
                ) : null}

                {sourceWarnings.length ? (
                  <div className="pointer-events-none absolute right-5 top-24 hidden max-w-sm space-y-2 lg:block">
                    {sourceWarnings.slice(0, 2).map((warning) => (
                      <div key={warning} className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 backdrop-blur-xl">
                        {warning}
                      </div>
                    ))}
                  </div>
                ) : null}

                {nextCountdown !== null ? (
                  <div className="pointer-events-auto absolute bottom-28 right-5 w-80 rounded-2xl border border-white/10 bg-black/62 p-4 shadow-2xl shadow-black/45 backdrop-blur-xl">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Up next</p>
                    <p className="mt-2 text-sm font-black text-white">Next episode starts in {nextCountdown}s</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(6, (nextCountdown / 12) * 100)}%` }} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-black">Continue</button>
                      <button onClick={() => setNextCountdown(null)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-white/62">Cancel</button>
                    </div>
                  </div>
                ) : null}

                <div className="pointer-events-auto absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/62 to-transparent p-5">
                  <div className="mb-3">
                    <div className="relative h-5">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={progressPercent || 0}
                        onChange={(event) => seekToPercent(Number(event.target.value))}
                        className="streamnyaa-player-range absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 cursor-pointer"
                        aria-label="Seek timeline"
                      />
                      <div className="pointer-events-none absolute bottom-full left-[42%] mb-2 hidden rounded-lg border border-white/10 bg-black/78 px-2 py-1 text-[10px] font-black text-white shadow-xl backdrop-blur group-hover:block">
                        Preview {formatTime(duration * 0.42)}
                      </div>
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] font-bold text-white/46">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1">
                      <PlayerIconButton label={isPlaying ? 'Pause (Space)' : 'Play (Space)'} onClick={() => void togglePlay()} disabled={!source || (!playbackUrl && !canPlay)}>
                        {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
                      </PlayerIconButton>
                      <PlayerIconButton label="Back 10 seconds" onClick={() => seekBy(-10)} disabled={!playbackUrl}>
                        <Rewind className="h-5 w-5" />
                      </PlayerIconButton>
                      <PlayerIconButton label="Forward 10 seconds" onClick={() => seekBy(10)} disabled={!playbackUrl}>
                        <FastForward className="h-5 w-5" />
                      </PlayerIconButton>
                      <button className="ml-1 rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-black text-white/72 hover:border-primary/35 hover:text-white">
                        Skip intro
                      </button>
                      <button className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-black text-white/72 hover:border-primary/35 hover:text-white">
                        Skip ending
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <PlayerIconButton label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((value) => !value)}>
                        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                      </PlayerIconButton>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={muted ? 0 : volume}
                        onChange={(event) => updateVolume(Number(event.target.value))}
                        className="streamnyaa-volume-range hidden w-24 md:block"
                        aria-label="Volume"
                      />
                      <PlayerIconButton label={subtitleEnabled ? 'Subtitles on' : 'Subtitles off'} onClick={() => setSubtitleEnabled((value) => !value)}>
                        <Captions className={`h-5 w-5 ${subtitleEnabled ? 'text-primary' : ''}`} />
                      </PlayerIconButton>
                      <PlayerIconButton label="Picture in picture" onClick={() => void togglePictureInPicture()} disabled={!playbackUrl}>
                        <PictureInPicture2 className="h-5 w-5" />
                      </PlayerIconButton>
                      <PlayerIconButton label="Settings" onClick={() => setShowSettings((value) => !value)}>
                        <Settings className="h-5 w-5" />
                      </PlayerIconButton>
                      <PlayerIconButton label="Fullscreen (F)" onClick={() => void toggleFullscreen()}>
                        <Maximize className="h-5 w-5" />
                      </PlayerIconButton>
                    </div>
                  </div>
                </div>

                {showSettings ? (
                  <div className="pointer-events-auto absolute bottom-24 right-5 w-80 rounded-2xl border border-white/10 bg-[#08080a]/92 p-4 shadow-2xl shadow-black/50 backdrop-blur-2xl">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-black text-white">Playback settings</p>
                      <button onClick={() => setShowSettings(false)} className="rounded-full p-1 text-white/48 hover:bg-white/10 hover:text-white">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-white/42">Quality</span>
                        <select value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)} className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm font-bold text-white">
                          <option value="">Auto</option>
                          <option value="1080p">1080p</option>
                          <option value="720p">720p</option>
                          <option value="raw">Raw</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-white/42">Speed</span>
                        <select value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))} className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm font-bold text-white">
                          {[0.75, 1, 1.25, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-white/42">Subtitle size</span>
                        <input type="range" min={14} max={28} value={subtitleSize} onChange={(event) => setSubtitleSize(Number(event.target.value))} className="w-full accent-primary" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-white/42">Ambient glow</span>
                        <input type="range" min={20} max={100} value={ambientStrength} onChange={(event) => setAmbientStrength(Number(event.target.value))} className="w-full accent-primary" />
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Stream status</p>
                  <p className="mt-1 text-sm font-bold text-white/72">{friendlyRuntimeMessage(playback?.message || message || 'Waiting for playback.')}</p>
                </div>
                <span className={`rounded-md border px-3 py-1 text-xs font-black ${status === 'error' ? 'border-red-500/25 bg-red-500/10 text-red-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'}`}>
                  {playback?.state || status}
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.max(4, Math.min(100, playback?.progress ?? (playbackUrl ? 100 : 6)))}%` }}
                />
              </div>
              <div className="mt-3 grid gap-2 text-xs font-bold text-muted-foreground sm:grid-cols-3">
                <span>{playback?.progress != null ? `${Math.round(playback.progress)}% ready` : playbackUrl ? 'Playback ready' : 'Preparing stream'}</span>
                <span>{formatBytes(playback?.downloaded_bytes)} / {formatBytes(playback?.total_bytes)}</span>
                <span>{playback?.peers ?? 0} peers - {formatBytes(playback?.download_speed)}/s</span>
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Shortcuts</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-white/58">
                {[
                  ['Space', 'Play/Pause'],
                  ['← / →', 'Seek 10s'],
                  ['F', 'Fullscreen'],
                  ['M', 'Mute'],
                ].map(([key, label]) => (
                  <div key={key} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <span className="font-black text-white">{key}</span>
                    <span className="ml-2">{label}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {!sidebarCollapsed ? (
          <aside className="rounded-[1.7rem] border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/25 backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
              <div className="flex rounded-full border border-white/10 bg-black/25 p-1">
                {[
                  ['episodes', ListVideo, 'Episodes'],
                  ['sources', Download, 'Sources'],
                  ['info', Info, 'Info'],
                ].map(([tab, Icon, label]) => {
                  const TabIcon = Icon as typeof ListVideo;
                  return (
                    <button
                      key={tab as string}
                      type="button"
                      onClick={() => setSidebarTab(tab as SidebarTab)}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black transition-colors ${sidebarTab === tab ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
                    >
                      <TabIcon className="h-3.5 w-3.5" />
                      {label as string}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setSidebarCollapsed(true)} className="rounded-full p-2 text-white/44 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {sidebarTab === 'episodes' ? (
              <div className="max-h-[calc(100vh-230px)] overflow-y-auto p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-black text-white">Episode navigation</h2>
                    <p className="mt-1 text-xs text-white/42">Progress-aware episode switching.</p>
                  </div>
                  <button onClick={() => setSidebarTab('sources')} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-white/58 hover:border-primary/35 hover:text-white">
                    Find source
                  </button>
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
                          setSidebarTab('sources');
                          setSubmittedSourceQuery([sourceQuery.trim(), String(episode).padStart(2, '0'), quality && quality !== 'raw' ? quality : ''].filter(Boolean).join(' '));
                        }}
                        className={`grid w-full grid-cols-[68px_1fr_auto] items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${active ? 'border-primary/45 bg-primary/10' : 'border-white/10 bg-black/25 hover:border-primary/30 hover:bg-primary/10'}`}
                      >
                        <span className="relative block aspect-video overflow-hidden rounded-xl bg-[linear-gradient(135deg,rgba(225,29,72,0.28),rgba(255,255,255,0.08))]">
                          <span className="absolute inset-0 grid place-items-center text-xs font-black text-white/60">EP</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-white">Episode {episode}</span>
                          <span className="mt-1 block text-xs text-white/42">{active ? 'Currently selected' : 'Search matching source'}</span>
                          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10">
                            <span className="block h-full rounded-full bg-primary" style={{ width: active ? `${Math.max(8, progressPercent)}%` : episode < Number(selectedEpisode || 0) ? '100%' : '0%' }} />
                          </span>
                        </span>
                        {active ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-white/30" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {sidebarTab === 'sources' ? (
              <div className="max-h-[calc(100vh-230px)] overflow-y-auto p-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-primary" />
                  <h2 className="font-black text-white">Source selector</h2>
                </div>
                <p className="mt-1 text-xs text-white/42">Search, filter, and switch playback sources without leaving the player.</p>

                <div className="mt-4 space-y-3">
                  <input
                    value={sourceQuery}
                    onChange={(event) => setSourceQuery(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/28 focus:border-primary"
                    placeholder="Anime title"
                  />
                  <div className="grid grid-cols-[1fr_120px] gap-2">
                    <select
                      value={selectedEpisode}
                      onChange={(event) => setSelectedEpisode(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm font-bold text-white outline-none focus:border-primary [&>option]:bg-background"
                    >
                      <option value="">Batch / no episode</option>
                      {Array.from({ length: 200 }, (_, index) => index + 1).map((episode) => (
                        <option key={episode} value={episode}>Episode {episode}</option>
                      ))}
                    </select>
                    <select
                      value={quality}
                      onChange={(event) => setQuality(event.target.value as typeof quality)}
                      className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm font-bold text-white outline-none focus:border-primary [&>option]:bg-background"
                    >
                      <option value="1080p">1080p</option>
                      <option value="720p">720p</option>
                      <option value="">Any</option>
                      <option value="raw">Raw</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Best 1080p', '1080p', '1080p'],
                      ['Best 720p', '720p', '720p'],
                      ['Dual Audio', '', 'dual audio'],
                      ['HEVC', '', 'HEVC'],
                    ].map(([label, nextQuality, queryLabel]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => applyPreset(nextQuality as typeof quality, queryLabel)}
                        className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs font-black text-white/72 hover:border-primary/40 hover:text-white"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {selectedEpisode ? (
                    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs font-bold text-white/48">
                      <span>Prefer exact episode matches</span>
                      <input
                        type="checkbox"
                        checked={strictEpisode}
                        onChange={(event) => setStrictEpisode(event.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setSubmittedSourceQuery(builtSourceQuery);
                      if (submittedSourceQuery === builtSourceQuery) refetchSources();
                    }}
                    disabled={sourceQuery.trim().length < 2 || sourcesLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-3 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sourcesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {sourcesLoading ? 'Searching' : 'Search sources'}
                  </button>
                  {rankedSearchedSources.length ? (
                    <button
                      type="button"
                      onClick={chooseBestSource}
                      className="w-full rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-sm font-black text-emerald-300 hover:bg-emerald-500/15"
                    >
                      Select best result
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 space-y-2">
                  {sourcesLoading ? (
                    <div className="space-y-2">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-black/25" />
                      ))}
                    </div>
                  ) : sourcesError ? (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm leading-6 text-red-200">
                      {sourcesErrorValue instanceof Error ? sourcesErrorValue.message : 'Source search failed.'}
                    </div>
                  ) : rankedSearchedSources.length ? (
                    <>
                      {selectedEpisode ? (
                        <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-bold text-white/45">
                          {exactEpisodeCount
                            ? `${exactEpisodeCount} exact episode match${exactEpisodeCount === 1 ? '' : 'es'} found.`
                            : 'No exact episode marker found; showing best related sources.'}
                        </div>
                      ) : null}
                      {rankedSearchedSources.slice(0, 12).map((torrent) => {
                        const active = source?.magnet === torrent.magnet;
                        const match = selectedEpisode ? sourceEpisodeMatch(torrent.title, selectedEpisode) : 'none';
                        return (
                          <button
                            key={torrent.infoHash || torrent.magnet}
                            type="button"
                            onClick={() => selectTorrentSource(torrent)}
                            className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                              active
                                ? 'border-primary/40 bg-primary/10'
                                : 'border-white/10 bg-black/25 hover:border-primary/30 hover:bg-primary/10'
                            }`}
                          >
                            <span className="line-clamp-2 text-sm font-bold text-white">{torrent.title}</span>
                            <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-white/42">
                              <span>Score {sourceQualityScore(torrent)}</span>
                              <span>{torrent.size}</span>
                              <span>{torrent.seeders} seeders</span>
                              <span>{sourceFreshnessLabel(torrent)}</span>
                              {selectedEpisode ? <span>{match === 'exact' ? 'Exact episode' : match === 'batch' ? 'Batch' : match === 'mismatch' ? 'Different episode' : 'Related source'}</span> : null}
                            </span>
                            <span className="mt-2 flex flex-wrap gap-1.5">
                              {getTorrentBadges(torrent).slice(0, 3).map((badge) => (
                                <span key={`${torrent.infoHash}-${badge.label}`} className={torrentBadgeClassName(badge.tone)}>
                                  {badge.label}
                                </span>
                              ))}
                            </span>
                          </button>
                        );
                      })}
                    </>
                  ) : sourceQuery.trim().length >= 2 ? (
                    <div className="rounded-2xl border border-dashed border-white/12 p-4 text-sm leading-6 text-white/45">
                      No sources found for this search yet.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {sidebarTab === 'info' ? (
              <div className="max-h-[calc(100vh-230px)] overflow-y-auto p-4">
                <div className="space-y-4">
                  <section className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <h2 className="font-black text-white">Anime info</h2>
                    <p className="mt-2 text-sm leading-6 text-white/50">{source?.title || 'No source selected yet.'}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-white/58">
                      {source?.size ? <span className="rounded-full bg-white/10 px-3 py-1.5">{source.size}</span> : null}
                      {source?.seeders ? <span className="rounded-full bg-white/10 px-3 py-1.5">{source.seeders} seeders</span> : null}
                      <span className="rounded-full bg-white/10 px-3 py-1.5">{quality || 'Auto'} quality</span>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <h2 className="font-black text-white">Subtitle style</h2>
                    <div className="mt-3 rounded-xl bg-black/35 p-3 text-center" style={{ fontSize: subtitleSize }}>
                      <span className="text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.9)]">English subtitle preview</span>
                      <span className="mt-1 block text-sm text-white/54 [text-shadow:0_2px_10px_rgba(0,0,0,0.9)]">日本語 subtitle layer</span>
                    </div>
                    <label className="mt-3 flex items-center justify-between text-sm font-bold text-white/58">
                      <span>Dual subtitle mode</span>
                      <input type="checkbox" className="accent-primary" defaultChecked />
                    </label>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <h2 className="font-black text-white">Playback preferences</h2>
                    <div className="mt-3 grid gap-2 text-sm font-bold text-white/58">
                      {[
                        [Languages, 'Audio language', 'Auto'],
                        [Gauge, 'Playback speed', `${playbackRate}x`],
                        [Headphones, 'Hardware acceleration', 'On'],
                        [Keyboard, 'Keyboard shortcuts', 'Enabled'],
                        [MessageCircle, 'Live comments', 'Hidden'],
                      ].map(([Icon, label, value]) => {
                        const RowIcon = Icon as typeof Languages;
                        return (
                          <div key={label as string} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                            <RowIcon className="h-4 w-4 text-primary" />
                            <span>{label as string}</span>
                            <span className="ml-auto text-white/34">{value as string}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}
          </aside>
        ) : null}
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_420px]">
        <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-white">Recent sources</h2>
              <p className="mt-1 text-xs text-white/42">Click one to switch playback.</p>
            </div>
            {sourceOptions.length ? (
              <button
                type="button"
                onClick={clearSources}
                className="rounded-lg border border-border p-2 text-muted-foreground hover:border-primary/40 hover:text-primary"
                aria-label="Clear recent sources"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sourceOptions.length ? sourceOptions.slice(0, 6).map((item) => {
              const active = source?.magnet === item.magnet;
              return (
                <button
                  key={item.magnet}
                  type="button"
                  onClick={() => selectSource(item)}
                  className={`rounded-2xl border p-3 text-left transition-colors ${
                    active
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-white/10 bg-black/25 hover:border-primary/30 hover:bg-primary/10'
                  }`}
                >
                  <span className="line-clamp-2 text-sm font-bold text-white">{shortTitle(item)}</span>
                  <span className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-white/42">
                    {item.episode ? <span>Ep {item.episode}</span> : null}
                    {item.size ? <span>{item.size}</span> : null}
                    {item.seeders ? <span>{item.seeders} seeders</span> : null}
                  </span>
                </button>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-white/12 p-4 text-sm leading-6 text-white/45">
                No recent sources yet. Start from the Sources page.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-black text-white">Smart watch states</h2>
          </div>
          <div className="mt-4 grid gap-2 text-sm font-bold text-white/56">
            {[
              ['Resume popup', showResume ? 'Ready' : 'Dismissed'],
              ['Auto next episode', nextCountdown !== null ? `${nextCountdown}s` : 'Waiting'],
              ['Controls', showControls ? 'Visible' : 'Auto-hidden'],
              ['Theatre mode', theatreMode ? 'On' : 'Compact'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                <span>{label}</span>
                <span className="text-white/34">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
