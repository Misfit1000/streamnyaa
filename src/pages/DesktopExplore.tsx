import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Filter, Heart, Search, SlidersHorizontal, Sparkles, Star, TrendingUp, Tv, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../components/Seo';
import {
  fetchAnimeSeason,
  fetchPopularAnime,
  fetchRecentEpisodesWithLimit,
  fetchTopAiring,
  fetchTopAnimeByYear,
  fetchUpcomingAnime,
  searchAnime,
} from '../api/jikan';
import { getCurrentAnimeSeason } from '../lib/currentSeason';
import { saveDesktopAudioPreference, type DesktopAudioPreference } from '../lib/desktop';
import { desktopWatchOrBrowsePath } from '../lib/desktopAnimeRoute';

type ExploreMode = 'new' | 'trending' | 'popular' | 'top' | 'airing' | 'seasonal' | 'upcoming' | 'year';
type VisualFilterKey = 'genre' | 'season' | 'status' | 'format' | 'source' | 'yearRange' | 'audio' | 'rating' | 'episodes' | 'popularity';
type LocalSortKey = 'best' | 'title' | 'score' | 'popularity' | 'newest' | 'episodes';
type ExploreDensity = 'poster' | 'compact' | 'list';
type SelectOption = { label: string; value: string };

const defaultVisualFilters: Record<VisualFilterKey, string> = {
  genre: 'Any',
  season: 'Any',
  status: 'Any',
  format: 'Any',
  source: 'Any',
  yearRange: 'Any',
  audio: 'Any',
  rating: 'Any',
  episodes: 'Any',
  popularity: 'Any',
};

const visualFilterGroups: Array<{ key: VisualFilterKey; label: string; options: string[] }> = [
  { key: 'genre', label: 'Genre', options: ['Any', 'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'] },
  { key: 'season', label: 'Season', options: ['Any', 'Winter', 'Spring', 'Summer', 'Fall'] },
  { key: 'status', label: 'Status', options: ['Any', 'Airing', 'Completed', 'Upcoming'] },
  { key: 'format', label: 'Format', options: ['Any', 'TV', 'TV Short', 'Movie', 'OVA', 'ONA', 'Special', 'Music'] },
  { key: 'source', label: 'Source', options: ['Any', 'Manga', 'Light Novel', 'Original', 'Web Manga', 'Novel', 'Visual Novel', 'Game', 'Other'] },
  { key: 'yearRange', label: 'Year', options: ['Any', 'This Year', 'Last 3 Years', 'Last 5 Years', '2020s', '2010s', 'Before 2010'] },
  { key: 'audio', label: 'Audio', options: ['Any', 'Sub', 'Dual Audio', 'Dub'] },
  { key: 'rating', label: 'Rating', options: ['Any', '8+', '8.5+', '9+'] },
  { key: 'episodes', label: 'Episodes', options: ['Any', 'Short', '12-24', '25+', 'Long-running'] },
  { key: 'popularity', label: 'Popularity', options: ['Any', 'Mainstream', 'Popular', 'Hidden Gems'] },
];

const sortModes: Array<{ label: string; mode: ExploreMode }> = [
  { label: 'New Episodes', mode: 'new' },
  { label: 'Trending', mode: 'trending' },
  { label: 'Popular', mode: 'popular' },
  { label: 'Top Rated', mode: 'top' },
  { label: 'Airing', mode: 'airing' },
  { label: 'Seasonal', mode: 'seasonal' },
  { label: 'Upcoming', mode: 'upcoming' },
  { label: 'Top This Year', mode: 'year' },
];

const modeIcons: Record<ExploreMode, typeof Sparkles> = {
  new: CalendarDays,
  trending: Sparkles,
  popular: Star,
  top: TrendingUp,
  airing: Tv,
  seasonal: CalendarDays,
  upcoming: CalendarDays,
  year: CalendarDays,
};

const localSortModes: Array<{ label: string; value: LocalSortKey }> = [
  { label: 'Best Match', value: 'best' },
  { label: 'Title A-Z', value: 'title' },
  { label: 'Highest Score', value: 'score' },
  { label: 'Most Popular', value: 'popularity' },
  { label: 'Newest', value: 'newest' },
  { label: 'Episode Count', value: 'episodes' },
];

const SEASONAL_SPOTLIGHT_CACHE_PREFIX = 'streamnyaa.desktop.seasonSpotlight.v1.';
const SEASONAL_SPOTLIGHT_CACHE_TTL = 1000 * 60 * 60 * 24;
const SEASONAL_SPOTLIGHT_MAX_PAGES = 5;
const SPOTLIGHT_ROTATION_MS = 8000;
const EXPLORE_SEARCH_PAGE_LIMIT = 3;
const EXPLORE_INITIAL_RESULTS = 24;
const EXPLORE_RESULTS_INCREMENT = 24;
const EXPLORE_ROW_INITIAL_ITEMS = 12;
const EXPLORE_ROW_INCREMENT = 12;

const quickFormatFilters: Array<{ label: string; value: string; icon: typeof Tv }> = [
  { label: 'TV Series', value: 'TV', icon: Tv },
  { label: 'Movies', value: 'Movie', icon: Clapperboard },
];

const filterPresets: Array<{
  label: string;
  description: string;
  mode?: ExploreMode;
  sort?: LocalSortKey;
  filters: Partial<Record<VisualFilterKey, string>>;
  icon: typeof Sparkles;
}> = [
  {
    label: 'Best new anime',
    description: 'Airing, recent, and strongly rated.',
    mode: 'airing',
    sort: 'score',
    filters: { status: 'Airing', yearRange: 'This Year', rating: '8+' },
    icon: Sparkles,
  },
  {
    label: 'High rated',
    description: 'Strong scores first.',
    mode: 'top',
    sort: 'score',
    filters: { rating: '8.5+' },
    icon: Star,
  },
  {
    label: 'Short series',
    description: 'Fast watches and compact seasons.',
    sort: 'best',
    filters: { episodes: 'Short' },
    icon: Tv,
  },
  {
    label: 'Movies',
    description: 'Feature-length anime only.',
    sort: 'score',
    filters: { format: 'Movie' },
    icon: Clapperboard,
  },
  {
    label: 'Hidden gems',
    description: 'Lower popularity, good scores.',
    sort: 'score',
    filters: { popularity: 'Hidden Gems', rating: '8+' },
    icon: Sparkles,
  },
];

const filterSections: Array<{ title: string; description: string; keys: VisualFilterKey[] }> = [
  {
    title: 'Core',
    description: 'The filters users adjust most often.',
    keys: ['genre', 'format', 'status', 'yearRange'],
  },
  {
    title: 'Discovery',
    description: 'Narrow by source, length, season, and taste.',
    keys: ['source', 'rating', 'episodes', 'popularity', 'season', 'audio'],
  },
];

const modeConfig: Record<ExploreMode, { label: string; sort: string; status: string; description: string }> = {
  new: {
    label: 'New Episodes',
    sort: '',
    status: 'airing',
    description: 'Freshly aired episode entries from current schedules.',
  },
  trending: {
    label: 'Trending',
    sort: '',
    status: '',
    description: 'Current titles getting the most activity.',
  },
  popular: {
    label: 'Popular',
    sort: 'popular',
    status: '',
    description: 'High-traffic anime across the catalog.',
  },
  top: {
    label: 'Top Rated',
    sort: 'score',
    status: '',
    description: 'Score-led discovery for strong picks.',
  },
  airing: {
    label: 'Airing',
    sort: 'score',
    status: 'airing',
    description: 'Currently airing anime ranked by score.',
  },
  seasonal: {
    label: 'Seasonal',
    sort: '',
    status: 'airing',
    description: 'Current-season anime picks from the active anime cour.',
  },
  upcoming: {
    label: 'Upcoming',
    sort: 'upcoming',
    status: '',
    description: 'Announced titles that have not aired yet.',
  },
  year: {
    label: 'Top This Year',
    sort: 'score',
    status: '',
    description: 'Top anime from the selected year.',
  },
};

function fallbackCover(id: number) {
  return `https://img.anili.st/media/${id}`;
}

function fallbackAnime(id: number, malId: number | undefined, title: string, score: number, episodes: number | null, year: number, genres: string[]) {
  const cover = fallbackCover(id);
  return {
    id,
    mal_id: malId || id,
    title,
    title_english: title,
    score,
    episodes,
    year,
    type: 'TV',
    genres: genres.map((name) => ({ name })),
    synopsis: 'Open this title in the desktop watch flow to browse aired episodes and source links.',
    banner_image: cover,
    images: { jpg: { image_url: cover, large_image_url: cover }, webp: { image_url: cover, large_image_url: cover } },
  };
}

function readSeasonalSpotlightCache(season: string, year: number) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${SEASONAL_SPOTLIGHT_CACHE_PREFIX}${season}-${year}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.cachedAt || Date.now() - Number(parsed.cachedAt) > SEASONAL_SPOTLIGHT_CACHE_TTL) return null;
    if (!Array.isArray(parsed.data)) return null;
    return { data: parsed.data };
  } catch {
    return null;
  }
}

