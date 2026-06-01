import { memo, RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Info, Play } from 'lucide-react';
import Seo from '../components/Seo';
import { fetchAnimeSeason, fetchPopularAnime, fetchRecentEpisodes, fetchTopAiring, fetchTopAnimeByYear, fetchUpcomingAnime, searchAnime } from '../api/jikan';
import {
  formatPlaybackTime,
  latestUnwatchedEpisodeForAnime,
  loadDesktopAudioPreference,
  loadLocalPlaybackHistory,
  openLocalSourceNow,
  subscribeDesktopAudioPreference,
  subscribeLocalPlaybackHistory,
  type DesktopAudioPreference,
  type LocalPlaybackSource,
  watchTypeForAudioPreference,
} from '../lib/desktop';
import { animeIdentity, animeTitleKey } from '../lib/animeIdentity';
import { getCurrentAnimeSeason } from '../lib/currentSeason';
import { desktopUpcomingPath, desktopWatchPath, isUpcomingAnime } from '../lib/desktopAnimeRoute';

function fallbackCover(anilistId: number) {
  return `https://img.anili.st/media/${anilistId}`;
}

function makeFallbackAnime({
  id,
  mal_id,
  title,
  episodes,
  latestEpisode,
  score,
  year,
  synopsis,
  genres,
}: {
  id: number;
  mal_id?: number;
  title: string;
  episodes?: number | null;
  latestEpisode?: number | string | null;
  score?: number;
  year?: number;
  synopsis?: string;
  genres?: string[];
}) {
  const cover = fallbackCover(id);
  return {
    id,
    mal_id: mal_id || id,
    title,
    title_english: title,
    synopsis: synopsis || 'Open the desktop watch flow, pick an aired episode, and search individual source links.',
    episodes,
    latestEpisode,
    score,
    year,
    rating: 'PG-13',
    type: 'TV',
    genres: (genres || ['Action', 'Drama']).map((name) => ({ name })),
    banner_image: cover,
    images: { jpg: { large_image_url: cover, image_url: cover }, webp: { large_image_url: cover, image_url: cover } },
  };
}

const FALLBACK_DESKTOP_ANIME = [
  {
    mal_id: 21,
    title: 'ONE PIECE',
    title_english: 'ONE PIECE',
    synopsis: 'Monkey D. Luffy and his crew continue their long voyage through the Grand Line, chasing the legendary treasure and the next island on the map.',
    episodes: 1161,
    latestEpisode: 1161,
    score: 8.7,
    year: 1999,
    rating: 'TV-14',
    type: 'TV',
    genres: [{ name: 'Action' }, { name: 'Adventure' }, { name: 'Fantasy' }],
    banner_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg',
    images: { jpg: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg' }, webp: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg' } },
  },
  {
    mal_id: 52991,
    title: 'Frieren: Beyond Journey’s End',
    title_english: 'Frieren: Beyond Journey’s End',
    synopsis: 'After the hero party defeats the Demon King, Frieren begins a quieter journey through memory, time, and the people left behind.',
    episodes: 28,
    latestEpisode: 28,
    score: 9.3,
    year: 2023,
    rating: 'PG-13',
    type: 'TV',
    genres: [{ name: 'Adventure' }, { name: 'Drama' }, { name: 'Fantasy' }],
    banner_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587-ivXNJ23SM1xB.jpg',
    images: { jpg: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg' }, webp: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg' } },
  },
  {
    mal_id: 51009,
    title: 'Jujutsu Kaisen Season 2',
    title_english: 'Jujutsu Kaisen Season 2',
    synopsis: 'Gojo’s past and the Shibuya Incident reshape the balance of curses, sorcerers, and everything the students thought they understood.',
    episodes: 23,
    latestEpisode: 23,
    score: 8.8,
    year: 2023,
    rating: 'TV-MA',
    type: 'TV',
    genres: [{ name: 'Action' }, { name: 'Supernatural' }],
    banner_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/145064-esDtAY2He7sk.jpg',
    images: { jpg: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx145064-hSNRJM03pvv1.jpg' }, webp: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx145064-hSNRJM03pvv1.jpg' } },
  },
  {
    mal_id: 16498,
    title: 'Attack on Titan',
    title_english: 'Attack on Titan',
    synopsis: 'Humanity fights for survival behind walls as the truth about the Titans grows darker with every battle.',
    episodes: 25,
    latestEpisode: 25,
    score: 8.6,
    year: 2013,
    rating: 'TV-MA',
    type: 'TV',
    genres: [{ name: 'Action' }, { name: 'Drama' }, { name: 'Suspense' }],
    banner_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg',
    images: { jpg: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-buvcRTBx4NSm.jpg' }, webp: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-buvcRTBx4NSm.jpg' } },
  },
  {
    mal_id: 38000,
    title: 'Demon Slayer: Kimetsu no Yaiba',
    title_english: 'Demon Slayer: Kimetsu no Yaiba',
    synopsis: 'Tanjiro joins the Demon Slayer Corps after tragedy strikes his family and his sister is transformed.',
    episodes: 26,
    latestEpisode: 26,
    score: 8.5,
    year: 2019,
    rating: 'R',
    type: 'TV',
    genres: [{ name: 'Action' }, { name: 'Supernatural' }],
    banner_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-33MtJGsUSxga.jpg',
    images: { jpg: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WBsBl0ClmgYL.jpg' }, webp: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WBsBl0ClmgYL.jpg' } },
  },
  {
    mal_id: 5114,
    title: 'Fullmetal Alchemist: Brotherhood',
    title_english: 'Fullmetal Alchemist: Brotherhood',
    synopsis: 'Two brothers search for the Philosopher’s Stone after an alchemy mistake costs them far more than they expected.',
    episodes: 64,
    latestEpisode: 64,
    score: 9.1,
    year: 2009,
    rating: 'TV-14',
    type: 'TV',
    genres: [{ name: 'Action' }, { name: 'Adventure' }, { name: 'Drama' }],
    banner_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/5114-q0V5URebphSG.jpg',
    images: { jpg: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx5114-nSWCgQlmOMtj.jpg' }, webp: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx5114-nSWCgQlmOMtj.jpg' } },
  },
];

