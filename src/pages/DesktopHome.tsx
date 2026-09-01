import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Info, Play, Star } from 'lucide-react';
import Seo from '../components/Seo';
import { fetchPopularAnime, fetchRecentEpisodes, fetchTopAiring, fetchTopAnimeByYear, fetchUpcomingAnime, searchAnime } from '../api/jikan';
import {
  formatPlaybackTime,
  latestUnwatchedEpisodeForAnime,
  loadDesktopAudioPreference,
  loadLocalPlaybackHistory,
  openLocalSourceNow,
  removeLocalPlaybackHistoryItem,
  subscribeDesktopAudioPreference,
  subscribeLocalPlaybackHistory,
  type DesktopAudioPreference,
  type LocalPlaybackSource,
  watchTypeForAudioPreference,
} from '../lib/desktop';
import { animeIdentity, animeTitleKey } from '../lib/animeIdentity';
import { desktopUpcomingPath, desktopWatchPath, isUpcomingAnime } from '../lib/desktopAnimeRoute';
import { primeDesktopWatchSnapshot } from '../lib/desktopWatchSnapshot';
import { useSeasonalAnimeQuery } from '../lib/seasonalAnime';
import { airedEpisodeCount, episodeAvailabilityLabel } from '../lib/animeEpisodes';

const FALLBACK_POSTERS: Record<number, string> = {
  52299: 'https://cdn.myanimelist.net/images/anime/1801/142390l.jpg',
  57334: 'https://cdn.myanimelist.net/images/anime/1584/143719l.jpg',
  54492: 'https://cdn.myanimelist.net/images/anime/1708/138033l.jpg',
};

