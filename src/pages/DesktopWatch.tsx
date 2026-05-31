import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, Download, Loader2, Play, SlidersHorizontal, Star } from 'lucide-react';
import Seo from '../components/Seo';
import { fetchAnimeDetails, fetchAnimeEpisodes } from '../api/jikan';
import { dedupeNyaaItems, searchNyaa, type NyaaItem } from '../api/nyaa';
import { watchPath } from '../lib/slug';
import { getTorrentBadges, torrentBadgeClassName } from '../lib/torrentBadges';
import { getLocalPlaybackProgress, openLocalSourceNow, stopDesktopPlayback, type DesktopPlaybackProgress } from '../lib/desktop';

type AudioMode = 'sub' | 'dub';
type SourceSort = 'best' | 'seeders' | 'size';
type PlaybackNotice = { tone: 'loading' | 'success' | 'error'; text: string };

function posterFor(anime: any) {
  const fallbackId = Number(anime?.anilist_id || anime?.id || 0);
  const fallbackCover = fallbackId > 0 ? `https://img.anili.st/media/${fallbackId}` : '';
  return anime?.images?.webp?.large_image_url
    || anime?.images?.jpg?.large_image_url
    || anime?.images?.jpg?.image_url
    || fallbackCover
    || '';
}

function wideImageFor(anime: any) {
  return anime?.banner_image
    || anime?.trailer?.images?.maximum_image_url
    || posterFor(anime);
}

function uniqueImageCandidates(values: Array<string | undefined | null>) {
  return values.filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

function imageCandidatesFor(anime: any, wide = false) {
  return uniqueImageCandidates(wide ? [
    anime?.banner_image,
    anime?.trailer?.images?.maximum_image_url,
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.jpg?.image_url,
  ] : [
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.jpg?.image_url,
    anime?.banner_image,
    anime?.trailer?.images?.maximum_image_url,
  ]);
}

function SafeImage({
  candidates,
  alt,
  className,
  fallbackClassName,
}: {
  candidates: string[];
  alt: string;
  className: string;
  fallbackClassName?: string;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const current = candidates[index] || '';

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [candidates.join('|')]);

  if (!current || failed) {
    return (
      <div className={fallbackClassName || className}>
        <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_34%_18%,rgba(225,29,72,0.38),transparent_36%),linear-gradient(145deg,#1a1016,#060609)] p-4">
          <span className="line-clamp-3 text-sm font-black leading-tight text-white/76">{alt || 'Anime'}</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={current}
      alt={alt}
      className={className}
      decoding="async"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setIndex((value) => {
          if (value < candidates.length - 1) return value + 1;
          setFailed(true);
          return value;
        });
      }}
    />
  );
}