const FALLBACK_LATEST = [
  ...FALLBACK_DESKTOP_ANIME.slice(0, 3),
  makeFallbackAnime({ id: 151807, mal_id: 52299, title: 'Solo Leveling', episodes: 12, latestEpisode: 12, score: 8.3, year: 2024, genres: ['Action', 'Fantasy'] }),
  makeFallbackAnime({ id: 171018, mal_id: 57334, title: 'DAN DA DAN', episodes: 12, latestEpisode: 12, score: 8.5, year: 2024, genres: ['Action', 'Comedy', 'Supernatural'] }),
  makeFallbackAnime({ id: 161645, mal_id: 54492, title: 'The Apothecary Diaries', episodes: 24, latestEpisode: 24, score: 8.8, year: 2023, genres: ['Drama', 'Mystery'] }),
];

const FALLBACK_TRENDING = [
  makeFallbackAnime({ id: 151807, mal_id: 52299, title: 'Solo Leveling', episodes: 12, latestEpisode: 12, score: 8.3, year: 2024, genres: ['Action', 'Fantasy'] }),
  makeFallbackAnime({ id: 171018, mal_id: 57334, title: 'DAN DA DAN', episodes: 12, latestEpisode: 12, score: 8.5, year: 2024, genres: ['Action', 'Comedy'] }),
  makeFallbackAnime({ id: 153288, mal_id: 52588, title: 'Kaiju No. 8', episodes: 12, latestEpisode: 12, score: 8.1, year: 2024, genres: ['Action', 'Sci-Fi'] }),
  makeFallbackAnime({ id: 127230, mal_id: 44511, title: 'Chainsaw Man', episodes: 12, latestEpisode: 12, score: 8.5, year: 2022, genres: ['Action', 'Supernatural'] }),
  makeFallbackAnime({ id: 140960, mal_id: 50265, title: 'SPY x FAMILY', episodes: 12, latestEpisode: 12, score: 8.5, year: 2022, genres: ['Action', 'Comedy'] }),
  makeFallbackAnime({ id: 153518, mal_id: 52701, title: 'Delicious in Dungeon', episodes: 24, latestEpisode: 24, score: 8.6, year: 2024, genres: ['Adventure', 'Comedy', 'Fantasy'] }),
];

const FALLBACK_POPULAR = [
  makeFallbackAnime({ id: 21, mal_id: 21, title: 'ONE PIECE', episodes: 1161, latestEpisode: 1161, score: 8.7, year: 1999, genres: ['Action', 'Adventure'] }),
  makeFallbackAnime({ id: 16498, mal_id: 16498, title: 'Attack on Titan', episodes: 25, latestEpisode: 25, score: 8.6, year: 2013, genres: ['Action', 'Drama'] }),
  makeFallbackAnime({ id: 21459, mal_id: 31964, title: 'My Hero Academia', episodes: 13, latestEpisode: 13, score: 7.8, year: 2016, genres: ['Action'] }),
  makeFallbackAnime({ id: 11061, mal_id: 11061, title: 'Hunter x Hunter', episodes: 148, latestEpisode: 148, score: 9.0, year: 2011, genres: ['Action', 'Adventure'] }),
  makeFallbackAnime({ id: 1735, mal_id: 1735, title: 'Naruto: Shippuden', episodes: 500, latestEpisode: 500, score: 8.3, year: 2007, genres: ['Action', 'Adventure'] }),
  makeFallbackAnime({ id: 5114, mal_id: 5114, title: 'Fullmetal Alchemist: Brotherhood', episodes: 64, latestEpisode: 64, score: 9.1, year: 2009, genres: ['Action', 'Drama'] }),
];