function fallbackCover(malId?: number) {
  return malId ? FALLBACK_POSTERS[malId] || '' : '';
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
  const cover = fallbackCover(mal_id);
  return {
    id,
    ...(mal_id ? { mal_id } : {}),
    title,
    title_english: title,
    anilist_id: id,
    synopsis: synopsis || 'Open the desktop watch flow, pick an aired episode, and search individual source links.',
    episodes,
    latestEpisode,
    score,
    year,
    rating: 'PG-13',
    type: 'TV',
    genres: (genres || ['Action', 'Drama']).map((name) => ({ name })),
    banner_image: '',
    images: cover
      ? { jpg: { large_image_url: cover, image_url: cover }, webp: { large_image_url: cover, image_url: cover } }
      : undefined,
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
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
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

function posterImageCandidates(anime: any) {
  return uniqueValues([
    anime?.coverImage?.extraLarge,
    anime?.coverImage?.large,
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.webp?.image_url,
    anime?.images?.jpg?.image_url,
    anime?.poster,
    anime?.image,
    anime?.banner_image,
    anime?.bannerImage,
    anime?.trailer?.images?.maximum_image_url,
  ]);
}

function bannerImageCandidates(anime: any) {
  return uniqueValues([
    anime?.banner_image,
    anime?.bannerImage,
    anime?.backdrop,
    anime?.trailer?.images?.maximum_image_url,
    anime?.trailer?.images?.large_image_url,
  ]);
}

function heroImageCandidates(anime: any) {
  return uniqueValues([
    anime?.banner_image,
    anime?.bannerImage,
    anime?.backdrop,
    anime?.trailer?.images?.maximum_image_url,
    anime?.trailer?.images?.large_image_url,
  ]);
}

function landscapeImageCandidates(anime: any) {
  return uniqueValues([
    ...bannerImageCandidates(anime),
    anime?.trailer?.images?.maximum_image_url,
    anime?.trailer?.images?.large_image_url,
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.coverImage?.extraLarge,
    anime?.coverImage?.large,
  ]);
}

function sourceImageCandidates(source: LocalPlaybackSource, fallbackAnime?: any) {
  const sourceArtwork = source as LocalPlaybackSource & {
    thumbnail?: string;
    episodeImage?: string;
    backdrop?: string;
  };

  return uniqueValues([
    sourceArtwork.thumbnail,
    sourceArtwork.episodeImage,
    sourceArtwork.backdrop,
    source.banner,
    source.image,
    ...(fallbackAnime ? landscapeImageCandidates(fallbackAnime) : []),
    source.poster,
    ...(fallbackAnime ? posterImageCandidates(fallbackAnime) : []),
  ]);
}

function sourceProgressPercent(source: LocalPlaybackSource) {
  const duration = Number(source.durationSeconds || 0);
  const resume = Number(source.resumeSeconds || 0);
  if (Number.isFinite(duration) && duration > 0 && Number.isFinite(resume) && resume > 0) {
    return Math.min(100, Math.max(0, (resume / duration) * 100));
  }

  const explicit = Number(source.progressPercent || 0);
  return Number.isFinite(explicit) ? Math.min(100, Math.max(0, explicit)) : 0;
}

function sourceUpdatedLabel(source: LocalPlaybackSource) {
  const timestamp = Number(source.progressUpdatedAt || source.savedAt || 0);
  if (!timestamp) return 'Recently watched';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function fallbackInitials(value: string) {
  const words = String(value || 'SN')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'SN';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
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
        <div className="flex h-full w-full flex-col justify-between bg-[radial-gradient(circle_at_34%_18%,rgba(244,63,94,0.40),transparent_38%),radial-gradient(circle_at_88%_82%,rgba(79,70,229,0.20),transparent_32%),linear-gradient(145deg,#1a1016,#07070a)] p-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-black/30 text-sm font-black tracking-[0.08em] text-white/76 shadow-lg shadow-black/24 backdrop-blur">
            {fallbackInitials(alt)}
          </span>
          <span className="line-clamp-3 text-sm font-black leading-tight text-white/78 drop-shadow">{alt || 'Anime'}</span>
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

function animeGenre(anime: any) {
  return anime?.genres?.[0]?.name || anime?.genres?.[0] || anime?.type || 'Anime';
}

function animeYear(anime: any) {
  return anime?.year || anime?.aired?.prop?.from?.year || '';
}

function heroDescription(anime: any) {
  const text = anime?.synopsis || 'Browse anime quickly, resume where you left off, and start watching with one click.';
  return text.length > 190 ? `${text.slice(0, 186).trim()}...` : text;
}

function heroMetadata(anime: any) {
  return uniqueValues([
    String(anime?.year || anime?.aired?.prop?.from?.year || '2026'),
    anime?.rating ? String(anime.rating).replace(' - ', '-') : 'TV-MA',
    anime?.episodes ? `${anime.episodes} Episodes` : 'TBA',
    anime?.type || 'TV',
    'HD',
    'Sub/Dub',
  ]).slice(0, 6);
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

const RailHeader = memo(function RailHeader({
  title,
  subtitle,
  to,
}: {
  title: string;
  subtitle?: string;
  to?: string;
  count?: number;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[20px] font-black tracking-[-0.025em] text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-[12px] font-semibold text-white/46">{subtitle}</p> : null}
      </div>
      {to ? (
        <Link to={to} className="mb-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[13px] font-bold text-white/58 transition-colors hover:bg-white/[0.055] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          View All
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
});

const MediaRail = memo(function MediaRail({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState({ canScroll: false, canLeft: false, canRight: false });
  const updateScrollState = () => {
    const node = ref.current;
    if (!node) return;
    const maxLeft = node.scrollWidth - node.clientWidth;
    const canScroll = maxLeft > 8;
    setScrollState({
      canScroll,
      canLeft: canScroll && node.scrollLeft > 8,
      canRight: canScroll && node.scrollLeft < maxLeft - 8,
    });
  };
  const scroll = (direction: 1 | -1) => {
    ref.current?.scrollBy({ left: direction * 560, behavior: 'smooth' });
  };

  useEffect(() => {
    updateScrollState();
    const timer = window.setTimeout(updateScrollState, 120);
    window.addEventListener('resize', updateScrollState);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [children]);

  return (
    <div className="group/rail relative">
      <div ref={ref} onScroll={updateScrollState} className="sn-scroll-rail flex gap-4 pb-2">
        {children}
      </div>
      {scrollState.canScroll ? (
      <div className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 gap-2 opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 xl:flex">
        <button
          type="button"
          onClick={() => scroll(-1)}
          disabled={!scrollState.canLeft}
          className="sn-icon-action pointer-events-auto h-10 w-10 rounded-full disabled:pointer-events-none disabled:opacity-0"
          aria-label="Scroll rail left"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => scroll(1)}
          disabled={!scrollState.canRight}
          className="sn-icon-action pointer-events-auto h-10 w-10 rounded-full disabled:pointer-events-none disabled:opacity-0"
          aria-label="Scroll rail right"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      ) : null}
    </div>
  );
});

const PosterAnimeCard = memo(function PosterAnimeCard({
  anime,
  to,
  episode,
  showNew,
}: {
  anime: any;
  to: string;
  episode?: string | number;
  showNew?: boolean;
}) {
  const episodeLabel = episodeAvailabilityLabel({
    ...anime,
    latestEpisode: airedEpisodeCount(anime) ?? (Number(episode) > 0 ? Number(episode) : undefined),
  });
  const year = animeYear(anime);
  const type = anime?.type || 'TV';
  const badges = [
    `EP ${episodeLabel}`,
    showNew ? 'NEW' : '',
  ].filter(Boolean);
  return (
    <Link
      to={to}
      onPointerEnter={() => primeDesktopWatchSnapshot(to, anime)}
      onFocus={() => primeDesktopWatchSnapshot(to, anime)}
      onPointerDown={() => primeDesktopWatchSnapshot(to, anime)}
      className="sn-card-hover group w-[190px] shrink-0 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 2xl:w-[210px]"
    >
      <div className="sn-poster-card relative h-[278px] transition-all duration-200 group-focus-visible:ring-primary/40 2xl:h-[304px]">
        <DesktopImage
          candidates={posterImageCandidates(anime)}
          alt={anime.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.045]"
          forceKey={`${anime?.mal_id || anime?.id || anime?.title || 'poster'}-poster`}
        />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(5,6,10,0.86)_0%,rgba(5,6,10,0.38)_38%,rgba(5,6,10,0.03)_76%)]" />
        <div className="absolute left-3 top-3 flex max-w-[calc(100%-24px)] items-center gap-1.5">
          {badges.length ? (
            <span className="max-w-full truncate rounded-full bg-black/58 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-lg shadow-black/20 backdrop-blur">
              {badges.join(' / ')}
            </span>
          ) : null}
        </div>
        <span className="absolute right-3 top-3 grid h-8 w-8 translate-y-1 place-items-center rounded-full border border-white/[0.10] bg-black/56 text-white opacity-0 shadow-lg shadow-black/22 backdrop-blur transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
        </span>
        <div className="absolute inset-x-0 bottom-0 p-3.5">
          <p className="line-clamp-2 text-[14px] font-black leading-tight tracking-[-0.02em] text-white drop-shadow">{anime.title}</p>
          <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-white/58">{animeGenre(anime)}{year ? ` - ${year}` : ''}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="rounded-full bg-white/[0.09] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-white/68 backdrop-blur">{type}</span>
            {anime?.score ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-black text-white">
                <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                {scoreText(anime.score)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
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
  const progress = sourceProgressPercent(source);
  const progressWidth = progress > 0 ? Math.max(progress, 2) : 0;
  const resumeText = source.resumeSeconds
    ? `Resume ${formatPlaybackTime(source.resumeSeconds)}${source.durationSeconds ? ` / ${formatPlaybackTime(source.durationSeconds)}` : ''}`
    : source.episode ? `Episode ${source.episode}` : source.size || 'Recent source';
  const episodeLabel = source.episode ? `Episode ${source.episode}` : 'Recent source';
  const lastWatchedText = sourceUpdatedLabel(source);
  const detailsQuery = new URLSearchParams({
    q: source.animeTitle || source.title,
    ...(source.animeId ? { animeId: String(source.animeId) } : {}),
    ...(source.episode ? { ep: String(source.episode) } : {}),
  });
  const detailsPath = `/nyaa?${detailsQuery.toString()}`;
  const resume = () => {
    void openLocalSourceNow(source).catch((error) => {
      console.warn(error instanceof Error ? error.message : String(error || 'Source link could not open.'));
    });
  };
  return (
    <div
      className="sn-card-hover group w-[282px] shrink-0 cursor-pointer rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 2xl:w-[302px]"
    >
      <div className="sn-landscape-card relative aspect-video transition-all duration-200">
        <button
          type="button"
          onClick={resume}
          className="absolute inset-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/70"
          aria-label={`Resume ${source.animeTitle || source.title}`}
        >
          <DesktopImage
            candidates={images}
            alt={source.animeTitle || source.title}
            className="absolute inset-0 h-full w-full object-cover opacity-95 transition-transform duration-500 group-hover:scale-[1.045]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,8,12,0.84),rgba(7,8,12,0.34)_42%,rgba(7,8,12,0.02)_78%)]" />
          <span className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/[0.10] bg-black/58 text-white shadow-lg shadow-black/18 backdrop-blur transition-all group-hover:bg-primary group-hover:shadow-primary/20">
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          </span>
          <span className="absolute inset-x-0 bottom-0 block p-3.5">
            <span className="block line-clamp-1 text-[13px] font-black text-white drop-shadow">{source.animeTitle || source.title}</span>
            <span className="mt-1 block line-clamp-1 text-[11px] font-semibold text-white/64">{episodeLabel} - {resumeText}</span>
            <span className="mt-0.5 block line-clamp-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/42">{lastWatchedText}</span>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/14">
              <span className="block h-full rounded-full bg-gradient-to-r from-primary to-[#ff647d]" style={{ width: `${progressWidth}%` }} />
            </span>
          </span>
        </button>
        <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              resume();
            }}
            className="sn-ghost-action min-h-0 rounded-full px-2 py-1 text-[10px] font-bold tracking-wide"
            aria-label={`Resume ${source.animeTitle || source.title}`}
          >
            Resume
          </button>
          <Link
            to={detailsPath}
            onClick={(event) => event.stopPropagation()}
            className="sn-ghost-action inline-flex min-h-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold tracking-wide"
            aria-label={`Open sources for ${source.animeTitle || source.title}`}
          >
            <Info className="h-3 w-3" />
            Details
          </Link>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              removeLocalPlaybackHistoryItem(source);
            }}
            className="sn-ghost-action min-h-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] hover:bg-primary"
            aria-label={`Remove ${source.animeTitle || source.title} from Continue Watching`}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
});

function keysForItems(items: any[]) {
  return new Set(items.map((item) => animeIdentity(item)).filter(Boolean));
}

function buildRailItems(liveItems: any[], fallbackItems: any[], count: number, softBlocked: Set<string> = new Set()) {
  const liveUnique = uniqueAnimeById(liveItems);
  const fallbackUnique = uniqueAnimeById(fallbackItems);
  const result = takeDistinct(liveUnique, count, softBlocked);
  const localUsed = keysForItems(result);

  if (result.length < count) {
    result.push(...takeDistinct(liveUnique, count - result.length, localUsed));
    keysForItems(result).forEach((key) => localUsed.add(key));
  }

  if (result.length < count) {
    const blocked = new Set([...localUsed, ...softBlocked]);
    result.push(...takeDistinct(fallbackUnique, count - result.length, blocked));
    keysForItems(result).forEach((key) => localUsed.add(key));
  }

  if (result.length < count) {
    result.push(...takeDistinct(fallbackUnique, count - result.length, localUsed));
  }

  return result.slice(0, count);
}

export default function DesktopHome() {
  const [history, setHistory] = useState<LocalPlaybackSource[]>(() => loadLocalPlaybackHistory());
  const [audioPreference, setAudioPreference] = useState<DesktopAudioPreference>(() => loadDesktopAudioPreference());
  const recentSources = useMemo(() => uniqueRecentSources(history).slice(0, 6), [history]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [secondaryRailsReady, setSecondaryRailsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const idleApi = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const reveal = () => {
      if (!cancelled) setSecondaryRailsReady(true);
    };
    if (idleApi.requestIdleCallback) {
      const handle = idleApi.requestIdleCallback(reveal, { timeout: 900 });
      return () => {
        cancelled = true;
        idleApi.cancelIdleCallback?.(handle);
      };
    }
    const handle = window.setTimeout(reveal, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, []);

  // useSeasonalAnimeQuery wraps fetchAnimeSeason so Home always follows the current season/year key.
  const {
    currentSeason,
    data: seasonalData,
    isError: seasonalError,
    isSuccess: seasonalSuccess,
  } = useSeasonalAnimeQuery({
    limit: 18,
    queryKeyPrefix: 'desktop-seasonal',
    staleTime: 1000 * 60 * 10,
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
    enabled: secondaryRailsReady,
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
    enabled: secondaryRailsReady,
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
    enabled: secondaryRailsReady,
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
  const seasonalFallbackItems = useMemo(
    () => (seasonalError || (seasonalSuccess && !seasonalItems.length) ? FALLBACK_SEASONAL : []),
    [seasonalError, seasonalItems.length, seasonalSuccess],
  );

  const heroPool = useMemo(() => {
    const liveSeasonal = seasonalItems.filter((anime: any) => heroImageCandidates(anime).length);
    const fallbackSeasonal = seasonalFallbackItems.filter((anime: any) => heroImageCandidates(anime).length);
    const candidates = liveSeasonal.length
      ? liveSeasonal
      : topAiringItems.length
        ? topAiringItems
        : trendingItems.length
          ? trendingItems
          : fallbackSeasonal.length
            ? fallbackSeasonal
            : FALLBACK_DESKTOP_ANIME;
    const topSeasonal = [...candidates]
      .filter((anime: any) => heroImageCandidates(anime).length)
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
      .slice(0, 8);
    return topSeasonal;
  }, [seasonalFallbackItems, seasonalItems, topAiringItems, trendingItems]);
  const hero = heroPool[heroIndex] || heroPool[0];
  useEffect(() => subscribeLocalPlaybackHistory(() => setHistory(loadLocalPlaybackHistory())), []);
  useEffect(() => subscribeDesktopAudioPreference(() => setAudioPreference(loadDesktopAudioPreference())), []);
  const rails = useMemo(() => {
    const latestEpisodes = buildRailItems(recentEpisodeItems, FALLBACK_LATEST, 8);
    const trending = buildRailItems(trendingItems, FALLBACK_TRENDING, 8, keysForItems(latestEpisodes));
    const topAiring = buildRailItems(topAiringItems, FALLBACK_TOP_AIRING, 8, keysForItems(trending));
    const seasonalPicks = buildRailItems(seasonalItems, seasonalFallbackItems, 8, keysForItems(topAiring));
    const upcoming = buildRailItems(upcomingItems, FALLBACK_UPCOMING, 8);
    const popular = buildRailItems(popularItems, FALLBACK_POPULAR, 8, keysForItems(seasonalPicks));
    const yearlyTop = buildRailItems(yearlyTopItems, FALLBACK_YEARLY, 8, keysForItems(popular));
    return {
      latestEpisodes,
      trending,
      topAiring,
      seasonalPicks,
      upcoming,
      popular,
      yearlyTop,
    };
  }, [popularItems, recentEpisodeItems, seasonalFallbackItems, seasonalItems, topAiringItems, trendingItems, upcomingItems, yearlyTopItems]);
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
    let timer: number | undefined;
    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (document.visibilityState === 'hidden') return;
      timer = window.setTimeout(() => {
        setHeroIndex((index) => (index + 1) % heroCount);
        schedule();
      }, 7000);
    };
    const handleVisibility = () => schedule();
    schedule();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [heroCount]);

  useEffect(() => {
    if (!heroCount || typeof window === 'undefined') return;
    const nextHero = heroPool[(heroIndex + 1) % heroCount];
    const image = heroImageCandidates(nextHero)[0];
    if (!image) return;
    const preload = new Image();
    preload.referrerPolicy = 'no-referrer';
    preload.src = image;
  }, [heroCount, heroIndex, heroPool]);

  const moveHero = (direction: 1 | -1) => {
    if (!heroCount) return;
    setHeroIndex((index) => (index + direction + heroCount) % heroCount);
  };

  return (
    <div className="desktop-home-cinema sn-page pb-9 pt-4">
      <Seo title="StreamNyaa Desktop Cinema" description="StreamNyaa desktop app home." canonicalPath="/" robots="noindex, nofollow" />

      <section className="sn-hero-panel relative">
        <div className="relative h-[326px]">
          {heroPool.map((item: any, index: number) => (
            <div
              key={animeIdentity(item) || `${item?.title || 'hero'}-${index}`}
              className={`absolute inset-0 transition-opacity duration-700 ease-out ${index === heroIndex ? 'opacity-100' : 'opacity-0'}`}
            >
              <DesktopImage
                candidates={heroImageCandidates(item)}
                alt={item.title}
                className={`absolute inset-y-0 right-0 h-full w-[82%] object-cover object-[68%_center] saturate-[1.06] contrast-[1.03] transition-transform duration-700 ease-out ${index === heroIndex ? 'scale-100' : 'scale-[1.012]'}`}
                loading={index === heroIndex || index === (heroIndex + 1) % Math.max(heroCount, 1) ? 'eager' : 'lazy'}
                forceKey={`${item?.mal_id || item?.id || item?.title || index}-${index}`}
              />
            </div>
          ))}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,10,0.98)_0%,rgba(5,6,10,0.91)_31%,rgba(5,6,10,0.48)_57%,rgba(5,6,10,0.12)_100%),linear-gradient(0deg,rgba(5,6,10,0.46)_0%,rgba(5,6,10,0.02)_54%,rgba(5,6,10,0.10)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_28%,rgba(244,63,94,0.10),transparent_30%),radial-gradient(circle_at_12%_82%,rgba(244,63,94,0.11),transparent_31%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          <div className="relative flex h-full items-center px-9 xl:px-12">
            <div
              key={animeIdentity(hero) || heroIndex}
              className="flex h-[282px] w-full max-w-[610px] flex-col animate-[desktop-hero-copy_520ms_cubic-bezier(0.25,1,0.5,1)]"
            >
              <div className="min-h-0 overflow-hidden">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.36em] text-primary">Featured Anime</p>
                <h1 className="line-clamp-2 max-w-[570px] overflow-hidden break-words text-[27px] font-black leading-[1.06] tracking-[-0.03em] text-white drop-shadow-[0_5px_20px_rgba(0,0,0,0.58)] md:text-[30px] xl:text-[32px]">
                  {hero?.title || 'StreamNyaa'}
                </h1>
                <p className="mt-2 line-clamp-1 max-w-[520px] overflow-hidden text-[13px] font-semibold leading-5 text-white/72">
                  {hero?.title_english || hero?.title_japanese || 'Desktop anime cinema'}
                </p>
                <div className="mt-3 flex max-h-[28px] max-w-[520px] gap-2 overflow-hidden">
                  {heroMetadata(hero).slice(0, 4).map((item) => (
                    <span key={item} className="shrink-0 rounded-md bg-white/[0.09] px-2.5 py-1 text-[11px] font-bold text-white/76 backdrop-blur ring-1 ring-white/[0.045]">
                      {item}
                    </span>
                  ))}
                </div>
                <p className="mt-4 line-clamp-2 max-w-[540px] overflow-hidden text-[13px] leading-5 text-white/78">{heroDescription(hero)}</p>
              </div>
              <div className="hero-cta mt-auto flex shrink-0 items-end pt-5">
                <Link
                  to={watchPathFor(hero, history, audioPreference, preferredEpisodeFor(hero))}
                  className="sn-primary-action group/watch h-[50px] min-w-[176px] rounded-[16px] px-7 text-[15px]"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/18 ring-1 ring-white/14 transition-colors group-hover/watch:bg-white/24">
                    <Play className="ml-0.5 h-[14px] w-[14px] fill-current" />
                  </span>
                  Watch Now
                </Link>
              </div>
            </div>
          </div>

          <div className="absolute right-9 top-1/2 flex -translate-y-1/2 gap-3">
            <button
              type="button"
              onClick={() => moveHero(-1)}
              className="sn-icon-action h-11 w-11 rounded-full"
              aria-label="Previous seasonal pick"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => moveHero(1)}
              className="sn-icon-action h-11 w-11 rounded-full"
              aria-label="Next seasonal pick"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {heroCount > 1 ? (
            <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 gap-3">
              {heroPool.map((anime: any, item: number) => (
                <button
                  key={animeIdentity(anime) || item}
                  type="button"
                  onClick={() => setHeroIndex(item)}
                  className={`h-2 rounded-full transition-all duration-300 ${item === heroIndex ? 'w-7 bg-primary shadow-lg shadow-primary/30' : 'w-2 bg-white/30 hover:bg-white/60'}`}
                  aria-label={`Show seasonal pick ${item + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {recentSources.length ? (
        <section className="mt-8 desktop-section-enter">
          <RailHeader title="Continue Watching" subtitle="Pick up from local playback history" to="/dashboard" count={recentSources.length} />
          <MediaRail>
            {recentSources.map((source) => <SourceCard key={source.magnet} source={source} />)}
          </MediaRail>
        </section>
      ) : null}

      <section className="mt-7 desktop-section-enter">
        <RailHeader title="New Episodes" subtitle="Freshly updated episode entries" to="/search?mode=new" count={latestEpisodes.length} />
        <MediaRail>
          {latestEpisodes.map((anime: any, index: number) => (
            <PosterAnimeCard
              key={`latest-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime, index + 1))}
              episode={anime?.latestEpisode || watchEpisodeFor(anime, history, index + 1)}
              showNew
            />
          ))}
          {!latestEpisodes.length ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[278px] w-[190px] shrink-0 rounded-2xl border border-white/8 bg-white/[0.045] 2xl:h-[304px] 2xl:w-[210px]" />) : null}
        </MediaRail>
      </section>

      <section className="mt-7 desktop-section-enter">
        <RailHeader title="Trending Now" subtitle="Airing titles with the strongest current activity" to="/search?mode=trending" count={trending.length} />
        <MediaRail>
          {trending.map((anime: any, index: number) => (
            <PosterAnimeCard
              key={`trending-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime))}
            />
          ))}
          {!trending.length ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[278px] w-[190px] shrink-0 rounded-2xl border border-white/8 bg-white/[0.045] 2xl:h-[304px] 2xl:w-[210px]" />) : null}
        </MediaRail>
      </section>

      <section className="mt-7 desktop-section-enter">
        <RailHeader title="Top Airing Anime" subtitle="Highest rated shows still in rotation" to="/search?mode=airing" count={topAiring.length} />
        <MediaRail>
          {topAiring.map((anime: any, index: number) => (
            <PosterAnimeCard
              key={`top-airing-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime))}
            />
          ))}
        </MediaRail>
      </section>

      <section className="mt-7 desktop-section-enter">
        <RailHeader title="Seasonal Anime" subtitle={`${currentSeason.label} picks`} to="/search?mode=seasonal" count={seasonalPicks.length} />
        <MediaRail>
          {seasonalPicks.map((anime: any, index: number) => (
            <PosterAnimeCard
              key={`seasonal-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime))}
            />
          ))}
        </MediaRail>
      </section>

      {upcoming.length ? (
        <section className="mt-7 desktop-section-enter">
          <RailHeader title="Upcoming Anime" subtitle="Not aired yet; watch links stay disabled until release" to="/search?mode=upcoming" count={upcoming.length} />
          <MediaRail>
            {upcoming.map((anime: any, index: number) => (
              <PosterAnimeCard key={`upcoming-${anime.mal_id || anime.id || index}`} anime={anime} to={desktopUpcomingPath(anime)} episode="TBA" />
            ))}
          </MediaRail>
        </section>
      ) : null}

      <section className="mt-7 desktop-section-enter">
        <RailHeader title="Popular Picks" subtitle="Reliable discovery staples" to="/search?mode=popular" count={popular.length} />
        <MediaRail>
          {popular.map((anime: any, index: number) => (
            <PosterAnimeCard
              key={`popular-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime))}
            />
          ))}
          {!popular.length ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[278px] w-[190px] shrink-0 rounded-2xl border border-white/8 bg-white/[0.045] 2xl:h-[304px] 2xl:w-[210px]" />) : null}
        </MediaRail>
      </section>

      <section className="mt-7 desktop-section-enter">
        <RailHeader title={`Top Anime From ${topYear}`} subtitle="High score titles from the selected year" to={`/search?mode=year&year=${topYear}&order=score`} count={yearlyTop.length} />
        <MediaRail>
          {yearlyTop.map((anime: any, index: number) => (
            <PosterAnimeCard
              key={`yearly-${anime.mal_id || anime.id || index}`}
              anime={anime}
              to={watchPathFor(anime, history, audioPreference, preferredEpisodeFor(anime))}
            />
          ))}
        </MediaRail>
      </section>
    </div>
  );
}