function writeSeasonalSpotlightCache(season: string, year: number, data: any[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${SEASONAL_SPOTLIGHT_CACHE_PREFIX}${season}-${year}`, JSON.stringify({ cachedAt: Date.now(), data }));
  } catch {
    // Local cache is only a speed layer.
  }
}

async function fetchSeasonalSpotlightCatalog(season: string, year: number) {
  const cached = readSeasonalSpotlightCache(season, year);
  if (cached?.data?.length) {
    console.info(`[StreamNyaa] seasonal spotlight cache hit: ${season} ${year}, ${cached.data.length} titles`);
    return cached;
  }

  console.info(`[StreamNyaa] seasonal spotlight fetch start: ${season} ${year}`);
  const pages: any[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext && page <= SEASONAL_SPOTLIGHT_MAX_PAGES) {
    const response = await fetchAnimeSeason(season, year, page);
    pages.push(...(response?.data || []));
    hasNext = Boolean(response?.pagination?.has_next_page);
    page += 1;
  }

  const data = uniqueAnime(pages);
  writeSeasonalSpotlightCache(season, year, data);
  console.info(`[StreamNyaa] seasonal spotlight fetch complete: ${season} ${year}, ${data.length} titles loaded`);
  return { data };
}

async function fetchExploreSearchPages(
  query: string,
  type: string,
  genres: string,
  sort: string,
  status: string,
  maxPages = EXPLORE_SEARCH_PAGE_LIMIT,
) {
  const pages: any[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext && page <= maxPages) {
    const response = await searchAnime(query, page, type, '', genres, sort, status);
    pages.push(...(response?.data || []));
    hasNext = Boolean(response?.pagination?.has_next_page);
    page += 1;
  }

  return { data: uniqueAnime(pages) };
}

const fallbackByMode: Record<ExploreMode, any[]> = {
  new: [
    fallbackAnime(147105, 51553, 'Witch Hat Atelier', 8.6, 13, 2026, ['Adventure', 'Fantasy']),
    fallbackAnime(189046, 61316, 'Re:ZERO Season 4', 8.7, 19, 2026, ['Drama', 'Fantasy']),
    fallbackAnime(182300, 59983, 'Wistoria: Wand and Sword Season 2', 8.1, 12, 2026, ['Action', 'Fantasy']),
    fallbackAnime(174576, undefined, 'SAKAMOTO DAYS', 7.8, 11, 2025, ['Action', 'Comedy']),
    fallbackAnime(153288, 52588, 'Kaiju No. 8', 8.1, 12, 2024, ['Action', 'Sci-Fi']),
    fallbackAnime(171018, 57334, 'DAN DA DAN', 8.5, 12, 2024, ['Action', 'Comedy']),
  ],
  trending: [
    fallbackAnime(151807, 52299, 'Solo Leveling', 8.3, 12, 2024, ['Action', 'Fantasy']),
    fallbackAnime(171018, 57334, 'DAN DA DAN', 8.5, 12, 2024, ['Action', 'Comedy']),
    fallbackAnime(153288, 52588, 'Kaiju No. 8', 8.1, 12, 2024, ['Action', 'Sci-Fi']),
    fallbackAnime(127230, 44511, 'Chainsaw Man', 8.5, 12, 2022, ['Action', 'Supernatural']),
    fallbackAnime(140960, 50265, 'SPY x FAMILY', 8.5, 12, 2022, ['Action', 'Comedy']),
    fallbackAnime(153518, 52701, 'Delicious in Dungeon', 8.6, 24, 2024, ['Adventure', 'Fantasy']),
    fallbackAnime(161645, 54492, 'The Apothecary Diaries', 8.8, 24, 2023, ['Drama', 'Mystery']),
    fallbackAnime(130003, 47917, 'Bocchi the Rock!', 8.8, 12, 2022, ['Comedy', 'Music']),
    fallbackAnime(145064, 51009, 'Jujutsu Kaisen Season 2', 8.8, 23, 2023, ['Action', 'Supernatural']),
    fallbackAnime(154587, 52991, 'Frieren: Beyond Journey’s End', 9.3, 28, 2023, ['Adventure', 'Drama']),
  ],
  popular: [
    fallbackAnime(21, 21, 'ONE PIECE', 8.7, 1161, 1999, ['Action', 'Adventure']),
    fallbackAnime(16498, 16498, 'Attack on Titan', 8.6, 25, 2013, ['Action', 'Drama']),
    fallbackAnime(21459, 31964, 'My Hero Academia', 7.8, 13, 2016, ['Action']),
    fallbackAnime(11061, 11061, 'Hunter x Hunter', 9.0, 148, 2011, ['Action', 'Adventure']),
    fallbackAnime(1735, 1735, 'Naruto: Shippuden', 8.3, 500, 2007, ['Action', 'Adventure']),
    fallbackAnime(5114, 5114, 'Fullmetal Alchemist: Brotherhood', 9.1, 64, 2009, ['Action', 'Drama']),
    fallbackAnime(30276, 30276, 'One Punch Man', 8.5, 12, 2015, ['Action', 'Comedy']),
    fallbackAnime(11757, 11757, 'Sword Art Online', 7.2, 25, 2012, ['Action', 'Fantasy']),
    fallbackAnime(31933, 31933, 'JoJo’s Bizarre Adventure: Diamond is Unbreakable', 8.5, 39, 2016, ['Action', 'Adventure']),
    fallbackAnime(9253, 9253, 'Steins;Gate', 9.1, 24, 2011, ['Drama', 'Sci-Fi']),
  ],
  top: [
    fallbackAnime(5114, 5114, 'Fullmetal Alchemist: Brotherhood', 9.1, 64, 2009, ['Action', 'Drama']),
    fallbackAnime(154587, 52991, 'Frieren: Beyond Journey’s End', 9.3, 28, 2023, ['Adventure', 'Drama']),
    fallbackAnime(11061, 11061, 'Hunter x Hunter', 9.0, 148, 2011, ['Action', 'Adventure']),
    fallbackAnime(9253, 9253, 'Steins;Gate', 9.1, 24, 2011, ['Drama', 'Sci-Fi']),
    fallbackAnime(17074, 17074, 'Monogatari Series: Second Season', 8.8, 26, 2013, ['Mystery', 'Supernatural']),
    fallbackAnime(35180, 35180, '3-gatsu no Lion 2nd Season', 9.0, 22, 2017, ['Drama']),
    fallbackAnime(28977, 28977, 'Gintama Season 4', 9.0, 51, 2015, ['Action', 'Comedy']),
    fallbackAnime(9969, 9969, 'Gintama Season 2', 9.0, 51, 2011, ['Action', 'Comedy']),
    fallbackAnime(37987, 37987, 'Violet Evergarden Movie', 8.9, 1, 2020, ['Drama']),
    fallbackAnime(40028, 40028, 'Attack on Titan Final Season', 8.8, 16, 2020, ['Action', 'Drama']),
  ],
  airing: [
    fallbackAnime(154587, 52991, 'Frieren: Beyond Journey’s End', 9.3, 28, 2023, ['Adventure', 'Drama']),
    fallbackAnime(161645, 54492, 'The Apothecary Diaries', 8.8, 24, 2023, ['Drama', 'Mystery']),
    fallbackAnime(153518, 52701, 'Delicious in Dungeon', 8.6, 24, 2024, ['Adventure', 'Fantasy']),
    fallbackAnime(171018, 57334, 'DAN DA DAN', 8.5, 12, 2024, ['Action', 'Comedy']),
    fallbackAnime(153288, 52588, 'Kaiju No. 8', 8.1, 12, 2024, ['Action', 'Sci-Fi']),
    fallbackAnime(130003, 47917, 'Bocchi the Rock!', 8.8, 12, 2022, ['Comedy', 'Music']),
    fallbackAnime(147105, 51553, 'Witch Hat Atelier', 8.6, 13, 2026, ['Adventure', 'Fantasy']),
    fallbackAnime(189046, 61316, 'Re:ZERO Season 4', 8.7, 19, 2026, ['Drama', 'Fantasy']),
    fallbackAnime(182300, 59983, 'Wistoria: Wand and Sword Season 2', 8.1, 12, 2026, ['Action', 'Fantasy']),
    fallbackAnime(174576, undefined, 'SAKAMOTO DAYS', 7.8, 11, 2025, ['Action', 'Comedy']),
  ],
  seasonal: [
    fallbackAnime(147105, 51553, 'Witch Hat Atelier', 8.6, 13, 2026, ['Adventure', 'Fantasy']),
    fallbackAnime(189046, 61316, 'Re:ZERO Season 4', 8.7, 19, 2026, ['Drama', 'Fantasy']),
    fallbackAnime(182300, 59983, 'Wistoria: Wand and Sword Season 2', 8.1, 12, 2026, ['Action', 'Fantasy']),
    fallbackAnime(171018, 57334, 'DAN DA DAN', 8.5, 12, 2024, ['Action', 'Comedy']),
    fallbackAnime(153288, 52588, 'Kaiju No. 8', 8.1, 12, 2024, ['Action', 'Sci-Fi']),
    fallbackAnime(153518, 52701, 'Delicious in Dungeon', 8.6, 24, 2024, ['Adventure', 'Fantasy']),
  ],
  upcoming: [
    fallbackAnime(180516, undefined, 'Chainsaw Man - The Movie: Reze Arc', 0, null, 2025, ['Action', 'Supernatural']),
    fallbackAnime(185213, undefined, 'Jujutsu Kaisen: Culling Game', 0, null, 2026, ['Action', 'Supernatural']),
    fallbackAnime(170942, undefined, 'One-Punch Man Season 3', 0, null, 2025, ['Action', 'Comedy']),
    fallbackAnime(169441, undefined, 'Fire Force Season 3', 0, null, 2025, ['Action', 'Supernatural']),
    fallbackAnime(166518, undefined, 'WIND BREAKER Season 2', 0, null, 2025, ['Action']),
    fallbackAnime(177709, 58939, 'Tougen Anki', 0, null, 2025, ['Action', 'Supernatural']),
    fallbackAnime(185660, undefined, 'Gachiakuta', 0, null, 2025, ['Action', 'Fantasy']),
    fallbackAnime(190669, undefined, 'The Fragrant Flower Blooms With Dignity', 0, null, 2025, ['Drama', 'Romance']),
    fallbackAnime(172019, undefined, 'Blue Lock Season 2', 0, null, 2024, ['Sports']),
    fallbackAnime(169295, undefined, 'Oshi no Ko Season 2', 0, null, 2024, ['Drama', 'Mystery']),
  ],
  year: [
    fallbackAnime(151807, 52299, 'Solo Leveling', 8.3, 12, 2024, ['Action', 'Fantasy']),
    fallbackAnime(171018, 57334, 'DAN DA DAN', 8.5, 12, 2024, ['Action', 'Comedy']),
    fallbackAnime(153518, 52701, 'Delicious in Dungeon', 8.6, 24, 2024, ['Adventure', 'Fantasy']),
    fallbackAnime(153288, 52588, 'Kaiju No. 8', 8.1, 12, 2024, ['Action', 'Sci-Fi']),
    fallbackAnime(166531, undefined, 'WIND BREAKER', 7.8, 13, 2024, ['Action']),
    fallbackAnime(169440, undefined, 'Girls Band Cry', 8.4, 13, 2024, ['Drama', 'Music']),
    fallbackAnime(166216, undefined, 'A Sign of Affection', 8.1, 12, 2024, ['Romance']),
    fallbackAnime(163139, undefined, '7th Time Loop', 7.5, 12, 2024, ['Fantasy', 'Romance']),
    fallbackAnime(166610, undefined, 'Ninja Kamui', 7.0, 13, 2024, ['Action']),
    fallbackAnime(166828, undefined, 'The Wrong Way to Use Healing Magic', 7.4, 13, 2024, ['Action', 'Fantasy']),
  ],
};

function uniqueAnime(items: any[]) {
  const seen = new Set<string>();
  return items.filter((anime) => {
    const key = String(anime?.mal_id || anime?.id || anime?.title || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizedValue(value: unknown) {
  return String(value || '').toLowerCase().trim();
}

function searchableValue(value: unknown) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function displayLabel(value: unknown) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function titleCandidatesFor(anime: any) {
  return [
    anime?.title,
    anime?.title_english,
    anime?.title_romaji,
    anime?.title_native,
    ...(Array.isArray(anime?.synonyms) ? anime.synonyms : []),
  ]
    .map((value) => String(value || '').trim())
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
}

function searchRankFor(anime: any, query: string) {
  const normalizedQuery = searchableValue(query);
  if (!normalizedQuery) return 0;
  const queryTokens = normalizedQuery.split(' ').filter((token) => token.length > 1);
  const titles = titleCandidatesFor(anime).map(searchableValue).filter(Boolean);

  let best = 999;
  for (const title of titles) {
    if (title === normalizedQuery) best = Math.min(best, 0);
    else if (title.startsWith(normalizedQuery)) best = Math.min(best, 1);
    else if (title.includes(normalizedQuery)) best = Math.min(best, 2);
    else if (queryTokens.length) {
      const hits = queryTokens.filter((token) => title.includes(token)).length;
      if (hits) best = Math.min(best, 3 + (queryTokens.length - hits));
    }
  }

  return best;
}

function scoreFor(anime: any) {
  const score = Number(anime?.score || anime?.meanScore || anime?.averageScore || 0);
  return Number.isFinite(score) ? score : 0;
}

function episodeCountFor(anime: any) {
  const episodes = Number(anime?.episodes || anime?.episodeCount || 0);
  return Number.isFinite(episodes) ? episodes : 0;
}

function popularityFor(anime: any) {
  const popularity = Number(anime?.popularity || anime?.members || anime?.scored_by || 0);
  return Number.isFinite(popularity) ? popularity : 0;
}

function genreNamesFor(anime: any) {
  return (Array.isArray(anime?.genres) ? anime.genres : [])
    .map((item: any) => String(item?.name || item || '').trim())
    .filter(Boolean);
}

function yearFor(anime: any) {
  const year = Number(anime?.year || anime?.seasonYear || anime?.aired?.prop?.from?.year || 0);
  return Number.isFinite(year) ? year : 0;
}

function formatFor(anime: any) {
  return normalizedValue(anime?.type || anime?.format).replace(/_/g, ' ');
}

function formatLabelFor(anime: any) {
  return displayLabel(anime?.type || anime?.format || 'Anime');
}

function statusLabelFor(anime: any) {
  const status = normalizedValue(anime?.status).replace(/_/g, ' ');
  if (/releasing|airing|currently/.test(status)) return 'Airing';
  if (/not yet|upcoming/.test(status)) return 'Upcoming';
  if (/finished|complete/.test(status)) return 'Completed';
  return displayLabel(anime?.status || '');
}

function sourceFor(anime: any) {
  return normalizedValue(anime?.source).replace(/_/g, ' ');
}

function statusMatches(statusValue: string, target: string) {
  const status = normalizedValue(statusValue).replace(/_/g, ' ');
  if (!status) return false;
  if (target === 'airing') return /airing|releasing|currently/.test(status);
  if (target === 'completed') return /complete|finished/.test(status);
  if (target === 'upcoming') return /upcoming|not yet|future/.test(status);
  return true;
}

function yearRangeMatches(year: number, value: string, currentYear: number) {
  if (value === 'Any') return true;
  if (!year) return false;
  if (value === 'This Year') return year === currentYear;
  if (value === 'Last 3 Years') return year >= currentYear - 2;
  if (value === 'Last 5 Years') return year >= currentYear - 4;
  if (value === '2020s') return year >= 2020 && year <= 2029;
  if (value === '2010s') return year >= 2010 && year <= 2019;
  if (value === 'Before 2010') return year < 2010;
  return true;
}

function matchesVisualFilters(anime: any, filters: Record<VisualFilterKey, string>, currentYear: number) {
  if (filters.genre !== 'Any') {
    const genre = normalizedValue(filters.genre);
    const genres = Array.isArray(anime?.genres) ? anime.genres : [];
    const names = genres.map((item: any) => normalizedValue(item?.name || item)).filter(Boolean);
    if (!names.includes(genre)) return false;
  }

  if (filters.season !== 'Any') {
    const season = normalizedValue(anime?.season);
    if (!season || season !== normalizedValue(filters.season)) return false;
  }

  if (filters.status !== 'Any') {
    const target = normalizedValue(filters.status);
    if (!statusMatches(anime?.status, target)) return false;
  }

  if (filters.format !== 'Any') {
    const format = formatFor(anime);
    if (!format || format !== normalizedValue(filters.format)) return false;
  }

  if (filters.source !== 'Any') {
    const source = sourceFor(anime);
    if (!source || source !== normalizedValue(filters.source)) return false;
  }

  if (filters.yearRange !== 'Any' && !yearRangeMatches(yearFor(anime), filters.yearRange, currentYear)) {
    return false;
  }

  if (filters.rating !== 'Any') {
    const score = scoreFor(anime);
    const threshold = filters.rating === '9+' ? 9 : filters.rating === '8.5+' ? 8.5 : 8;
    if (!score || score < threshold) return false;
  }

  if (filters.episodes !== 'Any') {
    const episodes = episodeCountFor(anime);
    if (!episodes) return false;
    if (filters.episodes === 'Short' && episodes > 12) return false;
    if (filters.episodes === '12-24' && (episodes < 12 || episodes > 24)) return false;
    if (filters.episodes === '25+' && episodes < 25) return false;
    if (filters.episodes === 'Long-running' && episodes < 100) return false;
  }

  if (filters.popularity !== 'Any') {
    const popularity = popularityFor(anime);
    const score = scoreFor(anime);
    if (filters.popularity === 'Mainstream' && popularity < 100000) return false;
    if (filters.popularity === 'Popular' && popularity < 30000) return false;
    if (filters.popularity === 'Hidden Gems' && (!popularity || popularity > 50000 || score < 7)) return false;
  }

  return true;
}

function sortAnimeList(items: any[], sort: LocalSortKey, query: string) {
  const normalizedQuery = query.trim();
  return [...items].sort((left, right) => {
    if (normalizedQuery) {
      const leftRank = searchRankFor(left, normalizedQuery);
      const rightRank = searchRankFor(right, normalizedQuery);
      if (leftRank !== rightRank) return leftRank - rightRank;
    }
    if (sort === 'title') return String(left.title || '').localeCompare(String(right.title || ''));
    if (sort === 'score') return scoreFor(right) - scoreFor(left);
    if (sort === 'popularity') return popularityFor(right) - popularityFor(left);
    if (sort === 'newest') return yearFor(right) - yearFor(left);
    if (sort === 'episodes') return episodeCountFor(right) - episodeCountFor(left);
    return (scoreFor(right) * 100 + popularityFor(right) / 10000) - (scoreFor(left) * 100 + popularityFor(left) / 10000);
  });
}

function filterAnimeList(items: any[], filters: Record<VisualFilterKey, string>, currentYear: number, sort: LocalSortKey, query = '') {
  const metadataFiltersActive = Object.entries(filters).some(([key, value]) => key !== 'audio' && value !== 'Any');
  const filtered = metadataFiltersActive ? items.filter((anime) => matchesVisualFilters(anime, filters, currentYear)) : items;
  return sortAnimeList(filtered, sort, query);
}

function audioPreferenceFromFilter(value: string): DesktopAudioPreference | null {
  if (value === 'Sub') return 'sub-preferred';
  if (value === 'Dual Audio') return 'dual-preferred';
  if (value === 'Dub') return 'dub-only';
  return null;
}

function markExploreKeys(used: Set<string>, items: any[]) {
  items.forEach((anime) => {
    const key = String(anime?.mal_id || anime?.id || anime?.title || '').trim();
    if (key) used.add(key);
  });
}

function buildExploreRow(liveItems: any[], fallbackItems: any[], count: number, used: Set<string>) {
  const result = uniqueAnime(liveItems)
    .filter((anime) => {
      const key = String(anime?.mal_id || anime?.id || anime?.title || '').trim();
      return key && !used.has(key);
    })
    .slice(0, count);

  const localUsed = new Set(used);
  markExploreKeys(localUsed, result);

  if (result.length < count) {
    result.push(...fallbackItems
      .filter((anime) => {
        const key = String(anime?.mal_id || anime?.id || anime?.title || '').trim();
        return key && !localUsed.has(key);
      })
      .slice(0, count - result.length));
  }

  markExploreKeys(used, result);
  return result;
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="sn-poster-card aspect-[2/3] animate-pulse bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))]" />
      ))}
    </div>
  );
}

function EmptyState({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="sn-empty-state px-6 py-14 text-center">
      <p className="text-lg font-black text-white">No anime found</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">{text}</p>
      {children ? <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

function PremiumSelect({
  value,
  options,
  onChange,
  ariaLabel,
  minWidth = 'min-w-[168px]',
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  minWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${minWidth}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="sn-secondary-action sn-action-between h-10 w-full rounded-xl px-3 text-left text-sm"
      >
        <span className="truncate">{selected?.label || value}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/50 transition ${open ? 'rotate-180 text-primary' : ''}`} />
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+8px)] z-50 max-h-72 w-full overflow-auto rounded-xl bg-[#111116]/98 p-1 shadow-2xl shadow-black/45 ring-1 ring-primary/18 backdrop-blur-xl"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex min-h-9 w-full items-center rounded-lg px-3 text-left text-sm font-black transition ${
                  active
                    ? 'bg-primary text-white shadow-[0_8px_22px_rgba(244,63,94,0.22)]'
                    : 'text-white/70 hover:bg-white/[0.075] hover:text-white'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function uniqueExploreImages(values: any[]) {
  return values
    .map((value) => String(value || '').trim())
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

function coverCandidatesFor(anime: any) {
  const fallbackId = Number(anime?.anilist_id || anime?.id || 0);
  const fallbackCover = fallbackId > 0 ? `https://img.anili.st/media/${fallbackId}` : '';
  const posterCandidates = uniqueExploreImages([
    anime?.coverImage?.extraLarge,
    anime?.coverImage?.large,
    anime?.coverImage?.medium,
    anime?.cover_image,
    anime?.cover,
    anime?.poster,
    anime?.posterImage,
    anime?.poster_image,
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.webp?.image_url,
    anime?.images?.jpg?.image_url,
    anime?.thumbnail,
    anime?.image_url,
    anime?.image,
  ]).filter((value) => !/\/banner\//i.test(value));

  const bannerFallbacks = uniqueExploreImages([
    anime?.banner_image,
    anime?.bannerImage,
    anime?.backdrop,
    anime?.background,
  ]);

  return uniqueExploreImages([
    ...posterCandidates,
    fallbackCover,
    ...bannerFallbacks,
  ]);
}

function spotlightArtworkCandidatesFor(anime: any) {
  const fallbackId = Number(anime?.anilist_id || anime?.id || 0);
  const fallbackCover = fallbackId > 0 ? `https://img.anili.st/media/${fallbackId}` : '';
  return [
    anime?.banner_image,
    anime?.bannerImage,
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.webp?.image_url,
    anime?.images?.jpg?.image_url,
    fallbackCover,
  ]
    .map((value) => String(value || '').trim())
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

function spotlightQualityScore(anime: any) {
  const hasBanner = Boolean(anime?.banner_image || anime?.bannerImage);
  const status = normalizedValue(anime?.status);
  const airingBoost = /releasing|airing/.test(status) ? 40 : 0;
  const upcomingBoost = /not yet|upcoming/.test(status) ? 16 : 0;
  return (hasBanner ? 120 : 0) + airingBoost + upcomingBoost + scoreFor(anime) * 8 + popularityFor(anime) / 20000;
}

function buildSpotlightItems(items: any[]) {
  const withImages = uniqueAnime(items).filter((anime) => spotlightArtworkCandidatesFor(anime).length);
  const candidates = withImages.length >= 8 ? withImages : uniqueAnime([...withImages, ...fallbackByMode.airing, ...fallbackByMode.trending]);
  return [...candidates]
    .sort((left, right) => spotlightQualityScore(right) - spotlightQualityScore(left))
    .slice(0, 24);
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const listener = () => setReduced(media.matches);
    media.addEventListener?.('change', listener);
    return () => media.removeEventListener?.('change', listener);
  }, []);

  return reduced;
}

function SpotlightArtwork({ anime, title }: { anime: any | null; title: string }) {
  const candidates = useMemo(() => anime ? spotlightArtworkCandidatesFor(anime) : [], [anime]);
  const animeKey = String(anime?.mal_id || anime?.id || anime?.title || '');
  const [imageIndex, setImageIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const currentImage = candidates[imageIndex] || '';

  useEffect(() => {
    setImageIndex(0);
    setImageFailed(false);
  }, [animeKey]);

  if (!anime || !currentImage || imageFailed) {
    return (
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_10%,rgba(244,63,94,0.30),transparent_34%),radial-gradient(circle_at_18%_12%,rgba(99,102,241,0.13),transparent_34%),linear-gradient(135deg,#180711,#050507_68%,#07090d)]" />
    );
  }

  return (
    <>
      <img
        key={currentImage}
        src={currentImage}
        alt={title}
        className="absolute inset-0 h-full w-full object-cover object-center opacity-95 transition duration-700"
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          if (imageIndex < candidates.length - 1) {
            setImageIndex((value) => value + 1);
          } else {
            setImageFailed(true);
          }
        }}
      />
      {!anime?.banner_image && !anime?.bannerImage ? (
        <img
          src={currentImage}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover object-center opacity-55 blur-2xl"
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

function ExploreAnimeCard({ anime, index, density = 'poster' }: { anime: any; index: number; density?: ExploreDensity }) {
  const candidates = useMemo(() => coverCandidatesFor(anime), [anime]);
  const [imageIndex, setImageIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const currentImage = candidates[imageIndex] || '';
  const title = anime?.title || anime?.title_english || anime?.title_romaji || 'Anime';
  const description = anime?.synopsis || anime?.description || '';
  const genres = genreNamesFor(anime).slice(0, 2);
  const year = yearFor(anime);
  const score = scoreFor(anime);
  const status = statusLabelFor(anime);
  const format = formatLabelFor(anime);
  const episodes = episodeCountFor(anime);
  const path = desktopWatchOrBrowsePath(anime);
  const compact = density === 'compact';

  useEffect(() => {
    setImageIndex(0);
    setImageFailed(false);
  }, [String(anime?.mal_id || anime?.id || title), candidates.join('|'), title]);

  if (density === 'list') {
    return (
      <Link
        to={path}
        aria-label={`Open ${title}`}
        className="sn-card-hover group grid min-h-[132px] grid-cols-[86px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl p-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        <div className="sn-poster-card relative h-[112px]">
          {currentImage && !imageFailed ? (
            <img
              key={currentImage}
              src={currentImage}
              alt={title}
              className="h-full w-full object-cover object-center transition duration-500 group-hover:scale-[1.04]"
              loading={index < 8 ? 'eager' : 'lazy'}
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => {
                setImageIndex((value) => {
                  if (value < candidates.length - 1) return value + 1;
                  setImageFailed(true);
                  return value;
                });
              }}
            />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_24%_18%,rgba(244,63,94,0.38),transparent_32%),linear-gradient(145deg,#1f1119,#07070a)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/52 to-transparent" />
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-white/[0.075] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/70">{format}</span>
            {status ? <span className="rounded-full bg-primary/13 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary">{status}</span> : null}
            <span className="rounded-full bg-white/[0.055] px-2 py-1 text-[10px] font-bold text-white/50">{year || 'TBA'}</span>
          </div>
          <h3 className="line-clamp-1 text-[17px] font-black tracking-[-0.01em] text-white">{title}</h3>
          <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-6 text-white/54">{description || genres.join(' / ') || 'Anime'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold text-white/58">
            <span className="inline-flex items-center gap-1 text-yellow-300">
              <Star className="h-3.5 w-3.5 fill-current" />
              {score ? score.toFixed(1) : 'N/A'}
            </span>
            <span>{episodes ? `${episodes} episodes` : 'Episodes TBA'}</span>
            <span>{genres.length ? genres.join(' / ') : 'Anime'}</span>
          </div>
        </div>
        <span className="hidden rounded-full bg-primary px-4 py-2 text-sm font-black text-white shadow-lg shadow-primary/20 transition group-hover:bg-[#ff365c] md:inline-flex">
          Open
        </span>
      </Link>
    );
  }

  return (
    <Link
      to={path}
      aria-label={`Open ${title}`}
      className="sn-card-hover group relative block min-w-0 rounded-[18px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <div className={`sn-poster-card relative ${compact ? 'aspect-[5/7]' : 'aspect-[2/3]'} transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_18px_45px_rgba(244,63,94,0.13)] group-hover:ring-primary/25`}>
        {currentImage && !imageFailed ? (
          <img
            key={currentImage}
            src={currentImage}
            alt={title}
            className="h-full w-full object-cover object-center transition duration-500 group-hover:scale-[1.045]"
            loading={index < 8 ? 'eager' : 'lazy'}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              setImageIndex((value) => {
                if (value < candidates.length - 1) return value + 1;
                setImageFailed(true);
                return value;
              });
            }}
          />
        ) : (
          <div className="flex h-full w-full flex-col justify-end bg-[radial-gradient(circle_at_22%_14%,rgba(244,63,94,0.24),transparent_34%),linear-gradient(145deg,#151018,#06070b)] p-4">
            <span className="mb-2 w-fit rounded-full bg-white/[0.075] px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/52">{format}</span>
            <span className="line-clamp-3 text-sm font-black leading-tight text-white/84">{title}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.04),transparent_25%,rgba(0,0,0,0.46)_58%,rgba(0,0,0,0.92))]" />
        <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/44 text-white/76 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur transition duration-200 group-hover:bg-primary/18 group-hover:text-white">
          <Heart className="h-4 w-4" />
        </span>

        <div className="absolute inset-x-0 bottom-0 p-3.5">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-white/10 bg-white/[0.08] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/72">{format}</span>
            {status ? <span className="rounded-full border border-primary/22 bg-primary/12 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary">{status}</span> : null}
          </div>
          <h3 className={`line-clamp-2 ${compact ? 'min-h-[30px] text-[13px]' : 'min-h-[34px] text-[15px]'} font-black leading-[1.12] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]`}>{title}</h3>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold text-white/62">
            <span className="truncate">{genres.length ? genres.join(' / ') : 'Anime'}</span>
            <span className="shrink-0">{year || 'TBA'}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-black text-white/66">
            <span className="inline-flex items-center gap-1 text-yellow-300">
              <Star className="h-3.5 w-3.5 fill-current" />
              {score ? score.toFixed(1) : 'N/A'}
            </span>
            <span className="shrink-0">{episodes ? `${episodes} eps` : 'TBA'}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function modeFromSearchParams(searchParams: URLSearchParams): ExploreMode {
  const mode = searchParams.get('mode');
  if (mode && mode in modeConfig) {
    return mode as ExploreMode;
  }
  const category = String(searchParams.get('category') || '').toLowerCase();
  if (['new', 'new-episodes', 'latest', 'recent'].includes(category)) return 'new';
  if (['seasonal', 'season'].includes(category)) return 'seasonal';
  if (['trending', 'popular', 'airing', 'upcoming'].includes(category)) return category as ExploreMode;
  if (['top', 'top-rated'].includes(category)) return 'top';
  if (['year', 'top-this-year', 'top-year'].includes(category)) return 'year';
  const sort = searchParams.get('sort');
  const status = searchParams.get('status');
  if (sort === 'recent' || sort === 'latest') return 'new';
  if (sort === 'upcoming') return 'upcoming';
  if (sort === 'popular') return 'popular';
  if (sort === 'score' && status === 'airing') return 'airing';
  if (sort === 'score') return 'top';
  if (status === 'airing') return 'trending';
  return 'trending';
}

function filtersFromSearchParams(searchParams: URLSearchParams) {
  return (Object.keys(defaultVisualFilters) as VisualFilterKey[]).reduce((filters, key) => {
    const value = searchParams.get(key);
    if (!value) return filters;
    const group = visualFilterGroups.find((item) => item.key === key);
    if (!group?.options.includes(value)) return filters;
    return { ...filters, [key]: value };
  }, defaultVisualFilters);
}

function localSortFromSearchParams(searchParams: URLSearchParams): LocalSortKey {
  const sort = searchParams.get('order');
  return localSortModes.some((item) => item.value === sort) ? sort as LocalSortKey : 'best';
}

export default function DesktopExplore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const currentYear = new Date().getFullYear();
  const currentSeason = useMemo(() => getCurrentAnimeSeason(), []);
  const [input, setInput] = useState(searchParams.get('q') || '');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [mode, setMode] = useState<ExploreMode>(() => modeFromSearchParams(searchParams));
  const [year, setYear] = useState(Number(searchParams.get('year') || currentYear));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visualFilters, setVisualFilters] = useState<Record<VisualFilterKey, string>>(() => filtersFromSearchParams(searchParams));
  const [localSort, setLocalSort] = useState<LocalSortKey>(() => localSortFromSearchParams(searchParams));
  const [searchFocused, setSearchFocused] = useState(false);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [spotlightPaused, setSpotlightPaused] = useState(false);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [visibleResultCount, setVisibleResultCount] = useState(EXPLORE_INITIAL_RESULTS);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [density, setDensity] = useState<ExploreDensity>('poster');
  const prefersReducedMotion = usePrefersReducedMotion();
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('streamnyaa.desktop.recentExploreSearches') || '[]').slice(0, 6);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const nextMode = modeFromSearchParams(searchParams);
    const nextQuery = searchParams.get('q') || '';
    const nextYear = Number(searchParams.get('year') || currentYear);
    const nextFilters = filtersFromSearchParams(searchParams);
    const nextSort = localSortFromSearchParams(searchParams);
    setMode((value) => (value === nextMode ? value : nextMode));
    setInput((value) => (value === nextQuery ? value : nextQuery));
    setQuery((value) => (value === nextQuery ? value : nextQuery));
    setYear((value) => (value === nextYear ? value : nextYear));
    setLocalSort((value) => (value === nextSort ? value : nextSort));
    setVisualFilters((value) => JSON.stringify(value) === JSON.stringify(nextFilters) ? value : nextFilters);
  }, [currentYear, searchParams]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const nextQuery = input.trim();
      if (nextQuery === query) return;
      const next = new URLSearchParams(searchParams);
      if (nextQuery) next.set('q', nextQuery);
      else next.delete('q');
      next.set('mode', mode);
      if (mode === 'year') next.set('year', String(year));
      else next.delete('year');
      setSearchParams(next, { replace: true });
    }, 320);

    return () => window.clearTimeout(handle);
  }, [input, mode, query, searchParams, setSearchParams, year]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setSearchFocused(false);
        setFiltersOpen(false);
        setYearMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    setVisibleResultCount(EXPLORE_INITIAL_RESULTS);
    setExpandedRows({});
    setYearMenuOpen(false);
  }, [localSort, mode, query, visualFilters, year]);

  const selected = modeConfig[mode];
  const activeVisualFilterCount = useMemo(
    () => Object.values(visualFilters).filter((value) => value !== 'Any').length,
    [visualFilters],
  );
  const activeFilterEntries = useMemo(
    () => (Object.keys(visualFilters) as VisualFilterKey[])
      .filter((key) => visualFilters[key] !== 'Any')
      .map((key) => ({ key, label: visualFilterGroups.find((group) => group.key === key)?.label || key, value: visualFilters[key] })),
    [visualFilters],
  );
  const activePresetLabel = useMemo(() => {
    const match = filterPresets.find((preset) => Object.entries(preset.filters).every(([key, value]) => visualFilters[key as VisualFilterKey] === value));
    return match?.label || '';
  }, [visualFilters]);
  const providerFormat = visualFilters.format === 'Any' ? '' : visualFilters.format.replace(/\s+/g, '_').toUpperCase();
  const providerGenre = visualFilters.genre === 'Any' ? '' : visualFilters.genre;
  const providerStatus = visualFilters.status === 'Airing'
    ? 'airing'
    : visualFilters.status === 'Completed'
      ? 'complete'
      : visualFilters.status === 'Upcoming'
        ? 'upcoming'
        : selected.status;
  const providerSort = localSort === 'popularity'
    ? 'popular'
    : localSort === 'score'
      ? 'score'
      : selected.sort;

  const applyFilterState = (
    nextFilters: Record<VisualFilterKey, string>,
    options?: { mode?: ExploreMode; sort?: LocalSortKey; closeFilters?: boolean },
  ) => {
    setVisualFilters(nextFilters);
    if (options?.mode) setMode(options.mode);
    if (options?.sort) setLocalSort(options.sort);
    if (options?.closeFilters) setFiltersOpen(false);

    const next = new URLSearchParams(searchParams);
    (Object.keys(defaultVisualFilters) as VisualFilterKey[]).forEach((key) => {
      const value = nextFilters[key];
      if (!value || value === 'Any') next.delete(key);
      else next.set(key, value);
    });
    if (options?.mode) {
      next.set('mode', options.mode);
      if (options.mode === 'year') next.set('year', String(year));
      else next.delete('year');
    }
    if (options?.sort && options.sort !== 'best') next.set('order', options.sort);
    if (options?.sort === 'best') next.delete('order');
    setSearchParams(next, { replace: true });

    const preference = audioPreferenceFromFilter(nextFilters.audio);
    if (preference) saveDesktopAudioPreference(preference);
  };

  const updateVisualFilter = (key: VisualFilterKey, value: string) => {
    applyFilterState({ ...visualFilters, [key]: value });
  };
  const applyPreset = (preset: typeof filterPresets[number]) => {
    applyFilterState({ ...defaultVisualFilters, ...preset.filters }, {
      mode: preset.mode,
      sort: preset.sort,
      closeFilters: false,
    });
  };
  const updateLocalSort = (value: LocalSortKey) => {
    setLocalSort(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'best') next.delete('order');
    else next.set('order', value);
    setSearchParams(next, { replace: true });
  };
  const clearAllFilters = () => {
    applyFilterState(defaultVisualFilters);
  };
  const updateMode = (item: ExploreMode) => {
    const next = new URLSearchParams(searchParams);
    next.set('mode', item);
    next.delete('category');
    if (item === 'year') next.set('year', String(year));
    else next.delete('year');
    setSearchParams(next, { replace: true });
  };
  const updateYear = (nextYear: number) => {
    setYear(nextYear);
    setYearMenuOpen(false);
    const next = new URLSearchParams(searchParams);
    next.set('mode', 'year');
    next.set('year', String(nextYear));
    setSearchParams(next, { replace: true });
  };
  const searchQuery = useQuery({
    queryKey: ['desktop-explore-results', query, mode, year, providerFormat, providerGenre, providerStatus, providerSort],
    queryFn: async () => {
      if (query.trim()) return fetchExploreSearchPages(query, providerFormat, providerGenre, providerSort, providerStatus, EXPLORE_SEARCH_PAGE_LIMIT);
      if (mode === 'new') return fetchRecentEpisodesWithLimit(48);
      if (mode === 'seasonal') return fetchSeasonalSpotlightCatalog(currentSeason.season, currentSeason.year);
      if (mode === 'year') return fetchTopAnimeByYear(year, EXPLORE_SEARCH_PAGE_LIMIT);
      if (mode === 'trending') return fetchExploreSearchPages('', providerFormat, providerGenre, providerSort, providerStatus || 'airing');
      return fetchExploreSearchPages('', providerFormat, providerGenre, providerSort, providerStatus);
    },
    staleTime: 1000 * 60 * 20,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    const value = query.trim();
    if (!value) return;
    setRecentSearches((current) => {
      const next = [value, ...current.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 6);
      try {
        localStorage.setItem('streamnyaa.desktop.recentExploreSearches', JSON.stringify(next));
      } catch {
        // Recent searches are a convenience only.
      }
      return next;
    });
  }, [query]);

  const seasonalQuery = useQuery({
    queryKey: ['desktop-explore-seasonal', currentSeason.season, currentSeason.year],
    queryFn: () => fetchSeasonalSpotlightCatalog(currentSeason.season, currentSeason.year),
    staleTime: SEASONAL_SPOTLIGHT_CACHE_TTL,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });
  const popularQuery = useQuery({
    queryKey: ['desktop-explore-popular'],
    queryFn: fetchPopularAnime,
    staleTime: 1000 * 60 * 60,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });
  const topAiringQuery = useQuery({
    queryKey: ['desktop-explore-top-airing'],
    queryFn: fetchTopAiring,
    staleTime: 1000 * 60 * 60,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });
  const upcomingQuery = useQuery({
    queryKey: ['desktop-explore-upcoming'],
    queryFn: fetchUpcomingAnime,
    staleTime: 1000 * 60 * 60,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const rawResults = useMemo(() => {
    const live = uniqueAnime(searchQuery.data?.data || []);
    if (query.trim()) return live;
    return live.length ? live : fallbackByMode[mode];
  }, [mode, query, searchQuery.data]);
  const results = useMemo(
    () => filterAnimeList(rawResults, visualFilters, currentYear, localSort, query),
    [currentYear, localSort, query, rawResults, visualFilters],
  );
  const visibleResults = useMemo(() => results.slice(0, visibleResultCount), [results, visibleResultCount]);
  const canShowMoreResults = visibleResultCount < results.length;
  const densityGridClass = density === 'list'
    ? 'grid gap-3'
    : density === 'compact'
      ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8'
      : 'grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6';
  const rows = useMemo(() => {
    const used = new Set<string>();
    return [
      { title: 'Seasonal Anime', data: buildExploreRow(seasonalQuery.data?.data || [], fallbackByMode.airing, 24, used), loading: seasonalQuery.isLoading },
      { title: 'Popular Picks', data: buildExploreRow(popularQuery.data?.data || [], fallbackByMode.popular, 24, used), loading: popularQuery.isLoading },
      { title: 'Top Airing', data: buildExploreRow(topAiringQuery.data?.data || [], fallbackByMode.top, 24, used), loading: topAiringQuery.isLoading },
      { title: 'Upcoming', data: buildExploreRow(upcomingQuery.data?.data || [], fallbackByMode.upcoming, 24, used), loading: upcomingQuery.isLoading },
    ];
  }, [
    popularQuery.data?.data,
    popularQuery.isLoading,
    seasonalQuery.data?.data,
    seasonalQuery.isLoading,
    topAiringQuery.data?.data,
    topAiringQuery.isLoading,
    upcomingQuery.data?.data,
    upcomingQuery.isLoading,
  ]);
  const filteredRows = useMemo(
    () => rows.map((row) => ({ ...row, data: filterAnimeList(row.data, visualFilters, currentYear, localSort) })),
    [currentYear, localSort, rows, visualFilters],
  );
  const isUpdatingResults = searchQuery.isFetching && !searchQuery.isLoading;
  const spotlightItems = useMemo(() => buildSpotlightItems(seasonalQuery.data?.data || []), [seasonalQuery.data?.data]);
  const activeSpotlight = spotlightItems.length ? spotlightItems[spotlightIndex % spotlightItems.length] : null;
  const activeSpotlightTitle = activeSpotlight?.title || activeSpotlight?.title_english || activeSpotlight?.title_romaji || 'current-season anime';
  const resultsHeading = query ? `Results for "${query}"` : mode === 'trending' ? 'Trending Now' : selected.label;
  const resultsSubtitle = query
    ? 'Matched by title, English, Romaji, native names, and aliases.'
    : mode === 'trending'
      ? 'The most popular anime right now'
      : selected.description;
  const visibleSpotlightDotCount = Math.min(spotlightItems.length, 8);
  const spotlightDotGroupSize = visibleSpotlightDotCount ? Math.ceil(spotlightItems.length / visibleSpotlightDotCount) : 1;
  const activeSpotlightDot = visibleSpotlightDotCount ? Math.min(visibleSpotlightDotCount - 1, Math.floor((spotlightIndex % spotlightItems.length) / spotlightDotGroupSize)) : 0;

  useEffect(() => {
    setSpotlightIndex(0);
  }, [currentSeason.season, currentSeason.year]);

  useEffect(() => {
    if (!spotlightItems.length) return;
    setSpotlightIndex((value) => value % spotlightItems.length);
  }, [spotlightItems.length]);

  useEffect(() => {
    if (prefersReducedMotion || spotlightPaused || spotlightItems.length < 2) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setSpotlightIndex((value) => (value + 1) % spotlightItems.length);
    }, SPOTLIGHT_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [prefersReducedMotion, spotlightItems.length, spotlightPaused]);

  useEffect(() => {
    if (!spotlightItems.length || typeof window === 'undefined') return;
    const next = spotlightItems[(spotlightIndex + 1) % spotlightItems.length];
    const source = spotlightArtworkCandidatesFor(next)[0];
    if (!source) return;
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.src = source;
  }, [spotlightIndex, spotlightItems]);

  const moveSpotlight = (direction: -1 | 1) => {
    if (!spotlightItems.length) return;
    setSpotlightIndex((value) => (value + direction + spotlightItems.length) % spotlightItems.length);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = input.trim();
    setQuery(nextQuery);
    const next = new URLSearchParams(searchParams);
    if (nextQuery) {
      next.set('q', nextQuery);
    } else {
      next.delete('q');
    }
    next.set('mode', mode);
    if (mode === 'year') next.set('year', String(year));
    else next.delete('year');
    setSearchParams(next, { replace: true });
  };
  const clearSearch = () => {
    setInput('');
    setQuery('');
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next, { replace: true });
  };
  const suggestions = useMemo(() => {
    const popular = fallbackByMode.trending.slice(0, 5).map((anime) => anime.title);
    return uniqueAnime([...recentSearches.map((title) => ({ title, mal_id: title })), ...popular.map((title) => ({ title, mal_id: title }))])
      .map((item) => item.title)
      .slice(0, 7);
  }, [recentSearches]);

  return (
    <div className="sn-page py-4">
      <Seo title="Explore Anime | StreamNyaa Desktop" description="Desktop anime discovery." canonicalPath="/search" robots="noindex, nofollow" />

      <section
        className="sn-hero-panel relative min-h-[292px] p-5 pl-6 lg:pl-8"
        onMouseEnter={() => setSpotlightPaused(true)}
        onMouseLeave={() => setSpotlightPaused(false)}
        onFocus={() => setSpotlightPaused(true)}
        onBlur={() => setSpotlightPaused(false)}
      >
        <SpotlightArtwork anime={activeSpotlight} title={activeSpotlightTitle} />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,8,0.92)_0%,rgba(8,6,10,0.62)_40%,rgba(8,6,10,0.18)_72%,rgba(5,5,8,0.56)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_6%,rgba(255,47,104,0.30),transparent_31%),radial-gradient(circle_at_55%_72%,rgba(255,190,90,0.12),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,0.26))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#07070b] to-transparent" />
        <div className="relative grid gap-4 lg:grid-cols-[minmax(320px,0.8fr)_minmax(460px,1.2fr)] lg:items-start">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-primary">Explore</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.055em] text-white xl:text-5xl">
              Discover <span className="text-primary">anime</span>
            </h1>
            <p className="mt-2 max-w-[540px] text-sm leading-6 text-white/[0.78]">
              Find your next obsession. Explore trending titles, timeless classics, and hidden gems from around the anime world.
            </p>
          </div>
          <form onSubmit={submit} className="sn-glass-card relative flex w-full max-w-[560px] gap-3 justify-self-end rounded-2xl p-1.5 lg:mt-12">
            <label className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/36" />
              <input
                ref={searchInputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                aria-label="Search anime"
                placeholder="Search anime, characters, studios..."
                className="sn-input h-12 w-full rounded-xl pl-12 pr-12 text-base"
              />
              {input ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 rounded-full p-1 text-white/42 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgba(255,47,104,0.28)]"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md bg-white/[0.06] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">Ctrl K</span>
              )}
            </label>
            <button
              type="submit"
              className="sn-primary-action h-12 rounded-xl px-7 text-sm"
            >
              {isUpdatingResults ? 'Updating' : 'Search'}
            </button>
            {searchFocused && suggestions.length ? (
              <div
                className="absolute left-0 right-0 top-[calc(100%+10px)] z-30 rounded-2xl bg-[#101014]/95 p-3 shadow-2xl shadow-black/40 ring-1 ring-white/[0.055] backdrop-blur"
                onMouseDown={(event) => event.preventDefault()}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/36">
                    {recentSearches.length ? 'Recent and popular searches' : 'Popular searches'}
                  </span>
                  <button type="button" onClick={() => setSearchFocused(false)} className="text-xs font-bold text-white/42 hover:text-white">Close</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setInput(item);
                        setQuery(item);
                        setSearchFocused(false);
                        const next = new URLSearchParams(searchParams);
                        next.set('q', item);
                        next.set('mode', mode);
                        setSearchParams(next, { replace: true });
                      }}
                      className="rounded-full bg-white/[0.055] px-3 py-1.5 text-xs font-bold text-white/62 transition hover:bg-primary/15 hover:text-white focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgba(255,47,104,0.28)]"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </form>
        </div>

        <div className="relative mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {Array.from({ length: visibleSpotlightDotCount }).map((_, index) => (
              <button
                key={`spotlight-dot-${index}`}
                type="button"
                onClick={() => setSpotlightIndex(Math.min(index * spotlightDotGroupSize, spotlightItems.length - 1))}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  index === activeSpotlightDot
                    ? 'w-7 bg-primary shadow-[0_0_16px_rgba(244,63,94,0.55)]'
                    : 'w-2.5 bg-white/[0.22] hover:bg-white/[0.52]'
                }`}
                aria-label={`Show spotlight group ${index + 1}`}
              />
            ))}
          </div>
          {spotlightItems.length > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => moveSpotlight(-1)}
                className="sn-icon-action h-10 w-10 rounded-2xl"
                aria-label="Previous seasonal spotlight"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => moveSpotlight(1)}
                className="sn-icon-action h-10 w-10 rounded-2xl"
                aria-label="Next seasonal spotlight"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="sn-glass-card relative mt-3 rounded-2xl p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 items-center gap-2 px-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/58">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              Refine your search
            </span>
            <PremiumSelect
              value={mode}
              onChange={(value) => updateMode(value as ExploreMode)}
              ariaLabel="Category"
              options={sortModes.map((item) => ({ label: item.label, value: item.mode }))}
            />
            <PremiumSelect
              value={localSort}
              onChange={(value) => updateLocalSort(value as LocalSortKey)}
              ariaLabel="Order by"
              options={localSortModes}
            />
            {(['genre', 'yearRange', 'status'] as VisualFilterKey[]).map((key) => {
              const group = visualFilterGroups.find((item) => item.key === key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className="sn-secondary-action h-10 rounded-xl px-4 text-sm"
                >
                  {key === 'genre' ? <Sparkles className="h-4 w-4 text-primary" /> : key === 'yearRange' ? <CalendarDays className="h-4 w-4 text-primary" /> : <TrendingUp className="h-4 w-4 text-primary" />}
                  {group?.label || key}
                </button>
              );
            })}
            <button
              type="button"
              onClick={clearAllFilters}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition duration-200 active:translate-y-0 ${
                activeVisualFilterCount
                  ? 'bg-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] hover:-translate-y-0.5 hover:bg-primary/[0.14]'
                  : 'cursor-default bg-white/[0.035] text-white/34'
              }`}
              disabled={!activeVisualFilterCount}
            >
              <X className={`h-4 w-4 ${activeVisualFilterCount ? 'text-primary' : 'text-white/28'}`} />
              Clear
            </button>
          </div>
        </div>
      </section>

      <div className="sticky top-3 z-20 mt-3 overflow-x-auto pb-1">
        <div className="sn-glass-card inline-flex min-w-full items-center gap-1 rounded-[18px] p-1.5">
          {(Object.keys(modeConfig) as ExploreMode[]).map((item) => {
            const Icon = modeIcons[item];
            return (
              <button
                key={item}
                type="button"
                onClick={() => updateMode(item)}
                className={`group relative inline-flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-xl px-4 text-sm font-black transition duration-200 active:scale-[0.98] ${
                  mode === item
                    ? 'sn-category-chip-active'
                    : 'sn-category-chip'
                }`}
              >
                <Icon className={`h-4 w-4 transition duration-200 ${mode === item ? 'text-white' : 'text-white/28 group-hover:text-primary/80'}`} />
                {mode === item ? <span className="absolute inset-x-4 bottom-0 h-px bg-white/50" /> : null}
                <span className="relative whitespace-nowrap">{modeConfig[item].label}</span>
              </button>
            );
          })}
          {mode === 'year' ? (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setYearMenuOpen((value) => !value)}
                aria-haspopup="listbox"
                aria-expanded={yearMenuOpen}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-black/35 px-3 text-sm font-black text-white outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] ring-1 ring-white/[0.055] transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] focus-visible:ring-primary/55 active:translate-y-0"
              >
                {year}
                <ChevronDown className={`h-4 w-4 text-white/50 transition ${yearMenuOpen ? 'rotate-180 text-primary' : ''}`} />
              </button>
              {yearMenuOpen ? (
                <div
                  role="listbox"
                  className="absolute left-0 top-[calc(100%+8px)] z-40 w-28 overflow-hidden rounded-xl bg-[#111116]/98 p-1 shadow-2xl shadow-black/45 ring-1 ring-primary/20 backdrop-blur-xl"
                >
                  {Array.from({ length: 10 }).map((_, index) => {
                    const item = currentYear - index;
                    const active = item === year;
                    return (
                      <button
                        key={item}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => updateYear(item)}
                        className={`flex h-9 w-full items-center rounded-lg px-3 text-left text-sm font-black transition ${
                          active
                            ? 'bg-primary text-white shadow-[0_8px_22px_rgba(244,63,94,0.22)]'
                            : 'text-white/70 hover:bg-white/[0.075] hover:text-white'
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          <span className="mx-1 hidden h-8 w-px shrink-0 bg-white/[0.055] lg:block" />
          {quickFormatFilters.map((item) => {
            const Icon = item.icon;
            const active = visualFilters.format === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => updateVisualFilter('format', active ? 'Any' : item.value)}
                className={`group inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-black transition duration-200 active:scale-[0.98] ${
                  active
                    ? 'bg-white text-black shadow-[0_8px_22px_rgba(255,255,255,0.10)]'
                    : 'text-white/58 hover:-translate-y-0.5 hover:bg-white/[0.075] hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 transition duration-200 ${active ? 'text-black/72' : 'text-white/34 group-hover:text-primary'}`} />
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-black transition duration-200 active:scale-[0.98] lg:ml-auto ${
              filtersOpen || activeVisualFilterCount
                ? 'bg-primary/16 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_24px_rgba(244,63,94,0.10)]'
                : 'text-white/58 hover:-translate-y-0.5 hover:bg-white/[0.075] hover:text-white'
            }`}
          >
            <Filter className="h-4 w-4 text-primary/90" />
            Filters
          </button>
        </div>
      </div>

        {activeFilterEntries.length ? (
          <div className="relative mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-white/[0.028] px-3 py-2 ring-1 ring-white/[0.035]">
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/42">
              <Filter className="h-3.5 w-3.5 text-primary" />
              Active filters
            </span>
            {activePresetLabel ? (
              <span className="rounded-full bg-primary/15 px-3 py-1.5 text-xs font-black text-primary">
                {activePresetLabel}
              </span>
            ) : null}
            {activeFilterEntries.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => updateVisualFilter(item.key, 'Any')}
                className="inline-flex items-center gap-2 rounded-full bg-white/[0.055] px-3 py-1.5 text-xs font-bold text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition hover:-translate-y-0.5 hover:bg-primary/14 hover:text-white"
              >
                {item.label}: {item.value}
                <X className="h-3.5 w-3.5 text-white/52" />
              </button>
            ))}
            <button type="button" onClick={clearAllFilters} className="rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-black text-white/50 transition hover:bg-white/[0.07] hover:text-white">
              Clear all
            </button>
          </div>
        ) : null}

        <div
          className={`relative transition-[max-height,opacity,transform,margin] duration-300 ease-out ${
            filtersOpen
              ? 'mt-3 max-h-[720px] translate-y-0 overflow-visible opacity-100'
              : 'mt-0 max-h-0 -translate-y-2 overflow-hidden opacity-0'
          }`}
          aria-hidden={!filtersOpen}
        >
            <div className="sn-glass-panel rounded-2xl p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-white">Discovery filters</p>
                <p className="mt-1 text-xs font-semibold text-white/42">Use presets for fast discovery, then refine only what matters.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-black text-white/56 transition hover:bg-white/[0.07] hover:text-white"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-black text-white/56 transition hover:bg-white/[0.07] hover:text-white"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {filterPresets.map((preset) => {
                const Icon = preset.icon;
                const active = activePresetLabel === preset.label;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`group inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-left text-sm font-black transition duration-200 active:scale-[0.98] ${
                      active
                        ? 'bg-[linear-gradient(135deg,#ff3b63,#e11d48)] text-white shadow-[0_10px_28px_rgba(244,63,94,0.22)]'
                        : 'bg-white/[0.045] text-white/70 hover:-translate-y-0.5 hover:bg-white/[0.075] hover:text-white'
                    }`}
                    title={preset.description}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-primary/80 group-hover:text-primary'}`} />
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {filterSections.map((section) => (
                <div key={section.title} className="rounded-2xl bg-white/[0.026] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ring-1 ring-white/[0.026]">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">{section.title}</p>
                      <p className="mt-1 text-[11px] font-semibold text-white/38">{section.description}</p>
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {section.keys.map((key) => {
                      const group = visualFilterGroups.find((item) => item.key === key);
                      if (!group) return null;
                      return (
                        <div key={group.key} className="min-w-0 rounded-xl bg-[#08080d]/58 p-2.5 ring-1 ring-white/[0.035]">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-white/36">{group.label}</span>
                          <PremiumSelect
                            value={visualFilters[group.key]}
                            onChange={(value) => updateVisualFilter(group.key, value)}
                            ariaLabel={group.label}
                            minWidth="w-full"
                            options={group.options.map((option) => ({ label: option, value: option }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      <section className="mt-4">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">{query ? 'Search results' : 'Browse category'}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-white">{resultsHeading}</h2>
            <p className="mt-1 text-xs font-semibold text-white/52">{isUpdatingResults ? 'Refreshing matching titles...' : resultsSubtitle}</p>
          </div>
          <div className="sn-glass-card hidden shrink-0 items-center rounded-2xl p-1 lg:flex">
            {([
              ['poster', 'Poster Grid'],
              ['compact', 'Compact'],
              ['list', 'List'],
            ] as Array<[ExploreDensity, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDensity(value)}
                className={`h-9 rounded-xl px-3 text-xs font-black transition duration-200 ${
                  density === value
                    ? 'bg-primary text-white shadow-[0_10px_24px_rgba(244,63,94,0.22)]'
                    : 'text-white/50 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {searchQuery.isLoading ? <SkeletonGrid /> : results.length ? (
          <>
            <div className={densityGridClass}>
              {visibleResults.map((anime, index) => <ExploreAnimeCard key={anime.mal_id || anime.id || anime.title} anime={anime} index={index} density={density} />)}
            </div>
            <div className="mt-5 flex justify-center">
              {canShowMoreResults ? (
                <button
                  type="button"
                  onClick={() => setVisibleResultCount((value) => value + EXPLORE_RESULTS_INCREMENT)}
                  className="sn-secondary-action rounded-xl px-5 py-2.5 text-sm"
                >
                  Load more
                </button>
              ) : results.length > EXPLORE_INITIAL_RESULTS ? (
                <button
                  type="button"
                  onClick={() => setVisibleResultCount(EXPLORE_INITIAL_RESULTS)}
                  className="sn-secondary-action rounded-xl px-5 py-2.5 text-sm"
                >
                  Collapse
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <EmptyState text={searchQuery.isError ? 'Anime data could not load. Check your connection and try again.' : query ? `No results for "${query}". Try fewer filters, another title alias, or a broader category.` : 'Try removing filters or searching another title.'}>
            {query ? (
              <button type="button" onClick={clearSearch} className="rounded-full bg-primary px-4 py-2 text-sm font-black text-white shadow-lg shadow-primary/18 hover:bg-primary/90">
                Clear search
              </button>
            ) : null}
            {activeVisualFilterCount ? (
              <button type="button" onClick={clearAllFilters} className="rounded-full bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/[0.08] hover:text-white">
                Clear filters
              </button>
            ) : null}
            {searchQuery.isError ? (
              <button type="button" onClick={() => searchQuery.refetch()} className="rounded-full bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/[0.08] hover:text-white">
                Retry
              </button>
            ) : null}
          </EmptyState>
        )}
      </section>

      {!query ? (
        <div className="mt-8 space-y-8">
          {filteredRows.map((row) => {
            const rowExpanded = Boolean(expandedRows[row.title]);
            const rowItems = rowExpanded ? row.data : row.data.slice(0, EXPLORE_ROW_INITIAL_ITEMS);
            return (
            <section key={row.title}>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">{row.title}</h2>
                {row.data.length > EXPLORE_ROW_INITIAL_ITEMS ? (
                  <button
                    type="button"
                    onClick={() => setExpandedRows((current) => ({ ...current, [row.title]: !rowExpanded }))}
                    className="rounded-xl bg-white/[0.045] px-3.5 py-2 text-xs font-black text-white/58 transition duration-200 hover:-translate-y-0.5 hover:bg-primary/14 hover:text-white focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgba(255,47,104,0.28)] active:translate-y-0"
                  >
                    {rowExpanded ? 'Collapse' : 'Load more'}
                  </button>
                ) : null}
              </div>
              {row.loading ? <SkeletonGrid /> : row.data.length ? (
                <div className={densityGridClass}>
                  {rowItems.map((anime, index) => <ExploreAnimeCard key={`${row.title}-${anime.mal_id || anime.id || anime.title}`} anime={anime} index={index} density={density} />)}
                </div>
              ) : (
                <EmptyState text={`${row.title} could not load right now.`} />
              )}
            </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