function titleFromRoute(id = '') {
  const raw = decodeURIComponent(String(id))
    .replace(/^\d+-?/, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return 'Anime';
  return raw.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackAnimeFromRoute(id = '') {
  const numeric = Number(String(id).match(/^\d+/)?.[0] || 0);
  const title = titleFromRoute(id);
  return {
    id: numeric || id,
    mal_id: numeric || id,
    title,
    title_romaji: title,
    title_english: title,
    images: { jpg: {}, webp: {} },
    banner_image: '',
    synopsis: 'Metadata could not be loaded, but source search is still available for this title.',
    episodes: null,
    status: 'UNKNOWN',
    score: 0,
    type: 'TV',
    year: null,
    genres: [],
    streamingEpisodes: [],
    nextAiringEpisode: null,
    relations: [],
  };
}

function cleanTitle(value = '') {
  return value.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueTextValues(values: Array<string | undefined | null>) {
  return values.filter((value, index, list): value is string => Boolean(value?.trim()) && list.indexOf(value) === index);
}

function seasonNumberFromText(value = '') {
  const match = value.match(/\bseason\s+(\d{1,2})\b/i)
    || value.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i)
    || value.match(/\bpart\s+(\d{1,2})\b/i)
    || value.match(/\bcour\s+(\d{1,2})\b/i);
  const number = Number(match?.[1] || 0);
  return number > 0 ? number : null;
}

function stripSeasonDecorators(value = '') {
  return cleanTitle(
    value
      .replace(/\bseason\s+\d{1,2}\b/ig, ' ')
      .replace(/\b\d{1,2}(?:st|nd|rd|th)\s+season\b/ig, ' ')
      .replace(/\bpart\s+\d{1,2}\b/ig, ' ')
      .replace(/\bcour\s+\d{1,2}\b/ig, ' ')
      .replace(/\bfinal\s+season\b/ig, ' ')
      .replace(/\(\d{4}\)/g, ' ')
  );
}

function sourceSearchTitleVariants(anime: any, routeId = '') {
  const routeTitle = titleFromRoute(routeId);
  const raw = uniqueTextValues([
    anime?.title_romaji,
    anime?.title_english,
    anime?.title,
    routeTitle,
  ]);

  return uniqueTextValues(raw.flatMap((title) => {
    const cleaned = cleanTitle(title);
    const stripped = stripSeasonDecorators(title);
    return [title, cleaned, stripped];
  }));
}

function sourceSearchSeasonHints(anime: any, routeId = '') {
  return uniqueTextValues([
    anime?.title_romaji,
    anime?.title_english,
    anime?.title,
    titleFromRoute(routeId),
  ])
    .map((title) => seasonNumberFromText(title))
    .filter((value, index, list): value is number => Boolean(value) && list.indexOf(value) === index);
}

function isDubSource(title = '') {
  return /\b(dub|dubbed|dual[\s-]?audio|multi[\s-]?audio|english[\s-]?audio|eng[\s-]?dub)\b/i.test(title);
}

function isDubOnlySource(title = '') {
  return /\b(dub|dubbed|english[\s-]?dub|eng[\s-]?dub)\b/i.test(title)
    && !/\b(dual[\s-]?audio|multi[\s-]?audio)\b/i.test(title);
}

function isBatchSource(title = '') {
  return /\b(batch|complete\s+(?:season|series)|season\s+pack|collection)\b/i.test(title)
    || /\b\d{1,3}\s*-\s*\d{1,3}\b/.test(title);
}

function hasEpisodeSignal(title = '', episode: number) {
  const ep = String(episode);
  const padded = ep.padStart(2, '0');
  const compact = title.replace(/\s+/g, ' ');
  return [
    new RegExp(`\\bS\\d{1,2}E${padded}\\b`, 'i'),
    new RegExp(`\\bE${padded}\\b`, 'i'),
    new RegExp(`\\bEP?\\.?\\s*${ep}\\b`, 'i'),
    new RegExp(`(?:^|[\\s._\\-\\[\\(])${padded}(?:[\\s._\\-\\]\\)]|$)`, 'i'),
  ].some((pattern) => pattern.test(compact));
}

function knownAiredEpisodeCount(anime: any, episodeItems: any[] = []) {
  const pageMax = episodeItems.length
    ? Math.max(...episodeItems.map((episode: any) => Number(episode?.mal_id) || 0))
    : 0;
  if (anime?.nextAiringEpisode?.episode) return Math.max(Number(anime.nextAiringEpisode.episode) - 1, pageMax, 0);
  if (String(anime?.status || '').toUpperCase() === 'FINISHED') return Math.max(Number(anime?.episodes || 1), pageMax, 1);
  if (String(anime?.status || '').toUpperCase() === 'RELEASING') {
    return Math.max(Number(anime?.episodes || 0), Number(anime?.streamingEpisodes?.length || 0), pageMax, 1);
  }
  return Math.max(pageMax, Number(anime?.episodes || 0), 0);
}

function episodeNumberFromTitle(value = '') {
  const match = value.match(/\bepisode\s+(\d{1,4})\b/i) || value.match(/(?:^|[\s._-])(\d{1,4})(?:[\s._-]|$)/);
  const number = Number(match?.[1] || 0);
  return number > 0 ? number : null;
}

function streamingEpisodeFor(anime: any, episodeNumber: number) {
  const streamingEpisodes = Array.isArray(anime?.streamingEpisodes) ? anime.streamingEpisodes : [];
  return streamingEpisodes.find((episode: any) => episodeNumberFromTitle(episode?.title || '') === episodeNumber) || null;
}

function episodeThumb(anime: any, episode: any, episodeNumber: number) {
  const streaming = streamingEpisodeFor(anime, episodeNumber);
  return streaming?.thumbnail || episode?.image || wideImageFor(anime);
}

function episodeTitle(anime: any, episode: any, episodeNumber: number) {
  const streaming = streamingEpisodeFor(anime, episodeNumber);
  return episode?.title || episode?.title_english || episode?.title_romanji || streaming?.title || `Episode ${episodeNumber}`;
}

function sourceScore(source: NyaaItem) {
  let score = 0;
  if (isDubSource(source.title)) score += 40;
  if (/trusted/i.test(String(source.trusted || ''))) score += 25;
  if (/\b1080p\b/i.test(source.title)) score += 20;
  if (source.rawSeeders >= 100) score += 20;
  else if (source.rawSeeders >= 50) score += 14;
  else if (source.rawSeeders >= 15) score += 8;
  if (/\b(hevc|h\.?265|x265)\b/i.test(source.title)) score += 6;
  if (source.rawSize > 0 && source.rawSize < 5 * 1024 * 1024 * 1024) score += 5;
  return score + Number(source.sourceScore || 0);
}

function torrentUrlFor(source: NyaaItem) {
  const link = String(source.link || '').trim();
  const viewMatch = link.match(/nyaa\.si\/view\/(\d+)/i);
  if (viewMatch) return `https://nyaa.si/download/${viewMatch[1]}.torrent`;
  return link;
}

function seasonLinks(anime: any) {
  const relationEntries = (anime?.relations || [])
    .flatMap((relation: any) => relation.entry || [])
    .filter((entry: any) => entry?.type === 'ANIME' && entry?.mal_id);
  const byId = new Map<string, any>();
  relationEntries.forEach((entry: any) => byId.set(String(entry.mal_id), entry));
  return [
    { mal_id: anime?.mal_id, name: anime?.title || 'Current season', current: true },
    ...Array.from(byId.values()).slice(0, 7).map((entry: any) => ({ ...entry, current: false })),
  ];
}

export default function DesktopWatch() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [audioMode, setAudioMode] = useState<AudioMode>(searchParams.get('type') === 'dub' ? 'dub' : 'sub');
  const [sortBy, setSortBy] = useState<SourceSort>('best');
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [playback, setPlayback] = useState<{ torrentId: string; title: string } | null>(null);
  const [playbackNotice, setPlaybackNotice] = useState<PlaybackNotice | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['anime', id],
    queryFn: () => fetchAnimeDetails(id!),
    enabled: !!id,
    placeholderData: (previous) => previous,
  });

  const fallbackAnime = useMemo(() => fallbackAnimeFromRoute(id), [id]);
  const anime = data?.data || fallbackAnime;
  const hasFullMetadata = Boolean(data?.data);
  const requestedEpisode = Math.max(0, Number(searchParams.get('ep') || 0));
  const estimatedEpisode = requestedEpisode || knownAiredEpisodeCount(anime) || 1;
  const episodePage = Math.max(1, Math.ceil(estimatedEpisode / 100));

  const { data: episodeData } = useQuery({
    queryKey: ['episodes', id, episodePage],
    queryFn: () => fetchAnimeEpisodes(id!, episodePage),
    enabled: !!id && hasFullMetadata,
    placeholderData: (previous) => previous,
  });

  const pageItems = episodeData?.data || [];
  const airedCount = knownAiredEpisodeCount(anime, pageItems);
  const selectedEpisode = Math.max(1, Math.min(requestedEpisode || airedCount || 1, airedCount || 1));

  const episodes = useMemo(() => {
    const count = Math.max(airedCount || pageItems.length || 1, selectedEpisode || 1);
    const maxVisible = 400;
    const start = count > maxVisible
      ? Math.min(Math.max(1, selectedEpisode - Math.floor(maxVisible / 2)), Math.max(1, count - maxVisible + 1))
      : 1;
    const visibleCount = Math.min(count, maxVisible);
    return Array.from({ length: visibleCount }, (_, index) => {
      const number = start + index;
      const pageEpisode = pageItems.find((episode: any) => Number(episode.mal_id) === number);
      return {
        number,
        title: episodeTitle(anime, pageEpisode, number),
        image: episodeThumb(anime, pageEpisode, number),
      };
    });
  }, [airedCount, anime, episodeData, selectedEpisode]);

  const selectedEpisodeInfo = episodes.find((episode) => episode.number === selectedEpisode) || episodes[0];
  const seasonItems = useMemo(() => seasonLinks(anime), [anime]);

  const { data: sources, isLoading: sourcesLoading } = useQuery({
    queryKey: ['desktop-watch-sources', anime?.title, anime?.title_english, anime?.title_romaji, selectedEpisode, audioMode],
    queryFn: async () => {
      const epPadded = String(selectedEpisode).padStart(2, '0');
      const titleCandidates = sourceSearchTitleVariants(anime, id);
      const seasonHints = sourceSearchSeasonHints(anime, id);
      const audioSuffix = audioMode === 'dub' ? ' dub' : '';

      const normalizeSourcePool = (items: NyaaItem[]) => {
        const deduped = dedupeNyaaItems(items).filter((source) => !isBatchSource(source.title));
        if (!deduped.length) return [];
        const episodeMatches = deduped.filter((source) => hasEpisodeSignal(source.title, selectedEpisode));
        if (selectedEpisode > 0 && !episodeMatches.length) return [];
        const narrowed = episodeMatches.length ? episodeMatches : deduped;
        const audioFiltered = audioMode === 'dub'
          ? narrowed.filter((source) => isDubSource(source.title))
          : narrowed.filter((source) => !isDubOnlySource(source.title));
        return audioFiltered.length ? audioFiltered : narrowed;
      };

      const runQuery = async (query: string, options: { pages?: number; wide?: boolean; deep?: boolean }) => {
        const result = await searchNyaa(query, '1_2', '0', '1', options);
        return normalizeSourcePool(result);
      };

      const attemptedQueries = new Set<string>();
      const tryQueries = async (queries: string[], options: { pages?: number; wide?: boolean; deep?: boolean }) => {
        for (const rawQuery of queries) {
          const query = rawQuery.replace(/\s+/g, ' ').trim();
          if (!query) continue;
          const key = query.toLowerCase();
          if (attemptedQueries.has(key)) continue;
          attemptedQueries.add(key);
          const result = await runQuery(query, options);
          if (result.length) return result;
        }
        return [];
      };

      const exactEpisodeQueries = titleCandidates.flatMap((title) => {
        const cleanedTitle = cleanTitle(title);
        return [
          `${cleanedTitle} ${epPadded}${audioSuffix}`,
          `${cleanedTitle} episode ${selectedEpisode}${audioSuffix}`,
          `${cleanedTitle} ep ${selectedEpisode}${audioSuffix}`,
        ];
      });
      const exact = await tryQueries(exactEpisodeQueries, { pages: 1, wide: false, deep: false });
      if (exact.length) return exact;

      const seasonEpisodeQueries = seasonHints.flatMap((seasonNumber) => titleCandidates.flatMap((title) => {
        const stripped = stripSeasonDecorators(title) || cleanTitle(title);
        const seasonPadded = String(seasonNumber).padStart(2, '0');
        return [
          `${stripped} s${seasonPadded}e${epPadded}${audioSuffix}`,
          `${stripped} season ${seasonNumber} episode ${selectedEpisode}${audioSuffix}`,
        ];
      }));
      const seasonEpisode = await tryQueries(seasonEpisodeQueries, { pages: 1, wide: true, deep: true });
      if (seasonEpisode.length) return seasonEpisode;

      const broadEpisodeQueries = titleCandidates.flatMap((title) => {
        const cleanedTitle = cleanTitle(title);
        return [
          `${cleanedTitle} ${selectedEpisode}${audioSuffix}`,
          `${cleanedTitle} ${epPadded}`,
          `${cleanedTitle} ${selectedEpisode}`,
        ];
      });
      const broad = await tryQueries(broadEpisodeQueries, { pages: 3, wide: true, deep: true });
      if (broad.length) return broad;

      const fallback = await tryQueries(titleCandidates.map((title) => cleanTitle(title)), { pages: 3, wide: true, deep: true });
      if (fallback.length) return fallback;

      return [];
    },
    enabled: !!anime?.title && selectedEpisode > 0,
    placeholderData: (previous) => previous,
  });

  const sortedSources = useMemo(() => {
    const items = [...(sources || [])];
    return items.sort((a, b) => {
      if (sortBy === 'seeders') return b.rawSeeders - a.rawSeeders;
      if (sortBy === 'size') return a.rawSize - b.rawSize;
      return sourceScore(b) - sourceScore(a);
    });
  }, [sortBy, sources]);

  const { data: playbackProgress } = useQuery<DesktopPlaybackProgress>({
    queryKey: ['desktop-playback-progress', playback?.torrentId],
    queryFn: () => getLocalPlaybackProgress(playback!.torrentId),
    enabled: Boolean(playback?.torrentId),
    refetchInterval: 1500,
    retry: 1,
  });

  useEffect(() => {
    if (playback && playbackProgress?.state === 'stopped') {
      setPlayback(null);
      setPlaybackNotice({ tone: 'success', text: playbackProgress.message || 'Playback ended and temporary files were cleaned.' });
    }
  }, [playback, playbackProgress]);

  const selectEpisode = (episodeNumber: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('ep', String(episodeNumber));
    next.set('type', audioMode);
    setSearchParams(next);
  };

  const openOneSource = async (source: NyaaItem) => {
    const result = await openLocalSourceNow({
      magnet: source.magnet,
      torrentUrl: torrentUrlFor(source),
      infoHash: source.infoHash,
      title: source.title,
      animeTitle: anime.title,
      animeId: anime.mal_id || anime.id,
      episode: selectedEpisode,
      size: source.size,
      seeders: source.seeders,
      image: posterFor(anime),
      poster: posterFor(anime),
      banner: wideImageFor(anime),
    });
    if (!result.ok) throw new Error(result.message || 'Source link could not open.');
    if (!result.torrent_id) throw new Error('The local engine did not return a stream id.');
    return result;
  };

  const playSource = async (source: NyaaItem) => {
    const sourceId = source.infoHash || source.magnet;
    setActiveSourceId(sourceId);
    setPlaybackNotice({ tone: 'loading', text: 'Opening player and connecting the selected source...' });
    try {
      const result = await openOneSource(source);
      setPlayback({ torrentId: result.torrent_id!, title: result.title || source.title });
      setPlaybackNotice({ tone: 'success', text: 'Player opened. The stream will keep buffering in the same window if it needs more time.' });
    } catch (error) {
      setPlaybackNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Source link could not open.' });
    } finally {
      setActiveSourceId(null);
    }
  };

  const stopPlayback = async () => {
    try {
      setPlaybackNotice({ tone: 'loading', text: 'Stopping the active stream and cleaning temporary files...' });
      const result = await stopDesktopPlayback();
      setPlayback(null);
      setActiveSourceId(null);
      setPlaybackNotice({ tone: 'success', text: result.message || 'Playback was stopped and temporary files were cleaned.' });
    } catch (error) {
      setPlaybackNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Playback could not be stopped.' });
    }
  };

  if (isLoading && !anime) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!id) return <div className="py-24 text-center text-white">Select an anime to continue.</div>;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050508] text-white">
      <Seo title={`${anime.title} Watch | StreamNyaa Desktop`} description="Desktop watch source screen." canonicalPath={`/watch/${id}`} robots="noindex, nofollow" />
      <SafeImage candidates={imageCandidatesFor(anime, true)} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.13] blur-2xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_24%,rgba(126,58,242,0.20),transparent_30%),linear-gradient(90deg,#050508_0%,rgba(5,5,8,0.94)_31%,rgba(5,5,8,0.82)_100%)]" />

      <div className="relative grid min-h-screen grid-cols-[360px_1fr] gap-7 px-5 py-6">
        <aside className="border-r border-white/8 pr-7">
          <Link to="/" className="mb-6 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white hover:bg-white/12">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/40">
            <SafeImage candidates={imageCandidatesFor(anime)} alt={anime.title} className="aspect-[2/3] w-full object-cover" />
          </div>
          <h1 className="mt-7 text-[34px] font-black leading-tight tracking-[-0.03em]">{anime.title}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm font-bold text-white/62">
            <span>{anime.year || 'Anime'}</span>
            <span>-</span>
            <span className="inline-flex items-center gap-1 text-yellow-400"><Star className="h-4 w-4 fill-current" />{anime.score ? anime.score.toFixed(1) : 'N/A'}</span>
            <span>-</span>
            <span>{airedCount || anime.episodes || '?'} episodes</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(anime.genres || []).slice(0, 4).map((genre: any) => (
              <span key={genre.name} className="rounded-full border border-white/14 bg-white/8 px-3 py-1.5 text-xs font-bold text-white/78">{genre.name}</span>
            ))}
          </div>
          <p className="mt-7 line-clamp-[8] text-[15px] leading-7 text-white/64">{anime.synopsis || 'No synopsis available.'}</p>
        </aside>

        <main className="min-w-0 py-8">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Seasons</p>
                <div className="mt-3 flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
                  {seasonItems.map((season: any, index: number) => (
                    season.current ? (
                      <button key="current-season" className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
                        Season {index + 1}
                      </button>
                    ) : (
                      <Link key={season.mal_id || season.name} to={watchPath({ mal_id: season.mal_id, title: season.name })} className="shrink-0 rounded-full border border-white/22 bg-white/[0.04] px-5 py-2.5 text-sm font-black text-white/76 hover:border-primary/50 hover:text-white">
                        Season {index + 1}
                      </Link>
                    )
                  ))}
                </div>
              </div>
              <div className="inline-flex rounded-full border border-white/12 bg-white/[0.05] p-1">
                {(['sub', 'dub'] as AudioMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setAudioMode(mode);
                      const next = new URLSearchParams(searchParams);
                      next.set('type', mode);
                      setSearchParams(next);
                    }}
                    className={`rounded-full px-5 py-2 text-sm font-black ${audioMode === mode ? 'bg-white text-black' : 'text-white/62 hover:text-white'}`}
                  >
                    {mode === 'dub' ? 'Dual / Dub' : 'Sub'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-2 flex items-center gap-2 text-lg font-black">
              <Download className="h-4 w-4 text-primary" />
              Episodes ({airedCount || episodes.length || 0})
            </div>
            <div className="flex gap-3 overflow-x-auto pb-3 hide-scrollbar">
              {episodes.map((episode) => (
                <button
                  key={episode.number}
                  type="button"
                  onClick={() => selectEpisode(episode.number)}
                  className={`group relative h-[156px] w-[230px] shrink-0 overflow-hidden rounded-lg border text-left transition-all ${episode.number === selectedEpisode ? 'border-primary shadow-[0_0_0_1px_rgba(225,29,72,0.45)]' : 'border-white/12 hover:border-white/30'}`}
                >
                  <SafeImage candidates={uniqueImageCandidates([episode.image, wideImageFor(anime), posterFor(anime)])} alt={episode.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.82),rgba(0,0,0,0.08)_62%)]" />
                  <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-black">{episode.number}</span>
                  <p className="absolute bottom-3 left-3 right-3 line-clamp-1 text-sm font-black">{episode.title}</p>
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs font-semibold text-white/26">
              {airedCount > episodes.length
                ? `Showing episodes ${episodes[0]?.number || 1}-${episodes[episodes.length - 1]?.number || episodes.length} of ${airedCount}. Pick another episode from search or source links to jump the strip.`
                : 'Scroll sideways to browse every aired episode in this season.'}
            </p>
          </section>

          <section className="mt-8">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button type="button" className="rounded-full bg-primary px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary/25">
                  <SlidersHorizontal className="mr-2 inline h-4 w-4" />
                  Source Links
                </button>
                <button
                  type="button"
                  disabled={!sortedSources[0]}
                  onClick={() => sortedSources[0] && void playSource(sortedSources[0])}
                  className="rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Open Source
                </button>
              </div>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SourceSort)} className="rounded-xl border border-white/12 bg-black/45 px-4 py-3 text-sm font-black text-white outline-none">
                <option value="best">Best Match</option>
                <option value="seeders">Seeders (High to Low)</option>
                <option value="size">Smaller Files First</option>
              </select>
            </div>

            {playbackNotice ? (
              <div className={`mb-5 rounded-2xl border p-4 text-sm font-bold ${
                playbackNotice.tone === 'error'
                  ? 'border-red-400/25 bg-red-500/10 text-red-100'
                  : playbackNotice.tone === 'success'
                    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                    : 'border-primary/25 bg-primary/10 text-white/76'
              }`}>
                {playbackNotice.text}
              </div>
            ) : null}

            {playback ? (
              <div className="mb-5 overflow-hidden rounded-2xl border border-primary/30 bg-primary/[0.08] p-4 shadow-lg shadow-primary/10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Active stream</p>
                    <p className="mt-1 line-clamp-1 text-sm font-black text-white">{playback.title}</p>
                    <p className="mt-1 text-xs font-bold text-white/52">{playbackProgress?.message || 'Fetching torrent metadata...'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-wider text-white/38">{playbackProgress?.state?.replace(/_/g, ' ') || 'starting'}</p>
                    <p className="mt-1 text-sm font-black text-white">{Math.round(playbackProgress?.progress || 0)}%</p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(5, playbackProgress?.progress || 5))}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold text-white/42">
                  <span>Peers: {playbackProgress?.peers ?? '...'}</span>
                  <span>Downloaded: {playbackProgress?.downloaded_bytes ? `${Math.round(playbackProgress.downloaded_bytes / 1024 / 1024)} MB` : '...'}</span>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void stopPlayback()}
                    className="rounded-full border border-white/12 bg-black/35 px-4 py-2 text-xs font-black text-white/78 transition-colors hover:border-primary/45 hover:text-white"
                  >
                    Stop stream
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black">Available Sources <span className="text-white/35">- Episode {selectedEpisode}</span></h2>
              <div className="flex gap-2 text-xs font-black text-white/58">
                {['1080p', 'High seeders', 'Dual Audio', 'HEVC'].map((label) => <span key={label} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">{label}</span>)}
              </div>
            </div>

            {sourcesLoading ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[92px] animate-pulse rounded-xl border border-white/8 bg-white/[0.045]" />)}
              </div>
            ) : sortedSources.length ? (
              <div className="grid gap-3">
                {sortedSources.slice(0, 12).map((source, index) => {
                  const active = activeSourceId === (source.infoHash || source.magnet);
                  return (
                    <div key={source.infoHash || source.magnet} className={`flex items-center gap-4 rounded-xl border p-4 ${index === 0 ? 'border-primary/70 bg-primary/[0.08]' : 'border-white/10 bg-white/[0.035]'}`}>
                      <span className="rounded-md bg-blue-600 px-2 py-1 text-xs font-black text-white">{/\b720p\b/i.test(source.title) ? '720p' : '1080p'}</span>
                      <div className="min-w-0 flex-1">
                        {index === 0 ? <p className="mb-1 text-[10px] font-black uppercase tracking-[0.24em] text-primary">Best match</p> : null}
                        <p className="line-clamp-1 text-sm font-black">{source.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-white/45">
                          <span className="text-emerald-400">Seeders {source.seeders}</span>
                          <span>{source.size}</span>
                          <span>{sourceHealth(source.rawSeeders)}</span>
                          {getTorrentBadges(source).slice(0, 3).map((badge) => <span key={`${source.infoHash}-${badge.label}`} className={torrentBadgeClassName(badge.tone)}>{badge.label}</span>)}
                        </div>
                      </div>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(source.magnet)} className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-white/68 hover:text-white">
                        <Copy className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => void playSource(source)} className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-white shadow-lg shadow-primary/20">
                        {active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/54">
                No sources found. Try another episode or switch between Sub and Dual / Dub.
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function sourceHealth(seedCount: number) {
  if (seedCount >= 100) return 'Fast';
  if (seedCount >= 50) return 'Healthy';
  if (seedCount >= 15) return 'Usable';
  return 'Low seed';
}