const FALLBACK_TOP_AIRING = [
  makeFallbackAnime({ id: 154587, mal_id: 52991, title: 'Frieren: Beyond Journey’s End', episodes: 28, latestEpisode: 28, score: 9.3, year: 2023, genres: ['Adventure', 'Drama', 'Fantasy'] }),
  makeFallbackAnime({ id: 161645, mal_id: 54492, title: 'The Apothecary Diaries', episodes: 24, latestEpisode: 24, score: 8.8, year: 2023, genres: ['Drama', 'Mystery'] }),
  makeFallbackAnime({ id: 153518, mal_id: 52701, title: 'Delicious in Dungeon', episodes: 24, latestEpisode: 24, score: 8.6, year: 2024, genres: ['Adventure', 'Fantasy'] }),
  makeFallbackAnime({ id: 171018, mal_id: 57334, title: 'DAN DA DAN', episodes: 12, latestEpisode: 12, score: 8.5, year: 2024, genres: ['Action', 'Comedy'] }),
  makeFallbackAnime({ id: 153288, mal_id: 52588, title: 'Kaiju No. 8', episodes: 12, latestEpisode: 12, score: 8.1, year: 2024, genres: ['Action', 'Sci-Fi'] }),
  makeFallbackAnime({ id: 130003, mal_id: 47917, title: 'Bocchi the Rock!', episodes: 12, latestEpisode: 12, score: 8.8, year: 2022, genres: ['Comedy', 'Music'] }),
];

const FALLBACK_SEASONAL = [
  makeFallbackAnime({ id: 189046, mal_id: 61316, title: 'Re:ZERO -Starting Life in Another World- Season 4', episodes: 19, latestEpisode: 6, score: 8.7, year: 2026, genres: ['Drama', 'Fantasy'] }),
  makeFallbackAnime({ id: 147105, mal_id: 51553, title: 'Witch Hat Atelier', episodes: 13, latestEpisode: 7, score: 8.6, year: 2026, genres: ['Adventure', 'Fantasy'] }),
  makeFallbackAnime({ id: 182300, mal_id: 59983, title: 'Wistoria: Wand and Sword Season 2', episodes: 12, latestEpisode: 5, score: 8.1, year: 2026, genres: ['Action', 'Fantasy'] }),
  makeFallbackAnime({ id: 174576, title: 'SAKAMOTO DAYS', episodes: 11, latestEpisode: 11, score: 7.8, year: 2025, genres: ['Action', 'Comedy'] }),
  makeFallbackAnime({ id: 185660, title: 'Gachiakuta', episodes: 12, latestEpisode: 1, score: 7.9, year: 2025, genres: ['Action', 'Fantasy'] }),
  makeFallbackAnime({ id: 177709, mal_id: 58939, title: 'Tougen Anki', episodes: 12, latestEpisode: 1, score: 7.4, year: 2025, genres: ['Action', 'Supernatural'] }),
];

const FALLBACK_UPCOMING = [
  makeFallbackAnime({ id: 180516, title: 'Chainsaw Man - The Movie: Reze Arc', episodes: null, latestEpisode: 'TBA', score: 0, year: 2025, genres: ['Action', 'Supernatural'] }),
  makeFallbackAnime({ id: 185213, title: 'Jujutsu Kaisen: Culling Game', episodes: null, latestEpisode: 'TBA', score: 0, year: 2026, genres: ['Action', 'Supernatural'] }),
  makeFallbackAnime({ id: 170942, title: 'One-Punch Man Season 3', episodes: null, latestEpisode: 'TBA', score: 0, year: 2025, genres: ['Action', 'Comedy'] }),
  makeFallbackAnime({ id: 169441, title: 'Fire Force Season 3', episodes: null, latestEpisode: 'TBA', score: 0, year: 2025, genres: ['Action', 'Supernatural'] }),
  makeFallbackAnime({ id: 166518, title: 'WIND BREAKER Season 2', episodes: null, latestEpisode: 'TBA', score: 0, year: 2025, genres: ['Action'] }),
  makeFallbackAnime({ id: 177709, title: 'Tougen Anki', episodes: null, latestEpisode: 'TBA', score: 0, year: 2025, genres: ['Action', 'Supernatural'] }),
];

