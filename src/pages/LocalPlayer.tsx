import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  MonitorPlay,
  Play,
  RefreshCw,
  Search,
  Trash2,
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

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
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

export default function LocalPlayer() {
  const desktop = isDesktopApp();
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
  const fallbackOpenedRef = useRef('');

  const sourceOptions = sourceHistory.length ? sourceHistory : source ? [source] : [];
  const runtimeReady = Boolean(runtime?.ready);
  const canPlay = Boolean(desktop && source && runtimeReady && status !== 'starting');
  const playbackUrl = playback?.playlist_url || '';
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

  const refreshRuntime = async (nextSettings = settings) => {
    const nextRuntime = await getDesktopRuntimeStatus(nextSettings);
    if (nextRuntime) setRuntime(nextRuntime);
  };

  const selectSource = (nextSource: LocalPlaybackSource) => {
    saveLocalPlaybackSource(nextSource);
    setSource(nextSource);
    setSourceHistory(loadLocalPlaybackHistory());
    setStatus('idle');
    setMessage('Source selected.');
    setActiveTorrentId('');
    setPlayback(null);
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
  }, [desktop]);

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

  const start = async () => {
    if (!source) {
      setStatus('error');
      setMessage('Choose a source first.');
      return;
    }

    setStatus('starting');
    setMessage('Preparing in-app playback...');
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

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 lg:px-7">
      <Seo
        title="Local Desktop Player | StreamNyaa"
        description="StreamNyaa desktop local torrent playback screen."
        canonicalPath="/local-player"
        robots="noindex, nofollow"
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Local playback</p>
          <h1 className="mt-1 text-4xl font-black tracking-tight text-white md:text-5xl">Player</h1>
          <p className="mt-2 text-sm text-white/48">Pick the right source, play inside StreamNyaa, and keep the local stream under control.</p>
        </div>
        <Link
          to="/nyaa?desktop=1"
          className="inline-flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.065] px-5 py-3 text-sm font-black text-white backdrop-blur-xl hover:border-primary/40 hover:text-primary"
        >
          <Download className="h-4 w-4" />
          Find sources
        </Link>
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#040406] shadow-2xl shadow-black/35">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.045] px-6 py-4 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${runtimeReady ? 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]' : 'bg-amber-400'}`} />
                <span className="text-sm font-black text-white">{runtimeLabel(runtime)}</span>
                <span className="hidden text-xs font-semibold text-white/38 md:inline">{friendlyRuntimeMessage(runtime?.message || 'Checking local playback.')}</span>
              </div>
              <button
                type="button"
                onClick={() => refreshRuntime()}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-white/70 hover:border-primary/40 hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>

            <div className="relative grid min-h-[560px] place-items-center overflow-hidden px-6 py-10 text-center">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(225,29,72,0.22),transparent_32%),radial-gradient(circle_at_20%_100%,rgba(255,255,255,0.08),transparent_30%)]" />
              {!desktop ? (
                <div className="relative max-w-md">
                  <AlertTriangle className="mx-auto h-12 w-12 text-primary" />
                  <h2 className="mt-4 text-2xl font-black text-white">Desktop app required</h2>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    Local playback needs the StreamNyaa desktop app.
                  </p>
                </div>
              ) : !source ? (
                <div className="relative max-w-md">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.06] text-primary shadow-2xl shadow-black/25">
                    <MonitorPlay className="h-11 w-11" />
                  </div>
                  <h2 className="mt-6 text-3xl font-black text-white">Choose a source to begin</h2>
                  <p className="mt-3 text-sm leading-6 text-white/58">
                    Search from the panel, select the best episode match, then start local playback.
                  </p>
                  <Link
                    to="/nyaa?desktop=1"
                    className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-black text-white shadow-xl shadow-primary/25 hover:bg-primary/90"
                  >
                    <Download className="h-4 w-4" />
                    Find a source
                  </Link>
                </div>
              ) : (
                <div className="relative w-full max-w-4xl">
                  {playbackUrl ? (
                    <div className="mb-7 overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/50">
                      <video
                        key={playbackUrl}
                        src={playbackUrl}
                        controls
                        autoPlay
                        playsInline
                        preload="auto"
                        className="aspect-video w-full bg-black"
                        onError={handleEmbeddedPlayerError}
                      />
                    </div>
                  ) : (
                    <div className="mx-auto mb-7 flex h-24 w-24 items-center justify-center rounded-[2rem] border border-primary/25 bg-primary/15 text-primary shadow-2xl shadow-primary/10">
                      {status === 'starting' ? <Loader2 className="h-9 w-9 animate-spin" /> : status === 'ready' ? <CheckCircle2 className="h-9 w-9" /> : <Play className="ml-1 h-9 w-9 fill-current" />}
                    </div>
                  )}

                  <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Selected source</p>
                  <h2 className="mx-auto mt-3 line-clamp-2 max-w-3xl text-3xl font-black leading-tight text-white md:text-4xl">
                    {shortTitle(source)}
                  </h2>
                  <p className="mx-auto mt-4 line-clamp-2 max-w-2xl text-sm leading-6 text-white/50">{source.title}</p>

                  <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs font-black text-white/66">
                    {source.episode ? <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">Episode {source.episode}</span> : null}
                    {source.size ? <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">{source.size}</span> : null}
                    {source.seeders ? <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">{source.seeders} seeders</span> : null}
                  </div>

                  {sourceWarnings.length ? (
                    <div className="mx-auto mt-5 max-w-xl space-y-2 text-left">
                      {sourceWarnings.map((warning) => (
                        <div key={warning} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
                          {warning}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-9 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={start}
                      disabled={!canPlay}
                      className="inline-flex min-w-[190px] items-center justify-center gap-3 rounded-2xl bg-primary px-8 py-4 text-base font-black text-white shadow-xl shadow-primary/25 transition-transform hover:-translate-y-0.5 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {status === 'starting' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-current" />}
                      {status === 'starting' ? 'Starting' : playbackUrl ? 'Restart' : 'Play'}
                    </button>
                    <button
                      type="button"
                      onClick={startDownloadOnly}
                      disabled={!desktop || !source || !runtimeReady || downloadStatus === 'starting'}
                      className="inline-flex min-w-[150px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-5 py-4 text-sm font-black text-white backdrop-blur-xl hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {downloadStatus === 'starting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={stopActive}
                      disabled={!activeTorrentId && status !== 'starting' && downloadStatus !== 'starting'}
                      className="inline-flex min-w-[110px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.08] px-5 py-4 text-sm font-black text-white/72 backdrop-blur-xl hover:border-red-400/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Stop
                    </button>
                    <button
                      type="button"
                      onClick={() => openDedicatedPlayer()}
                      disabled={!activeTorrentId || !runtimeReady}
                      className="inline-flex min-w-[160px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.08] px-5 py-4 text-sm font-black text-white/72 backdrop-blur-xl hover:border-primary/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Dedicated player
                    </button>
                  </div>

                  {message ? (
                    <p className={`mx-auto mt-4 max-w-xl text-sm leading-6 ${status === 'error' ? 'text-red-300' : 'text-white/55'}`}>
                      {message}
                    </p>
                  ) : null}

                  {status === 'starting' ? (
                    <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-primary">Starting stream</span>
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                      <div className="space-y-3">
                        {['Starting local playback', 'Adding selected source', 'Preparing in-app player'].map((step, index) => (
                          <div key={step} className="flex items-center gap-3">
                            <span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-primary' : 'bg-white/25'}`} />
                            <span className="text-sm font-semibold text-white/68">{step}</span>
                            <span className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                              <span className="block h-full w-1/2 animate-pulse rounded-full bg-primary" />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {playback ? (
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Stream status</p>
                  <p className="mt-1 text-sm font-bold text-white/72">{friendlyRuntimeMessage(playback.message)}</p>
                </div>
                <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-300">
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
                <span>{playback.peers ?? 0} peers - {formatBytes(playback.download_speed)}/s</span>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-5">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              <h2 className="font-black text-white">Source command</h2>
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

            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
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
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
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

            <div className="mt-4 space-y-2">
              {sourceOptions.length ? sourceOptions.map((item) => {
                const active = source?.magnet === item.magnet;
                return (
                  <button
                    key={item.magnet}
                    type="button"
                    onClick={() => selectSource(item)}
                    className={`w-full rounded-2xl border p-3 text-left transition-colors ${
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
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <MonitorPlay className="h-4 w-4 text-primary" />
              <h2 className="font-black text-white">Playback status</h2>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm font-black text-white">{runtimeLabel(runtime)}</p>
              <p className="mt-1 text-xs leading-5 text-white/45">{friendlyRuntimeMessage(runtime?.message || 'Checking local playback.')}</p>
            </div>
            <button
              type="button"
              onClick={() => refreshRuntime()}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-2.5 text-xs font-black text-white/70 hover:border-primary/40 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh status
            </button>
          </section>
        </aside>
      </section>
    </div>
  );
}
