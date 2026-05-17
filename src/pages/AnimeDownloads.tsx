import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAnimeDetails, fetchAnimeEpisodes } from '../api/jikan';
import { dedupeNyaaItems, searchNyaa } from '../api/nyaa';
import { Download, HardDrive, ArrowLeft, Loader2, AlertTriangle, Languages, Volume2, ListVideo, Link as LinkIcon, Play, Star, Copy, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { animePath } from '../lib/slug';
import Seo from '../components/Seo';
import { getTorrentBadges, torrentBadgeClassName, torrentMatchesSourceFilter } from '../lib/torrentBadges';
import type { TorrentSourceFilter } from '../lib/torrentBadges';
import { useAuth } from '../context/AuthContext';
import { saveDownloadHistory } from '../lib/activity';
import { SOURCE_PRESETS, sourceFreshnessLabel, sourceQualityLabel, sourceQualityScore } from '../lib/sourceQuality';
import { isDesktopApp, saveLocalPlaybackSource } from '../lib/desktop';

type AudioFilter = 'sub' | 'dub';

function sourceHealth(seedCount: number) {
  if (seedCount >= 100) return 'Fast';
  if (seedCount >= 50) return 'Healthy';
  if (seedCount >= 15) return 'Usable';
  return 'Low seed';
}

function releaseTrackerText(anime: any, selectedEpisodeNumber?: number | null) {
  const nextEpisode = anime?.nextAiringEpisode?.episode;
  const nextAiringAt = anime?.nextAiringEpisode?.airingAt;
  if (selectedEpisodeNumber) return `Episode ${selectedEpisodeNumber} selected`;
  if (!nextEpisode || !nextAiringAt) return anime?.status === 'RELEASING' ? 'Currently airing' : 'Release timing unavailable';
  const diffMs = nextAiringAt * 1000 - Date.now();
  const hours = Math.round(Math.abs(diffMs) / 36e5);
  if (diffMs >= 0) return `Episode ${nextEpisode} expected ${hours <= 24 ? 'today' : `in ${Math.ceil(hours / 24)} days`}`;
  return `Episode ${nextEpisode} aired ${hours || 1} hours ago`;
}

function isNotYetAired(anime: any) {
  const status = String(anime?.status || '').toUpperCase();
  return status === 'NOT_YET_RELEASED' || status === 'NOT_YET_AIRED' || status.includes('NOT_YET');
}

function knownAiredEpisodeCount(anime: any) {
  if (anime?.nextAiringEpisode?.episode) return Math.max(anime.nextAiringEpisode.episode - 1, 0);
  if (String(anime?.status || '').toUpperCase() === 'FINISHED') return anime?.episodes || 1;
  return 0;
}

function canSearchDownloads(anime: any) {
  if (!anime || isNotYetAired(anime)) return false;
  return true;
}

function isDualAudioSource(title = '') {
  return /\b(dub|dubbed|dual[\s-]?audio|multi[\s-]?audio|english[\s-]?audio|eng[\s-]?dub)\b/i.test(title);
}

function sourceResolution(title = '') {
  if (/\b2160p|4k\b/i.test(title)) return '4K';
  if (/\b1080p\b/i.test(title)) return '1080p';
  if (/\b720p\b/i.test(title)) return '720p';
  if (/\b480p\b/i.test(title)) return '480p';
  return 'AUTO';
}

export default function AnimeDownloads() {
  const { session, user } = useAuth();
  const desktopApp = isDesktopApp();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const epParam = searchParams.get('ep');
  const typeParam = searchParams.get('type');
  const playIntent = searchParams.get('play') === '1';
  const autoplayIntent = playIntent && searchParams.get('autoplay') === '1';
  const wideIntent = playIntent || searchParams.get('wide') === '1';
  const selectedEpisodeNumber = epParam && /^\d+$/.test(epParam) ? parseInt(epParam, 10) : null;
  const episodePage = selectedEpisodeNumber ? Math.max(1, Math.ceil(selectedEpisodeNumber / 100)) : 1;
  
  // If epParam is present, default filter to empty or "1080p" instead of "[Batch]"
  const [downloadFilter, setDownloadFilter] = useState(epParam && !playIntent ? '1080p' : epParam ? '' : '[Batch]');
  const [audioFilter, setAudioFilter] = useState<AudioFilter>(typeParam === 'dub' ? 'dub' : 'sub');
  const [sortBy, setSortBy] = useState<'best' | 'seeders' | 'size'>('best');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [sourceFilter, setSourceFilter] = useState<TorrentSourceFilter>('');
  const [showAllSources, setShowAllSources] = useState(false);
  const autoplayHandledRef = useRef('');

  const { data, isLoading: animeLoading } = useQuery({
    queryKey: ['anime', id],
    queryFn: () => fetchAnimeDetails(id!),
    enabled: !!id,
  });

  const anime = data?.data;
  const downloadSearchAvailable = canSearchDownloads(anime);
  const isBatchView = !epParam && downloadFilter === '[Batch]';
  const isCurrentlyAiring = anime?.status === 'RELEASING';
  const showAiringEpisodeResults = Boolean(isCurrentlyAiring && isBatchView);

  const { data: episodeData } = useQuery({
    queryKey: ['anime-download-episodes', id, episodePage],
    queryFn: () => fetchAnimeEpisodes(id!, episodePage),
    enabled: !!id && !!anime,
  });

  const { data: torrents, isLoading: torrentsLoading, isError: torrentsErrorState, error: torrentsError, refetch: refetchTorrents } = useQuery({
    queryKey: ['nyaa-download', anime?.title, epParam, downloadFilter, typeParam, audioFilter, showAiringEpisodeResults, showAllSources, wideIntent],
    queryFn: async () => {
      const romaji = anime?.title_romaji;
      const english = anime?.title_english;
      const native = anime?.title;

      const epStr = epParam ? epParam.padStart(2, '0') : '';
      const isDub = audioFilter === 'dub';
      const effectiveDownloadFilter = playIntent && epParam ? '' : showAiringEpisodeResults ? '1080p' : downloadFilter;

      const cleanTitle = (t: string) => {
        if (!t) return '';
        return t.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      };

      const performSearch = async (t: string, ep: string, preferDub = isDub) => {
        if (!t) return [];
        let query = `${cleanTitle(t)}`;
        if (ep) query += ` ${ep}`;
        if (effectiveDownloadFilter && effectiveDownloadFilter !== 'RAW') query += ` ${effectiveDownloadFilter}`;
        if (preferDub) query += ' dub';
        return await searchNyaa(query, effectiveDownloadFilter === 'RAW' ? '1_4' : '1_2', '0', '1', {
          pages: showAllSources || wideIntent ? 3 : 1,
          wide: showAllSources || wideIntent,
        });
      };

      const trySearches = async (epNumStr: string, preferDub = isDub) => {
        const titles = [romaji, english, native].filter((title, index, list): title is string => Boolean(title) && list.indexOf(title) === index);
        if (showAllSources) {
          const searches = await Promise.all(titles.map((title) => performSearch(title, epNumStr, preferDub)));
          return dedupeNyaaItems(searches.flat());
        }

        for (const title of titles) {
          const items = await performSearch(title, epNumStr, preferDub);
          if (items.length > 0) return items;
        }
        return [];
      };

      const prefersDub = (title = '') => /\b(dub|dubbed|dual[\s-]?audio|multi[\s-]?audio|english[\s-]?audio|eng[\s-]?dub)\b/i.test(title);
      const applyAudioFilter = (items: Awaited<ReturnType<typeof searchNyaa>>) => {
        const filtered = isDub
          ? items.filter((item) => prefersDub(item.title))
          : items.filter((item) => !prefersDub(item.title));
        return filtered.length ? filtered : items;
      };
      const removeBatchResults = (items: Awaited<ReturnType<typeof searchNyaa>>) => (
        showAiringEpisodeResults
          ? items.filter((item) => !/\b(batch|complete|season pack|complete season)\b/i.test(item.title))
          : items
      );

      let results = await trySearches(epStr);

      // Fallback without padding if still 0
      if (results.length === 0 && epParam && epStr !== epParam) {
        results = await trySearches(epParam);
      }

      // Playback needs a selectable source more than a perfect filter match.
      // If an episode-specific search is empty, broaden to title-only results automatically.
      if (results.length === 0 && epParam && playIntent) {
        results = await trySearches("");
      }
      
      // Secondary fallback without episode number at all (useful for movies or single OVAs)
      if (results.length === 0 && epParam === '1') {
        results = await trySearches("");
      }

      // If the watch flow prefers dual audio but nothing exists, fall back to the
      // healthiest normal release so playback still opens.
      if (results.length === 0 && isDub && playIntent) {
        results = await trySearches(epStr, false);
        if (results.length === 0 && epParam && epStr !== epParam) results = await trySearches(epParam, false);
        if (results.length === 0 && epParam) results = await trySearches("", false);
      }
      
      const filteredResults = removeBatchResults(applyAudioFilter(results));
      return filteredResults.length ? filteredResults : applyAudioFilter(results);
    },
    enabled: !!anime?.title && downloadSearchAvailable,
  });

  if (animeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!anime) return <div className="text-center py-20">Anime not found</div>;

  if (!downloadSearchAvailable) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Seo
          title={`${anime.title} Source Search Not Available Yet | StreamNyaa`}
          description={`${anime.title} has not aired yet, so StreamNyaa does not show download source search results for this title.`}
          canonicalPath={animePath(anime, '/downloads')}
          image={anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}
        />
        <Link to={data?.data ? animePath(data.data) : `/anime/${id}`} className="mb-6 flex w-fit items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
          Back to Anime Details
        </Link>
        <div className="overflow-hidden rounded-3xl border border-border bg-[var(--glass)]">
          <div className="grid gap-0 md:grid-cols-[180px_1fr]">
            <img
              src={anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}
              alt={anime.title}
              className="h-64 w-full object-cover md:h-full"
              referrerPolicy="no-referrer"
            />
            <div className="p-6 md:p-8">
              <p className="text-[11px] font-black uppercase tracking-wider text-primary">Source search unavailable</p>
              <h1 className="mt-2 text-3xl font-black text-foreground">{anime.title}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
                This title has not aired yet, so download source search is disabled to avoid showing unrelated or similarly named results. Source metadata will be useful after an episode has aired or the title is listed as released.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-muted-foreground">
                <span className="rounded-full bg-secondary px-3 py-1.5">{anime.status?.replace(/_/g, ' ') || 'Upcoming'}</span>
                {anime.nextAiringEpisode?.airingAt ? (
                  <span className="rounded-full bg-primary/10 px-3 py-1.5 text-primary">
                    Airs {new Date(anime.nextAiringEpisode.airingAt * 1000).toLocaleString()}
                  </span>
                ) : null}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/schedule" className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-black text-primary hover:bg-primary hover:text-primary-foreground">
                  Check schedule
                </Link>
                <Link to="/search" className="rounded-xl border border-border bg-background/60 px-4 py-2.5 text-sm font-black text-foreground hover:border-primary/40 hover:text-primary">
                  Browse anime
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const sortedTorrents = [...(torrents || [])].filter((torrent) => torrentMatchesSourceFilter(torrent, sourceFilter)).sort((a, b) => {
    if (sortBy === 'best') {
        if (Number(b.sourceScore || 0) !== Number(a.sourceScore || 0)) return Number(b.sourceScore || 0) - Number(a.sourceScore || 0);
        const trustedGroups = ['[SubsPlease]', '[Erai-raws]', '[Judas]', '[Ember]', '[ASW]', '[Cerberus]', '[Yameii]'];
        const trustedA = trustedGroups.some(g => a.title.includes(g)) ? 1 : 0;
        const trustedB = trustedGroups.some(g => b.title.includes(g)) ? 1 : 0;
        if (trustedA !== trustedB) return trustedB - trustedA;
        if (b.rawSeeders !== a.rawSeeders) return b.rawSeeders - a.rawSeeders;
        return b.rawSize - a.rawSize;
    } else if (sortBy === 'seeders') {
        if (b.rawSeeders !== a.rawSeeders) return sortDirection === 'asc' ? a.rawSeeders - b.rawSeeders : b.rawSeeders - a.rawSeeders;
        return sortDirection === 'asc' ? a.rawSize - b.rawSize : b.rawSize - a.rawSize;
    } else {
        if (b.rawSize !== a.rawSize) return sortDirection === 'asc' ? a.rawSize - b.rawSize : b.rawSize - a.rawSize;
        return sortDirection === 'asc' ? a.rawSeeders - b.rawSeeders : b.rawSeeders - a.rawSeeders;
    }
  });
  const autoplaySource = useMemo(() => {
    const candidates = [...(torrents || [])].sort((a, b) => {
      const dualDelta = Number(isDualAudioSource(b.title)) - Number(isDualAudioSource(a.title));
      if (dualDelta) return dualDelta;
      if (b.rawSeeders !== a.rawSeeders) return b.rawSeeders - a.rawSeeders;
      return sourceQualityScore(b) - sourceQualityScore(a);
    });
    return candidates[0];
  }, [torrents]);
  const topSource = autoplayIntent && autoplaySource ? autoplaySource : sortedTorrents[0];
  const visibleTorrents = showAllSources ? sortedTorrents : sortedTorrents.slice(0, 5);
  const hiddenSourceCount = Math.max(sortedTorrents.length - visibleTorrents.length, 0);
  const totalSeeders = sortedTorrents.reduce((sum, torrent) => sum + torrent.rawSeeders, 0);
  const highSeederCount = sortedTorrents.filter((torrent) => torrent.rawSeeders >= 50).length;
  const playbackSearchLabel = selectedEpisodeNumber
    ? `Episode ${selectedEpisodeNumber}${wideIntent ? ' with broader source matching' : ''}`
    : wideIntent
      ? 'Broad source matching'
      : 'Batch / all available episodes';
  const airedEpisodeCount = anime.nextAiringEpisode?.episode
    ? Math.max(anime.nextAiringEpisode.episode - 1, 0)
    : (anime.episodes || 0);
  const currentEpisodePageItems = episodeData?.data || [];
  const updateEpisodeSelection = (value: string) => {
    setShowAllSources(false);
    const nextParams = new URLSearchParams(searchParams);
    if (value === 'batch') {
      nextParams.delete('ep');
      setDownloadFilter('[Batch]');
    } else {
      nextParams.set('ep', value);
      setDownloadFilter('1080p');
    }
    nextParams.set('type', audioFilter);
    if (playIntent) nextParams.set('play', '1');
    if (wideIntent) nextParams.set('wide', '1');
    setSearchParams(nextParams);
  };
  const applyPreset = (preset: typeof SOURCE_PRESETS[number]) => {
    setShowAllSources(false);
    setDownloadFilter(preset.query);
    setAudioFilter(preset.type);
    setSourceFilter((preset.sourceFilter || '') as TorrentSourceFilter);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('type', preset.type);
    if (preset.sourceFilter === 'batch') nextParams.delete('ep');
    if (playIntent) nextParams.set('play', '1');
    if (wideIntent) nextParams.set('wide', '1');
    setSearchParams(nextParams);
  };
  const recordDownloadAction = (torrent: any, action: 'copy' | 'open') => {
    saveDownloadHistory({
      title: torrent.title,
      magnet: torrent.magnet,
      animeTitle: anime.title,
      animeId: anime.mal_id,
      episode: selectedEpisodeNumber || (downloadFilter === '[Batch]' ? 'batch' : null),
      action,
      size: torrent.size,
      seeders: torrent.seeders,
    }, session);
  };

  const openLocalPlayer = (torrent: any) => {
    saveLocalPlaybackSource({
      title: torrent.title,
      magnet: torrent.magnet,
      animeTitle: anime?.title,
      animeId: anime?.mal_id || id,
      episode: selectedEpisodeNumber || (isBatchView ? 'batch' : null),
      size: torrent.size,
      seeders: torrent.seeders,
    });
    recordDownloadAction(torrent, 'open');
    const query = window.location.search.includes('desktop=1') || autoplayIntent ? '?desktop=1&autoplay=1' : '';
    window.location.href = `/local-player${query}`;
  };

  useEffect(() => {
    if (!desktopApp || !autoplayIntent || torrentsLoading || !autoplaySource) return;
    const key = autoplaySource.magnet || autoplaySource.infoHash || autoplaySource.title;
    if (!key || autoplayHandledRef.current === key) return;
    autoplayHandledRef.current = key;
    openLocalPlayer(autoplaySource);
  }, [desktopApp, autoplayIntent, torrentsLoading, autoplaySource]);

  if (desktopApp && playIntent) {
    const poster = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
    const banner = anime.banner_image || poster;
    const genres = anime.genres?.map((genre: any) => genre.name).filter(Boolean) || [];
    const activeEpisode = selectedEpisodeNumber || Math.max(1, knownAiredEpisodeCount(anime) || 1);
    const firstEpisode = Math.max(1, activeEpisode - 2);
    const episodeCards = Array.from({ length: Math.min(8, Math.max(1, airedEpisodeCount || 8)) }, (_, index) => {
      const episodeNumber = firstEpisode + index;
      if (airedEpisodeCount && episodeNumber > airedEpisodeCount) return null;
      const episodeInfo = currentEpisodePageItems.find((episode: any) => episode.mal_id === episodeNumber);
      return {
        number: episodeNumber,
        title: episodeInfo?.title || `Episode ${episodeNumber}`,
        active: episodeNumber === activeEpisode,
      };
    }).filter(Boolean) as Array<{ number: number; title: string; active: boolean }>;
    const sourceRows = showAllSources ? sortedTorrents : sortedTorrents.slice(0, 8);
    const synopsis = anime.synopsis || `${anime.title} streaming sources, episode choices, release metadata, and local playback controls.`;

    return (
      <div className="relative min-h-[calc(100vh-70px)] overflow-hidden bg-[#050509] text-white">
        <Seo
          title={`${anime.title} Streaming Sources | StreamNyaa Desktop`}
          description={`Stream ${anime.title} from local desktop sources with episode selection, seeders, quality filters, and torrent source controls.`}
          canonicalPath={animePath(anime, '/downloads')}
          image={poster}
          robots="noindex, nofollow"
        />
        {banner ? (
          <img
            src={banner}
            alt=""
            className="pointer-events-none fixed inset-0 h-full w-full scale-105 object-cover opacity-18 blur-2xl"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(124,58,237,0.20),transparent_30%),radial-gradient(circle_at_40%_80%,rgba(225,29,72,0.14),transparent_32%),linear-gradient(90deg,rgba(5,5,9,0.98)_0%,rgba(5,5,9,0.76)_43%,rgba(5,5,9,0.93)_100%)]" />

        <div className="relative grid min-h-[calc(100vh-70px)] grid-cols-1 xl:grid-cols-[430px_minmax(0,1fr)]">
          <aside className="border-r border-white/10 px-5 py-6 xl:px-8 xl:py-8">
            <Link
              to={animePath(anime)}
              className="mb-6 grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white/88 shadow-xl shadow-black/30 transition-colors hover:bg-white/10"
              aria-label="Back to anime details"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div className="grid gap-6 md:grid-cols-[220px_1fr] xl:block">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/40 xl:max-w-[260px]">
                {poster ? (
                  <img src={poster} alt={anime.title} className="aspect-[2/3] w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="aspect-[2/3] bg-white/8" />
                )}
              </div>

              <div className="min-w-0 xl:mt-6">
                <h1 className="text-3xl font-black tracking-[-0.04em] text-white xl:text-[34px]">{anime.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-white/50">
                  <span>{anime.year || 'TBA'}</span>
                  <span className="h-1 w-1 rounded-full bg-white/28" />
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <Star className="h-4 w-4 fill-current" />
                    {anime.score ? anime.score.toFixed(1) : 'N/A'}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-white/28" />
                  <span>{anime.episodes || airedEpisodeCount || '?'} episodes</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {genres.slice(0, 4).map((genre: string) => (
                    <span key={genre} className="rounded-full border border-white/16 bg-white/[0.065] px-3 py-1.5 text-xs font-bold text-white/72">
                      {genre}
                    </span>
                  ))}
                </div>
                <p className="mt-6 line-clamp-6 max-w-xl text-sm leading-7 text-white/68">{synopsis}</p>

                <div className="mt-7 grid grid-cols-3 gap-2 text-center">
                  {[
                    ['Score', anime.score ? anime.score.toFixed(1) : 'N/A'],
                    ['Status', anime.status?.replace(/_/g, ' ') || 'Unknown'],
                    ['Sources', torrentsLoading ? '...' : String(sortedTorrents.length)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">{label}</p>
                      <p className="mt-1 line-clamp-1 text-sm font-black text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <main className="min-w-0 px-5 py-6 xl:px-8 xl:py-10">
            <section className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="inline-flex items-center gap-2 text-sm font-black text-white">
                    <ListVideo className="h-4 w-4 text-primary" />
                    Episodes
                  </p>
                  <p className="mt-1 text-xs text-white/36">Pick an episode, then choose a torrent source to stream locally.</p>
                </div>
                <div className="flex items-center gap-2">
                  {['sub', 'dub'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setShowAllSources(false);
                        setAudioFilter(mode as AudioFilter);
                        const nextParams = new URLSearchParams(searchParams);
                        nextParams.set('type', mode);
                        nextParams.set('play', '1');
                        nextParams.set('wide', '1');
                        setSearchParams(nextParams);
                      }}
                      className={`rounded-full px-4 py-2 text-sm font-black transition-colors ${
                        audioFilter === mode ? 'bg-white text-black' : 'border border-white/12 bg-white/[0.055] text-white/58 hover:text-white'
                      }`}
                    >
                      {mode === 'dub' ? 'Dual / Dub' : 'Sub'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-3 hide-scrollbar">
                {episodeCards.map((episode) => (
                  <button
                    key={episode.number}
                    type="button"
                    onClick={() => updateEpisodeSelection(String(episode.number))}
                    className={`group w-[210px] shrink-0 overflow-hidden rounded-xl border text-left transition-all ${
                      episode.active
                        ? 'border-violet-500 bg-violet-500/12 shadow-[0_0_0_1px_rgba(139,92,246,0.30),0_18px_50px_rgba(124,58,237,0.18)]'
                        : 'border-white/10 bg-white/[0.055] hover:border-violet-400/50 hover:bg-white/[0.075]'
                    }`}
                  >
                    <span className="relative block aspect-video overflow-hidden bg-black/40">
                      {banner ? (
                        <img src={banner} alt="" className="h-full w-full object-cover opacity-75 transition-transform duration-500 group-hover:scale-105" referrerPolicy="no-referrer" />
                      ) : null}
                      <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-black text-white">{episode.number}</span>
                    </span>
                    <span className="block p-3">
                      <span className="line-clamp-1 text-sm font-black text-white">{episode.title}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-white/12 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/48"
                  >
                    Stremio Addons
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-violet-500/20"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Torrent Sources
                  </button>
                  {topSource ? (
                    <button
                      type="button"
                      onClick={() => openLocalPlayer(topSource)}
                      className="rounded-full bg-primary px-4 py-2 text-sm font-black text-white shadow-lg shadow-primary/20 hover:bg-primary/90"
                    >
                      Play best source
                    </button>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    className="rounded-lg border border-white/12 bg-white/[0.065] px-3 py-2 text-xs font-semibold text-white outline-none [&>option]:bg-background"
                    value={sortBy}
                    onChange={(event) => {
                      setShowAllSources(false);
                      setSortBy(event.target.value as 'best' | 'seeders' | 'size');
                    }}
                  >
                    <option value="best">Best Match</option>
                    <option value="seeders">Seeders</option>
                    <option value="size">File Size</option>
                  </select>
                  {sortBy !== 'best' ? (
                    <button
                      type="button"
                      onClick={() => setSortDirection((value) => value === 'desc' ? 'asc' : 'desc')}
                      className="rounded-lg border border-white/12 bg-white/[0.065] px-3 py-2 text-xs font-black text-white/70 hover:text-white"
                    >
                      {sortDirection === 'desc' ? 'High to low' : 'Low to high'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-2 text-base font-black text-white">
                  <Download className="h-4 w-4 text-white/52" />
                  Available Sources
                  <span className="text-white/35">- {selectedEpisodeNumber ? `Episode ${selectedEpisodeNumber}` : 'Batch'}</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'quality-1080p', label: '1080p' },
                    { value: 'high-seeders', label: 'High seeders' },
                    { value: 'dual-audio', label: 'Dual Audio' },
                    { value: 'hevc', label: 'HEVC' },
                    { value: 'batch', label: 'Batch' },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setShowAllSources(false);
                        setSourceFilter(sourceFilter === item.value ? '' : item.value as TorrentSourceFilter);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-black transition-colors ${
                        sourceFilter === item.value
                          ? 'border-violet-400 bg-violet-500 text-white'
                          : 'border-white/10 bg-white/[0.055] text-white/52 hover:border-violet-400/50 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {torrentsLoading ? (
                <div className="mt-6 grid gap-3">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className="h-[92px] animate-pulse rounded-xl border border-white/10 bg-white/[0.055]" />
                  ))}
                </div>
              ) : torrentsErrorState ? (
                <div className="mt-6 rounded-xl border border-red-500/25 bg-red-500/10 p-6 text-red-100">
                  <p className="font-black">Source search could not connect</p>
                  <p className="mt-2 text-sm text-red-100/70">{torrentsError instanceof Error ? torrentsError.message : 'The desktop source bridge did not return results.'}</p>
                  <button type="button" onClick={() => refetchTorrents()} className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-black text-white">Retry</button>
                </div>
              ) : sortedTorrents.length === 0 ? (
                <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.055] p-8 text-center">
                  <p className="text-lg font-black text-white">No sources found</p>
                  <p className="mt-2 text-sm text-white/48">Try a different episode, audio mode, or clear the filters.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {sourceRows.map((torrent, index) => {
                    const best = index === 0;
                    const score = sourceQualityScore(torrent);
                    return (
                      <div
                        key={torrent.infoHash || torrent.magnet || index}
                        className={`grid gap-4 rounded-xl border p-3 transition-colors md:grid-cols-[48px_1fr_auto] md:items-center ${
                          best
                            ? 'border-violet-500/70 bg-violet-500/10 shadow-[0_0_0_1px_rgba(139,92,246,0.18)]'
                            : 'border-white/10 bg-white/[0.048] hover:border-violet-400/40 hover:bg-white/[0.065]'
                        }`}
                      >
                        <div className="flex flex-wrap gap-1.5 md:block md:space-y-1.5">
                          <span className="inline-flex rounded-md bg-blue-600 px-2 py-1 text-[11px] font-black text-white">{sourceResolution(torrent.title)}</span>
                          {getTorrentBadges(torrent).slice(0, 2).map((badge) => (
                            <span key={`${torrent.infoHash}-${badge.label}`} className={torrentBadgeClassName(badge.tone)}>{badge.label}</span>
                          ))}
                        </div>
                        <div className="min-w-0">
                          {best ? <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Best match</p> : null}
                          <h3 className="mt-1 line-clamp-2 text-sm font-black leading-5 text-white">{torrent.title}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/45">
                            <span className="text-emerald-400">↑ {torrent.seeders}</span>
                            <span>{torrent.size}</span>
                            <span>{sourceHealth(torrent.rawSeeders)}</span>
                            <span>Score {score}</span>
                            <span>{sourceFreshnessLabel(torrent)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(torrent.magnet);
                              recordDownloadAction(torrent, 'copy');
                            }}
                            className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-white/52 hover:text-white"
                            aria-label="Copy source"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openLocalPlayer(torrent)}
                            className="grid h-10 w-10 place-items-center rounded-lg bg-violet-600 text-white shadow-lg shadow-violet-600/20 hover:bg-violet-500"
                            aria-label="Play source"
                          >
                            <Play className="ml-0.5 h-4 w-4 fill-current" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {hiddenSourceCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllSources(true)}
                      className="w-full rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm font-black text-violet-200 hover:bg-violet-500/20"
                    >
                      Show all source files ({hiddenSourceCount} more)
                    </button>
                  ) : null}
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Seo
        title={`${anime.title} Episode Downloads and Source Search | StreamNyaa`}
        description={`Find ${anime.title} episode search results, source metadata, file sizes, seed counts, and download options on StreamNyaa.`}
        canonicalPath={animePath(anime, '/downloads')}
        image={anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}
      />
      <Link to={data?.data ? animePath(data.data) : `/anime/${id}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Back to Anime Details
      </Link>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-5 gap-4 bg-[linear-gradient(135deg,rgba(225,29,72,0.12),rgba(14,165,233,0.06)),var(--glass)] p-6 rounded-2xl border border-border">
        <div className="flex items-center gap-4">
          <img src={anime.images.jpg.image_url} alt={anime.title} className="w-16 h-24 object-cover rounded shadow-md" />
          <div>
            <h1 className="text-2xl font-black text-foreground mb-1">{anime.title}</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              {desktopApp && playIntent ? <Play className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
              {desktopApp ? (playIntent ? 'Playback Sources' : 'Source Browser') : 'Download Options'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Last updated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
            <p className="mt-1 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
              {releaseTrackerText(anime, selectedEpisodeNumber)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-stretch md:items-end gap-3 w-full md:w-auto">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] md:grid-cols-1">
            <label className="flex flex-col gap-1.5 text-left">
              <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Episode</span>
              <select
                value={selectedEpisodeNumber ? String(selectedEpisodeNumber) : 'batch'}
                onChange={(event) => updateEpisodeSelection(event.target.value)}
                className="min-w-[220px] rounded-xl border border-border bg-background/70 px-3 py-2 text-sm font-bold text-foreground outline-none transition-colors focus:border-primary [&>option]:bg-background"
              >
                <option value="batch">Batch / all available episodes</option>
                {airedEpisodeCount > 0
                  ? Array.from({ length: airedEpisodeCount }, (_, index) => {
                    const episodeNumber = index + 1;
                    const episodeInfo = currentEpisodePageItems.find((episode: any) => episode.mal_id === episodeNumber);
                    const label = episodeInfo?.title ? `Episode ${episodeNumber} - ${episodeInfo.title}` : `Episode ${episodeNumber}`;
                    return (
                      <option key={episodeNumber} value={episodeNumber}>
                        {label}
                      </option>
                    );
                  })
                  : null}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {['[Batch]', '1080p', '720p', 'RAW'].map(filter => (
                <button
                  key={filter}
                  onClick={() => {
                    setShowAllSources(false);
                    const nextFilter = filter === downloadFilter ? '' : filter;
                    setDownloadFilter(nextFilter);
                    if (nextFilter === '1080p') setSourceFilter('quality-1080p');
                    else if (nextFilter === '720p') setSourceFilter('quality-720p');
                    else if (nextFilter === '[Batch]') setSourceFilter('batch');
                    else if (nextFilter === 'RAW') setSourceFilter('raw');
                    else if (sourceFilter === 'quality-1080p' || sourceFilter === 'quality-720p' || sourceFilter === 'batch' || sourceFilter === 'raw') setSourceFilter('');
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                    downloadFilter === filter
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary hover:bg-secondary/80 text-foreground'
                  }`}
                >
                  {filter === '[Batch]' ? 'Batch' : filter}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {SOURCE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-full border border-border bg-background/70 p-1 shadow-sm w-fit">
              {[
                { value: 'sub' as const, label: 'Sub', icon: Languages },
                { value: 'dub' as const, label: 'Dub', icon: Volume2 },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => {
                    setShowAllSources(false);
                    setAudioFilter(value);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-black transition-all ${
                    audioFilter === value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                  }`}
                  aria-pressed={audioFilter === value}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort by:</span>
            <select 
              className="bg-transparent border border-border text-sm text-foreground rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary transition-colors cursor-pointer [&>option]:bg-background"
              value={sortBy}
              onChange={(e) => {
                setShowAllSources(false);
                setSortBy(e.target.value as 'best' | 'seeders' | 'size');
              }}
            >
              <option value="best">Best</option>
              <option value="seeders">Seeders</option>
              <option value="size">File Size</option>
            </select>
            {sortBy !== 'best' ? (
              <button
                type="button"
                onClick={() => setSortDirection((value) => value === 'desc' ? 'asc' : 'desc')}
                className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-sm font-bold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {sortDirection === 'desc' ? 'High to low' : 'Low to high'}
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground text-left md:text-right">
            {showAiringEpisodeResults ? 'Airing episode' : downloadFilter === '[Batch]' ? 'Batch' : 'Episode'} results are filtered for {audioFilter === 'dub' ? 'dubbed or dual-audio releases' : 'subbed releases'}.
          </p>
        </div>
      </div>

      {desktopApp && playIntent ? (
        <div className="mb-6 rounded-2xl border border-primary/25 bg-primary/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-primary">Streaming first</p>
              <h2 className="mt-1 text-lg font-black text-foreground">Stream the best local source automatically</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                StreamNyaa prioritizes dual-audio releases and high seeders, then opens the desktop player. You can still choose a different source below when you want more control.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-background/65 px-2.5 py-1 text-muted-foreground">{playbackSearchLabel}</span>
                <span className="rounded-full bg-background/65 px-2.5 py-1 text-muted-foreground">{audioFilter === 'dub' ? 'Dub / dual-audio preferred' : 'Sub preferred'}</span>
                {topSource ? (
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-400">Best score {sourceQualityScore(topSource)}</span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {topSource ? (
                <button
                  type="button"
                  onClick={() => openLocalPlayer(topSource)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Stream best source
                </button>
              ) : null}
              <Link
                to="/local-player?desktop=1"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-background/60 px-4 py-2.5 text-sm font-black text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Play className="h-4 w-4 fill-current" />
                Open player
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Sources found', value: torrentsLoading ? '...' : sortedTorrents.length, detail: sourceFilter ? 'After selected filter' : 'Matching this title' },
          { label: 'Total seeders', value: torrentsLoading ? '...' : totalSeeders, detail: 'Across visible sources' },
          { label: 'Best source score', value: torrentsLoading ? '...' : topSource ? sourceQualityScore(topSource) : 'None', detail: topSource ? `${sourceQualityLabel(sourceQualityScore(topSource))} - ${sourceHealth(topSource.rawSeeders)}` : 'Try another filter' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-[var(--glass)] p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-black text-foreground">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-2xl border border-border bg-secondary/20 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Source filters</span>
          {!torrentsLoading && highSeederCount ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-500">{highSeederCount} high-seed sources</span>
          ) : null}
          {sourceFilter ? (
            <button onClick={() => { setShowAllSources(false); setSourceFilter(''); }} className="text-xs font-bold text-primary hover:underline">Clear</button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'quality-1080p', label: '1080p' },
            { value: 'quality-720p', label: '720p' },
            { value: 'raw', label: 'Raw' },
            { value: 'trusted', label: 'Trusted' },
            { value: 'high-seeders', label: 'High seeders' },
            { value: 'hevc', label: 'HEVC' },
            { value: 'dual-audio', label: 'Dual Audio' },
            { value: 'batch', label: 'Batch' },
            { value: 'episode', label: 'Episode' },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => {
                setShowAllSources(false);
                setSourceFilter(sourceFilter === item.value ? '' : item.value as TorrentSourceFilter);
              }}
              className={`rounded-full border px-3 py-1.5 text-sm font-bold transition-colors ${
                sourceFilter === item.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background/60 text-foreground hover:border-primary/40 hover:text-primary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {showAiringEpisodeResults ? (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <ListVideo className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-primary">Currently airing</p>
              <p className="mt-1">
                Full batch releases usually appear after a season finishes, so this section is showing available individual episode releases for now.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-6 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-muted-foreground md:hidden">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
          <div>
            <p className="font-semibold text-yellow-500">Mobile download note</p>
            <p className="mt-1">
              Mobile browsers may not open every download source directly. Use Open Link with a compatible app, or copy the source link for later.
            </p>
          </div>
        </div>
      </div>

      {torrentsLoading ? (
        <div className="py-20 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-muted-foreground font-medium">Searching sources for {audioFilter === 'dub' ? 'dubbed' : 'subbed'} {showAiringEpisodeResults ? 'episode releases' : downloadFilter ? downloadFilter.replace('[Batch]', 'batch') : 'releases'}...</p>
        </div>
      ) : torrentsErrorState ? (
        <div className="bg-red-500/10 border border-red-500/25 p-8 md:p-12 rounded-3xl text-center flex flex-col items-center">
          <AlertTriangle className="w-14 h-14 text-red-300 mb-4" />
          <p className="text-xl font-bold text-foreground mb-2">Source search could not connect</p>
          <p className="max-w-2xl text-muted-foreground">
            {torrentsError instanceof Error ? torrentsError.message : 'The desktop source bridge did not return results.'}
          </p>
          <button
            type="button"
            onClick={() => refetchTorrents()}
            className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90"
          >
            Retry source search
          </button>
        </div>
      ) : sortedTorrents.length === 0 ? (
        <div className="bg-secondary/30 border border-border p-8 md:p-12 rounded-3xl text-center flex flex-col items-center">
          <HardDrive className="w-16 h-16 text-muted-foreground mb-4" />
          <p className="text-xl font-bold text-foreground mb-2">No Sources Found</p>
          <p className="max-w-2xl text-muted-foreground">
            No source results were found for "{anime.title}" with the selected filters. Try a different filter or search.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {(anime.title_english || anime.title_romaji) ? (
              <span className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-bold text-muted-foreground">
                Try alternate title: {anime.title_english || anime.title_romaji}
              </span>
            ) : null}
            {selectedEpisodeNumber ? (
              <button
                type="button"
                onClick={() => {
                  setShowAllSources(false);
                  setSearchParams(new URLSearchParams({ ep: String(selectedEpisodeNumber), type: audioFilter }));
                  setDownloadFilter('');
                  setSourceFilter('');
                }}
                className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary hover:bg-primary hover:text-primary-foreground"
              >
                Search episode without quality
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setShowAllSources(true);
                setSourceFilter('');
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set('wide', '1');
                if (playIntent) nextParams.set('play', '1');
                setSearchParams(nextParams);
              }}
              className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-black text-foreground hover:border-primary/40 hover:text-primary"
            >
              Try wider source search
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAllSources(false);
                setDownloadFilter('[Batch]');
                setSourceFilter('batch');
              }}
              className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-black text-foreground hover:border-primary/40 hover:text-primary"
            >
              Try batch search
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-foreground">
                {showAllSources ? 'All source files are visible' : 'Showing the best source files first'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {showAllSources
                  ? `${sortedTorrents.length} matching files are listed below.`
                  : hiddenSourceCount
                    ? `${hiddenSourceCount} more matching files are hidden to keep the page clean.`
                    : 'These are all the matching files found for this filter.'}
              </p>
            </div>
            {sortedTorrents.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowAllSources((value) => !value)}
                className="inline-flex items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-black text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                {showAllSources ? 'Show fewer files' : 'Show all source files'}
              </button>
            ) : null}
          </div>

          {visibleTorrents.map((torrent, idx) => (
            <div key={idx} className={`transition-all p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 group ${
              idx === 0
                ? 'bg-emerald-500/5 border border-emerald-500/30 shadow-[0_16px_40px_rgba(16,185,129,0.08)]'
                : 'bg-secondary/20 hover:bg-secondary/40 border border-border/50 hover:border-primary/50'
            }`}>
                <div className="flex-1 min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {idx === 0 ? (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-emerald-500">
                        Best match
                      </span>
                    ) : null}
                    <span className="rounded-full border border-border bg-background/55 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                      {sourceHealth(torrent.rawSeeders)}
                    </span>
                    {(() => {
                      const score = sourceQualityScore(torrent);
                      return (
                        <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-primary">
                          Source score {score} - {sourceQualityLabel(score)}
                        </span>
                      );
                    })()}
                    <span className="rounded-full border border-border bg-background/55 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                      {sourceFreshnessLabel(torrent)}
                    </span>
                  </div>
                  <h4 className="font-bold text-foreground break-all leading-tight mb-3 group-hover:text-primary transition-colors text-[15px]">
                    {torrent.title}
                  </h4>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-muted-foreground">
                    <span className="text-secondary-foreground">{torrent.size}</span>
                    <span className="flex items-center gap-1.5 text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {torrent.seeders} SE
                    </span>
                    <span className="flex items-center gap-1.5 text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      {torrent.leechers} LE
                    </span>
                    <span className="bg-background px-2 py-0.5 rounded-full border border-border">{torrent.category}</span>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
                      /\b(dub|dubbed|dual[\s-]?audio|multi[\s-]?audio|english[\s-]?audio|eng[\s-]?dub)\b/i.test(torrent.title)
                        ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                        : 'bg-primary/10 text-primary border-primary/20'
                    }`}>
                      {/\b(dub|dubbed|dual[\s-]?audio|multi[\s-]?audio|english[\s-]?audio|eng[\s-]?dub)\b/i.test(torrent.title) ? 'Dub' : 'Sub'}
                    </span>
                    <span className="opacity-70">{new Date(torrent.pubDate).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getTorrentBadges(torrent).map((badge) => (
                      <span key={`${torrent.infoHash}-${badge.label}`} className={torrentBadgeClassName(badge.tone)}>
                        {badge.label}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0 mt-2 md:mt-0">
                  {desktopApp ? (
                    <button
                      type="button"
                      onClick={() => openLocalPlayer(torrent)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-primary/25"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Stream
                    </button>
                  ) : null}
                  <a
                    href={torrent.magnet}
                    onClick={() => recordDownloadAction(torrent, 'open')}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
                    title="Open source link"
                  >
                    <Download className="w-4 h-4" />
                    Open Link
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(torrent.magnet);
                      recordDownloadAction(torrent, 'copy');
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-primary/25"
                  >
                    <LinkIcon className="w-4 h-4" />
                    Copy Link
                  </button>
                </div>
            </div>
          ))}
          {!user ? (
            <p className="rounded-2xl border border-border bg-background/45 p-4 text-sm text-muted-foreground">
              Your download history is saved on this device. Sign in to keep future activity connected to your account.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