const FALLBACK_YEARLY = [
  makeFallbackAnime({ id: 151807, mal_id: 52299, title: 'Solo Leveling', episodes: 12, latestEpisode: 12, score: 8.3, year: 2024, genres: ['Action', 'Fantasy'] }),
  makeFallbackAnime({ id: 171018, mal_id: 57334, title: 'DAN DA DAN', episodes: 12, latestEpisode: 12, score: 8.5, year: 2024, genres: ['Action', 'Comedy'] }),
  makeFallbackAnime({ id: 153518, mal_id: 52701, title: 'Delicious in Dungeon', episodes: 24, latestEpisode: 24, score: 8.6, year: 2024, genres: ['Adventure', 'Fantasy'] }),
  makeFallbackAnime({ id: 153288, mal_id: 52588, title: 'Kaiju No. 8', episodes: 12, latestEpisode: 12, score: 8.1, year: 2024, genres: ['Action', 'Sci-Fi'] }),
  makeFallbackAnime({ id: 166531, title: 'WIND BREAKER', episodes: 13, latestEpisode: 13, score: 7.8, year: 2024, genres: ['Action'] }),
  makeFallbackAnime({ id: 169440, title: 'Girls Band Cry', episodes: 13, latestEpisode: 13, score: 8.4, year: 2024, genres: ['Drama', 'Music'] }),
];

function uniqueValues(values: Array<string | undefined | null>) {
  return values.filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

function uniqueAnimeById(items: any[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = animeIdentity(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function takeDistinct(items: any[], count: number, blocked: Set<string> = new Set()) {
  const nextBlocked = new Set(blocked);
  const result: any[] = [];
  for (const item of items) {
    const key = animeIdentity(item);
    if (!key || nextBlocked.has(key)) continue;
    nextBlocked.add(key);
    result.push(item);
    if (result.length >= count) break;
  }
  return result;
}

function uniqueRecentSources(items: LocalPlaybackSource[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [
      animeTitleKey(item.animeTitle || item.title || ''),
      item.episode ? String(item.episode) : '',
    ].join(':');
    if (!key.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function imageFallbackCandidate(anime: any) {
  const id = Number(anime?.anilist_id || anime?.id || 0);
  return id > 0 ? `https://img.anili.st/media/${id}` : '';
}

function heroImageCandidates(anime: any) {
  return uniqueValues([
    anime?.banner_image,
    anime?.trailer?.images?.maximum_image_url,
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.jpg?.image_url,
    imageFallbackCandidate(anime),
  ]);
}

function thumbnailImageCandidates(anime: any) {
  return uniqueValues([
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.jpg?.image_url,
    imageFallbackCandidate(anime),
    anime?.banner_image,
    anime?.trailer?.images?.maximum_image_url,
  ]);
}

function sourceImageCandidates(source: LocalPlaybackSource, fallbackAnime?: any) {
  return uniqueValues([
    source.poster,
    source.image,
    source.banner,
    fallbackAnime ? thumbnailImageCandidates(fallbackAnime)[0] : '',
    fallbackAnime ? heroImageCandidates(fallbackAnime)[0] : '',
  ]);
}

function DesktopImage({
  candidates,
  alt,
  className,
  fallbackClassName,
  loading = 'lazy',
  forceKey,
}: {
  candidates: string[];
  alt: string;
  className: string;
  fallbackClassName?: string;
  loading?: 'eager' | 'lazy';
  forceKey?: string;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const current = candidates[index] || '';

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [forceKey || candidates.join('|')]);

  if (!current || failed) {
    return (
      <div className={fallbackClassName || className}>
        <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_36%_18%,rgba(225,29,72,0.38),transparent_36%),linear-gradient(145deg,#1a1016,#07070a)] p-4">
          <span className="line-clamp-3 text-sm font-black leading-tight text-white/76">{alt || 'Anime'}</span>
        </div>
      </div>
    );
  }

  return (
    <img
      key={forceKey || current}
      src={current}
      alt={alt}
      className={className}
      decoding="async"
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => {
        setIndex((value) => {
          if (value < candidates.length - 1) {
            return value + 1;
          }
          setFailed(true);
          return value;
        });
      }}
    />
  );
}

function scoreText(score?: number) {
  return score ? score.toFixed(1) : 'N/A';
}

function heroDescription(anime: any) {
  const text = anime?.synopsis || 'Browse anime quickly, continue recent source links, and open magnets in your default torrent app when you choose a release.';
  return text.length > 136 ? `${text.slice(0, 132).trim()}...` : text;
}

function preferredEpisodeFor(anime: any, fallback = 1) {
  if (anime?.latestEpisode) return Number(anime.latestEpisode);
  if (anime?.nextAiringEpisode?.episode) return Math.max(Number(anime.nextAiringEpisode.episode) - 1, 1);
  if (anime?.episodes && String(anime.status || '').toUpperCase() === 'FINISHED') return 1;
  return fallback;
}

function watchEpisodeFor(
  anime: any,
  history: LocalPlaybackSource[],
  fallbackEpisode = 1,
) {
  const preferredEpisode = preferredEpisodeFor(anime, fallbackEpisode);
  const maxEpisode = Number(anime?.latestEpisode || anime?.episodes || preferredEpisode || 1);
  return latestUnwatchedEpisodeForAnime(anime, history, preferredEpisode, maxEpisode);
}

function watchPathFor(
  anime: any,
  history: LocalPlaybackSource[],
  audioPreference: DesktopAudioPreference,
  fallbackEpisode?: string | number,
) {
  if (!anime) return '/nyaa?desktop=1';
  if (isUpcomingAnime(anime)) return desktopUpcomingPath(anime);
  const episode = watchEpisodeFor(anime, history, Number(fallbackEpisode || 1) || 1);
  return desktopWatchPath(anime, {
    ep: String(episode),
    type: watchTypeForAudioPreference(audioPreference),
  });
}

const RailHeader = memo(function RailHeader({ title, to }: { title: string; to?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-white">{title}</h2>
      {to ? (
        <Link to={to} className="inline-flex items-center gap-1 text-[13px] font-medium text-white/62 hover:text-white">
          View All
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
});

function useNearViewport<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return undefined;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      const timer = window.setTimeout(() => setVisible(true), 1800);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '360px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return [ref, visible];
}

const ContinueCard = memo(function ContinueCard({ anime, to, episode }: { anime: any; to: string; episode?: string | number }) {
  const images = thumbnailImageCandidates(anime);
  return (
    <Link to={to} className="group w-[238px] shrink-0">
      <div className="relative h-[118px] overflow-hidden rounded-lg border border-white/8 bg-white/[0.06] shadow-lg shadow-black/30">
        <DesktopImage
          candidates={images}
          alt={anime.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.46),rgba(0,0,0,0.04))]" />
        <span className="absolute bottom-3 left-3 grid h-28 w-28 max-h-8 max-w-8 place-items-center rounded-full bg-black/62 text-white backdrop-blur">
          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
        </span>
      </div>
      <p className="mt-2 line-clamp-1 text-[15px] font-medium text-white">{anime.title}</p>
      <p className="mt-1 text-[13px] text-white/50">Episode {episode || anime.latestEpisode || anime.episodes || '1'}</p>
    </Link>
  );
});

const SourceCard = memo(function SourceCard({ source }: { source: LocalPlaybackSource }) {
  const sourceId = String(source.animeId || '');
  const sourceTitle = animeTitleKey(source.animeTitle || source.title || '');
  const fallbackAnime = FALLBACK_DESKTOP_ANIME.find((anime) => {
    return (sourceId && animeIdentity(anime) === sourceId) || (sourceTitle && sourceTitle === animeTitleKey(anime.title));
  });
  const images = sourceImageCandidates(source, fallbackAnime);
  const progress = Math.min(100, Math.max(0, Number(source.progressPercent || 0)));
  return (
    <button
      type="button"
      onClick={() => {
        void openLocalSourceNow(source).catch((error) => {
          console.warn(error instanceof Error ? error.message : String(error || 'Source link could not open.'));
        });
      }}
      className="group w-[238px] shrink-0 text-left"
    >
      <div className="relative h-[118px] overflow-hidden rounded-lg border border-primary/18 bg-[linear-gradient(135deg,rgba(225,29,72,0.42),rgba(255,255,255,0.06)),#141015] p-4 shadow-lg shadow-black/30">
        <DesktopImage
          candidates={images}
          alt={source.animeTitle || source.title}
          className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.58),rgba(0,0,0,0.16))]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(255,255,255,0.22),transparent_36%)]" />
        <span className="relative grid h-8 w-8 place-items-center rounded-full bg-black/58 text-white backdrop-blur">
          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
        </span>
      </div>
      <p className="mt-2 line-clamp-1 text-[15px] font-medium text-white">{source.animeTitle || source.title}</p>
      <p className="mt-1 text-[13px] text-white/50">{source.episode ? `Episode ${source.episode}` : source.size || 'Recent source'}</p>
      {source.resumeSeconds ? (
        <p className="mt-1 text-[12px] font-medium text-white/40">
          Resume {formatPlaybackTime(source.resumeSeconds)}
          {source.durationSeconds ? ` / ${formatPlaybackTime(source.durationSeconds)}` : ''}
        </p>
      ) : null}
      {progress > 0 ? (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </button>
  );
});

function pushUsedKeys(used: Set<string>, items: any[]) {
  items.forEach((item) => {
    const key = animeIdentity(item);
    if (key) used.add(key);
  });
}

function buildRailItems(liveItems: any[], fallbackItems: any[], count: number, used: Set<string>) {
  const result = takeDistinct(uniqueAnimeById(liveItems), count, used);
  const localUsed = new Set(used);
  pushUsedKeys(localUsed, result);

  if (result.length < count) {
    result.push(...takeDistinct(fallbackItems, count - result.length, localUsed));
  }

  pushUsedKeys(used, result);
  return result;
}

export default function DesktopHome() {
  const [history, setHistory] = useState<LocalPlaybackSource[]>(() => loadLocalPlaybackHistory());
  const [audioPreference, setAudioPreference] = useState<DesktopAudioPreference>(() => loadDesktopAudioPreference());
  const recentSources = useMemo(() => uniqueRecentSources(history).slice(0, 5), [history]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [latestRef] = useNearViewport<HTMLElement>();
  const [popularRef] = useNearViewport<HTMLElement>();
  const currentSeason = useMemo(() => getCurrentAnimeSeason(), []);
  const { data: seasonalData } = useQuery({
    queryKey: ['desktop-seasonal', currentSeason.season, currentSeason.year],
    queryFn: () => fetchAnimeSeason(currentSeason.season, currentSeason.year),
    retry: 1,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    select: (result: any) => ({ ...result, data: uniqueAnimeById(result?.data || []).slice(0, 18) }),
  });
  const { data: trendingData } = useQuery({
    queryKey: ['desktop-trending-airing'],
    queryFn: () => searchAnime('', 1, '', '', '', '', 'airing'),
    retry: 1,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    select: (result: any) => ({ ...result, data: uniqueAnimeById(result?.data || []).slice(0, 18) }),
  });
  const { data: recentEpisodeData } = useQuery({
    queryKey: ['desktop-recent-episodes'],
    queryFn: fetchRecentEpisodes,
    enabled: true,
    retry: 1,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    select: (result: any) => ({ ...result, data: uniqueAnimeById(result?.data || []).slice(0, 12) }),
  });
  const { data: popularData } = useQuery({
    queryKey: ['desktop-popular'],
    queryFn: fetchPopularAnime,
    enabled: true,
    retry: 1,
    staleTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    select: (result: any) => ({ ...result, data: uniqueAnimeById(result?.data || []).slice(0, 18) }),
  });
  const { data: topAiringData } = useQuery({
    queryKey: ['desktop-top-airing'],
    queryFn: fetchTopAiring,
    enabled: true,
    retry: 1,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    select: (result: any) => ({ ...result, data: uniqueAnimeById(result?.data || []).slice(0, 18) }),
  });
  const { data: upcomingData } = useQuery({
    queryKey: ['desktop-upcoming'],
    queryFn: fetchUpcomingAnime,
    enabled: true,
    retry: 1,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    select: (result: any) => ({ ...result, data: uniqueAnimeById(result?.data || []).slice(0, 18) }),
  });
  const topYear = new Date().getFullYear() - 1;
  const { data: yearlyTopData } = useQuery({
    queryKey: ['desktop-top-year', topYear],
    queryFn: () => fetchTopAnimeByYear(topYear),
    enabled: true,
    retry: 1,
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    select: (result: any) => ({ ...result, data: uniqueAnimeById(result?.data || []).slice(0, 18) }),
  });
  const seasonalItems = seasonalData?.data || [];
  const trendingItems = trendingData?.data || [];
  const recentEpisodeItems = recentEpisodeData?.data || [];
  const popularItems = popularData?.data || [];
  const topAiringItems = topAiringData?.data || [];
  const upcomingItems = upcomingData?.data || [];
  const yearlyTopItems = yearlyTopData?.data || [];

  const heroPool = useMemo(() => {
    const seasonal = (seasonalItems.length ? seasonalItems : FALLBACK_SEASONAL).filter((anime: any) => heroImageCandidates(anime).length);
    const topSeasonal = [...seasonal]
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
      .slice(0, 8);
    return topSeasonal;
  }, [seasonalItems]);
  const hero = heroPool[heroIndex] || heroPool[0];
  useEffect(() => subscribeLocalPlaybackHistory(() => setHistory(loadLocalPlaybackHistory())), []);
  useEffect(() => subscribeDesktopAudioPreference(() => setAudioPreference(loadDesktopAudioPreference())), []);
  const rails = useMemo(() => {
    const used = new Set<string>();
    return {
      latestEpisodes: buildRailItems(recentEpisodeItems, FALLBACK_LATEST, 6, used),
      trending: buildRailItems(trendingItems, FALLBACK_TRENDING, 6, used),
      topAiring: buildRailItems(topAiringItems, FALLBACK_TOP_AIRING, 6, used),
      seasonalPicks: buildRailItems(seasonalItems, FALLBACK_SEASONAL, 6, used),
      upcoming: buildRailItems(upcomingItems, FALLBACK_UPCOMING, 6, used),
      popular: buildRailItems(popularItems, FALLBACK_POPULAR, 6, used),
      yearlyTop: buildRailItems(yearlyTopItems, FALLBACK_YEARLY, 6, used),
    };
  }, [popularItems, recentEpisodeItems, seasonalItems, topAiringItems, trendingItems, upcomingItems, yearlyTopItems]);
  const latestEpisodes = rails.latestEpisodes;
  const trending = rails.trending;
  const topAiring = rails.topAiring;
  const seasonalPicks = rails.seasonalPicks;
  const upcoming = rails.upcoming;
  const popular = rails.popular;
  const yearlyTop = rails.yearlyTop;
  const heroCount = heroPool.length;

  useEffect(() => {
    setHeroIndex(0);
  }, [heroPool]);

  useEffect(() => {
    if (heroCount < 2) return undefined;
    const timer = window.setInterval(() => {
      setHeroIndex((index) => (index + 1) % heroCount);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [heroCount]);

  const moveHero = (direction: 1 | -1) => {
    if (!heroCount) return;
    setHeroIndex((index) => (index + direction + heroCount) % heroCount);
  };

  return (
    <div className="desktop-home-cinema px-6 pb-9 pt-3">
      <Seo title="StreamNyaa Desktop Cinema" description="StreamNyaa desktop app home." canonicalPath="/" robots="noindex, nofollow" />

      <section className="relative overflow-hidden rounded-lg border border-white/9 bg-[#101014] shadow-2xl shadow-black/45">
        <div className="relative h-[350px]">
          {hero ? (
            <DesktopImage
              candidates={heroImageCandidates(hero)}
              alt={hero.title}
              className="absolute inset-0 h-full w-full object-cover animate-[fadeIn_600ms_ease]"
              loading="eager"
              forceKey={`${hero?.mal_id || hero?.id || hero?.title || heroIndex}-${heroIndex}`}
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,12,15,0.96)_0%,rgba(12,12,15,0.74)_31%,rgba(12,12,15,0.22)_61%,rgba(12,12,15,0.75)_100%),linear-gradient(0deg,rgba(12,12,15,0.62)_0%,transparent_42%)]" />

          <div className="relative flex h-full items-center px-14">
            <div className="max-w-[560px]">
              <h1 className="line-clamp-1 text-[36px] font-semibold leading-tight tracking-[-0.03em] text-white md:text-[42px]">
                {hero?.title || 'StreamNyaa'}
              </h1>
              <p className="mt-1 line-clamp-1 text-[18px] font-normal text-white/82">
                {hero?.title_english || hero?.title_japanese || 'Desktop anime cinema'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[12px] font-medium text-white/86">
                <span className="rounded bg-white/12 px-2.5 py-1 backdrop-blur">{hero?.year || hero?.aired?.prop?.from?.year || '2026'}</span>
                <span className="rounded bg-white/12 px-2.5 py-1 backdrop-blur">{hero?.rating?.replace(' - ', '-') || 'TV-MA'}</span>
                <span className="rounded bg-white/12 px-2.5 py-1 backdrop-blur">{hero?.episodes || 'TBA'} Episodes</span>
                <span className="rounded bg-white/12 px-2.5 py-1 backdrop-blur">HD</span>
                <span className="rounded bg-white/12 px-2.5 py-1 backdrop-blur">Multi Audio</span>
              </div>
              <p className="mt-5 max-w-[500px] text-[15px] leading-7 text-white/72">{heroDescription(hero)}</p>
              <div className="mt-7 flex gap-3">
                <Link
                  to={watchPathFor(hero, history, audioPreference, preferredEpisodeFor(hero))}
                  className="inline-flex h-11 items-center gap-3 rounded-md bg-primary px-6 text-[16px] font-medium text-white shadow-xl shadow-primary/20 hover:bg-primary/90"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Watch Now
                </Link>
                <Link
                  to={hero ? watchPathFor(hero, history, audioPreference, preferredEpisodeFor(hero)) : '/search'}
                  className="inline-flex h-11 items-center gap-3 rounded-md border border-white/13 bg-white/10 px-6 text-[16px] font-medium text-white shadow-xl shadow-black/20 backdrop-blur hover:bg-white/14"
                >
                  <Info className="h-4 w-4" />
                  More Info
                </Link>
              </div>
            </div>
          </div>

          <div className="absolute right-12 top-1/2 flex -translate-y-1/2 gap-6">
            <button
              type="button"
              onClick={() => moveHero(-1)}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/36 text-white/80 backdrop-blur hover:bg-white/15"
              aria-label="Previous seasonal pick"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => moveHero(1)}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/36 text-white/80 backdrop-blur hover:bg-white/15"
              aria-label="Next seasonal pick"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {heroCount > 1 ? (
            <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 gap-4">
              {heroPool.map((anime: any, item: number) => (
                <button
                  key={animeIdentity(anime) || item}
                  type="button"
                  onClick={() => setHeroIndex(item)}
                  className={`h-2 w-2 rounded-full transition-all ${item === heroIndex ? 'bg-primary' : 'bg-white/28 hover:bg-white/60'}`}
                  aria-label={`Show seasonal pick ${item + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {recentSources.length ? (
        <section className="mt-7">
          <RailHeader title="Continue Watching" to="/dashboard" />
          <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
            {recentSources.map((source) => <SourceCard key={source.magnet} source={source} />)}
          </div>
        </section>
      ) : null}

      <section ref={latestRef} className="mt-7">
        <RailHeader title="New Episodes" to="/schedule" />
        <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
          {latestEpisodes.map((anime: any, index: number) => (
            <ContinueCard
              key={`latest-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime, index + 1))}
              episode={watchEpisodeFor(anime, history, index + 1)}
            />
          ))}
          {!latestEpisodes.length ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[118px] w-[238px] shrink-0 rounded-lg bg-white/[0.045]" />) : null}
        </div>
      </section>

      <section className="mt-7">
        <RailHeader title="Trending Now" to="/search?sort=trending&status=airing" />
        <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
          {trending.map((anime: any, index: number) => (
            <ContinueCard
              key={`trending-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime))}
              episode={watchEpisodeFor(anime, history, preferredEpisodeFor(anime))}
            />
          ))}
          {!trending.length ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[118px] w-[238px] shrink-0 rounded-lg bg-white/[0.045]" />) : null}
        </div>
      </section>

      <section className="mt-7">
        <RailHeader title="Top Airing Anime" to="/search?sort=score&status=airing" />
        <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
          {topAiring.map((anime: any, index: number) => (
            <ContinueCard
              key={`top-airing-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime))}
              episode={watchEpisodeFor(anime, history, preferredEpisodeFor(anime))}
            />
          ))}
        </div>
      </section>

      <section className="mt-7">
        <RailHeader title="Seasonal Anime" to="/search?status=airing" />
        <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
          {seasonalPicks.map((anime: any, index: number) => (
            <ContinueCard
              key={`seasonal-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime))}
              episode={watchEpisodeFor(anime, history, preferredEpisodeFor(anime))}
            />
          ))}
        </div>
      </section>

      {upcoming.length ? (
        <section className="mt-7">
          <RailHeader title="Upcoming Anime" to="/search?mode=upcoming" />
          <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
            {upcoming.map((anime: any, index: number) => (
              <ContinueCard key={`upcoming-${anime.mal_id || anime.id || index}`} anime={anime} to={desktopUpcomingPath(anime)} episode="TBA" />
            ))}
          </div>
        </section>
      ) : null}

      <section ref={popularRef} className="mt-7">
        <RailHeader title="Popular Picks" to="/search?sort=popular" />
        <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
          {popular.map((anime: any, index: number) => (
            <ContinueCard
              key={`popular-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime))}
              episode={watchEpisodeFor(anime, history, preferredEpisodeFor(anime))}
            />
          ))}
          {!popular.length ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[118px] w-[238px] shrink-0 rounded-lg bg-white/[0.045]" />) : null}
        </div>
      </section>

      <section className="mt-7">
        <RailHeader title={`Top Anime From ${topYear}`} to={`/search?sort=score`} />
        <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
          {yearlyTop.map((anime: any, index: number) => (
            <ContinueCard
              key={`yearly-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime))}
              episode={watchEpisodeFor(anime, history, preferredEpisodeFor(anime))}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
