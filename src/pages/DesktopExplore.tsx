import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import {
  fetchAnimeSeason,
  fetchPopularAnime,
  fetchTopAiring,
  fetchTopAnimeByYear,
  fetchUpcomingAnime,
  searchAnime,
} from '../api/jikan';
import { getCurrentAnimeSeason } from '../lib/currentSeason';
import { saveDesktopAudioPreference, type DesktopAudioPreference } from '../lib/desktop';

type ExploreMode = 'trending' | 'popular' | 'top' | 'airing' | 'upcoming' | 'year';
type VisualFilterKey = 'genre' | 'season' | 'status' | 'format' | 'source' | 'yearRange' | 'audio' | 'rating' | 'episodes';
type LocalSortKey = 'best' | 'title' | 'score' | 'popularity' | 'newest' | 'episodes';

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
];

const sortModes: Array<{ label: string; mode: ExploreMode }> = [
  { label: 'Trending', mode: 'trending' },
  { label: 'Popular', mode: 'popular' },
  { label: 'Highest Rated', mode: 'top' },
  { label: 'Top Airing', mode: 'airing' },
  { label: 'Upcoming', mode: 'upcoming' },
  { label: 'Top This Year', mode: 'year' },
];

const localSortModes: Array<{ label: string; value: LocalSortKey }> = [
  { label: 'Best Match', value: 'best' },
  { label: 'Title A-Z', value: 'title' },
  { label: 'Highest Score', value: 'score' },
  { label: 'Most Popular', value: 'popularity' },
  { label: 'Newest', value: 'newest' },
  { label: 'Episode Count', value: 'episodes' },
];

const modeConfig: Record<ExploreMode, { label: string; sort: string; status: string; description: string }> = {
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

const fallbackByMode: Record<ExploreMode, any[]> = {
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

function yearFor(anime: any) {
  const year = Number(anime?.year || anime?.seasonYear || anime?.aired?.prop?.from?.year || 0);
  return Number.isFinite(year) ? year : 0;
}

function formatFor(anime: any) {
  return normalizedValue(anime?.type || anime?.format).replace(/_/g, ' ');
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
        <div key={index} className="aspect-[2/3] animate-pulse rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))]" />
      ))}
    </div>
  );
}

function EmptyState({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025)_52%,rgba(244,63,94,0.045))] px-6 py-14 text-center shadow-xl shadow-black/18">
      <p className="text-lg font-black text-white">No anime found</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">{text}</p>
      {children ? <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

function modeFromSearchParams(searchParams: URLSearchParams): ExploreMode {
  const mode = searchParams.get('mode');
  if (mode && mode in modeConfig) {
    return mode as ExploreMode;
  }
  const sort = searchParams.get('sort');
  const status = searchParams.get('status');
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
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

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

  const updateVisualFilter = (key: VisualFilterKey, value: string) => {
    setVisualFilters((current) => ({ ...current, [key]: value }));
    const next = new URLSearchParams(searchParams);
    if (value === 'Any') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
    const preference = key === 'audio' ? audioPreferenceFromFilter(value) : null;
    if (preference) saveDesktopAudioPreference(preference);
  };
  const updateLocalSort = (value: LocalSortKey) => {
    setLocalSort(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'best') next.delete('order');
    else next.set('order', value);
    setSearchParams(next, { replace: true });
  };
  const clearAllFilters = () => {
    setVisualFilters(defaultVisualFilters);
    const next = new URLSearchParams(searchParams);
    (Object.keys(defaultVisualFilters) as VisualFilterKey[]).forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
  };
  const updateMode = (item: ExploreMode) => {
    const next = new URLSearchParams(searchParams);
    next.set('mode', item);
    if (item === 'year') next.set('year', String(year));
    else next.delete('year');
    setSearchParams(next, { replace: true });
  };
  const searchQuery = useQuery({
    queryKey: ['desktop-explore-results', query, mode, year, providerFormat, providerGenre, providerStatus, providerSort],
    queryFn: async () => {
      if (query.trim()) return searchAnime(query, 1, providerFormat, '', providerGenre, providerSort, providerStatus);
      if (mode === 'year') return fetchTopAnimeByYear(year);
      if (mode === 'popular') return fetchPopularAnime();
      if (mode === 'airing') return fetchTopAiring();
      if (mode === 'upcoming') return fetchUpcomingAnime();
      if (mode === 'trending') return searchAnime('', 1, providerFormat, '', providerGenre, providerSort, providerStatus || 'airing');
      return searchAnime(query, 1, providerFormat, '', providerGenre, providerSort, providerStatus);
    },
    staleTime: 1000 * 60 * 20,
    retry: 1,
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
    queryFn: () => fetchAnimeSeason(currentSeason.season, currentSeason.year),
    staleTime: 1000 * 60 * 15,
    retry: 1,
  });
  const popularQuery = useQuery({
    queryKey: ['desktop-explore-popular'],
    queryFn: fetchPopularAnime,
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
  const topAiringQuery = useQuery({
    queryKey: ['desktop-explore-top-airing'],
    queryFn: fetchTopAiring,
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
  const upcomingQuery = useQuery({
    queryKey: ['desktop-explore-upcoming'],
    queryFn: fetchUpcomingAnime,
    staleTime: 1000 * 60 * 60,
    retry: 1,
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
  const rows = useMemo(() => {
    const used = new Set<string>();
    return [
      { title: 'Seasonal Anime', data: buildExploreRow(seasonalQuery.data?.data || [], fallbackByMode.airing, 10, used), loading: seasonalQuery.isLoading },
      { title: 'Popular Picks', data: buildExploreRow(popularQuery.data?.data || [], fallbackByMode.popular, 10, used), loading: popularQuery.isLoading },
      { title: 'Top Airing', data: buildExploreRow(topAiringQuery.data?.data || [], fallbackByMode.top, 10, used), loading: topAiringQuery.isLoading },
      { title: 'Upcoming', data: buildExploreRow(upcomingQuery.data?.data || [], fallbackByMode.upcoming, 10, used), loading: upcomingQuery.isLoading },
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
    <div className="px-6 py-6">
      <Seo title="Explore Anime | StreamNyaa Desktop" description="Desktop anime discovery." canonicalPath="/search" robots="noindex, nofollow" />

      <section className="desktop-premium-surface overflow-hidden rounded-2xl p-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Explore</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">Find anime that actually matches the category.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">{selected.description}</p>
          </div>
          <form onSubmit={submit} className="relative flex w-full max-w-[680px] flex-1 gap-3 rounded-2xl border border-white/8 bg-black/18 p-2 backdrop-blur lg:min-w-[420px]">
            <label className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/36" />
              <input
                ref={searchInputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                aria-label="Search anime"
                placeholder="Search title, alias, native name, or season..."
                className="h-12 w-full rounded-xl border border-white/10 bg-black/32 pl-12 pr-12 text-sm text-white outline-none placeholder:text-white/36 focus:border-white/24"
              />
              {input ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 rounded-full p-1 text-white/42 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-white/8 bg-white/[0.04] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/34">Ctrl K</span>
              )}
            </label>
            <button className="h-12 rounded-xl bg-primary px-6 text-sm font-black text-white shadow-lg shadow-primary/18 transition-colors hover:bg-primary/90">
              Search
            </button>
            {searchFocused && suggestions.length ? (
              <div
                className="absolute left-0 right-0 top-[calc(100%+10px)] z-30 rounded-2xl border border-white/10 bg-[#101014]/95 p-3 shadow-2xl shadow-black/40 backdrop-blur"
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
                      className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-bold text-white/62 hover:border-primary/40 hover:text-white"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </form>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          {(Object.keys(modeConfig) as ExploreMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => updateMode(item)}
              className={`rounded-full border px-4 py-2 text-sm font-black transition-colors ${
                mode === item
                  ? 'border-transparent bg-primary text-white shadow-lg shadow-primary/12'
                  : 'border-white/10 bg-white/[0.045] text-white/64 hover:border-white/18 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              {modeConfig[item].label}
            </button>
          ))}
          {mode === 'year' ? (
            <select
              value={year}
              onChange={(event) => {
                const nextYear = Number(event.target.value);
                setYear(nextYear);
                const next = new URLSearchParams(searchParams);
                next.set('mode', 'year');
                next.set('year', String(nextYear));
                setSearchParams(next, { replace: true });
              }}
              className="ml-2 h-10 rounded-full border border-white/10 bg-black/35 px-3 text-sm font-black text-white outline-none"
            >
              {Array.from({ length: 8 }).map((_, index) => {
                const item = currentYear - index;
                return <option key={item} value={item}>{item}</option>;
              })}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            className={`rounded-full border px-4 py-2 text-sm font-black transition-colors ${
              filtersOpen || activeVisualFilterCount
                ? 'border-white/14 bg-white/[0.10] text-white'
                : 'border-white/10 bg-white/[0.045] text-white/64 hover:border-white/18 hover:bg-white/[0.07] hover:text-white'
            }`}
          >
            Filters{activeVisualFilterCount ? ` (${activeVisualFilterCount})` : ''}
          </button>
          <label className="ml-auto flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/34">
            Category
            <select
              value={mode}
              onChange={(event) => updateMode(event.target.value as ExploreMode)}
              className="h-10 rounded-full border border-white/10 bg-black/35 px-3 text-sm font-black normal-case tracking-normal text-white outline-none"
            >
              {sortModes.map((item) => (
                <option key={item.mode} value={item.mode}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/34">
            Order
            <select
              value={localSort}
              onChange={(event) => updateLocalSort(event.target.value as LocalSortKey)}
              className="h-10 rounded-full border border-white/10 bg-black/35 px-3 text-sm font-black normal-case tracking-normal text-white outline-none"
            >
              {localSortModes.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        {activeFilterEntries.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">
              <Filter className="h-3.5 w-3.5 text-primary" />
              Active
            </span>
            {activeFilterEntries.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => updateVisualFilter(item.key, 'Any')}
                className="inline-flex items-center gap-2 rounded-full border border-primary/22 bg-primary/10 px-3 py-1.5 text-xs font-bold text-white/82 hover:border-primary/45 hover:bg-primary/16"
              >
                {item.label}: {item.value}
                <X className="h-3.5 w-3.5 text-white/52" />
              </button>
            ))}
            <button type="button" onClick={clearAllFilters} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-black text-white/50 hover:text-white">
              Clear all
            </button>
          </div>
        ) : null}

        {filtersOpen ? (
          <div className="mt-5 rounded-2xl border border-white/8 bg-black/24 p-4 shadow-xl shadow-black/20">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-white">Discovery filters</p>
                <p className="mt-1 text-xs font-semibold text-white/42">Combine title search with genre, format, source, year, score, status, season, and episode length.</p>
              </div>
              <button
                type="button"
                onClick={clearAllFilters}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black text-white/56 transition-colors hover:border-white/18 hover:text-white"
              >
                Clear
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visualFilterGroups.map((group) => (
                <label key={group.key} className="rounded-xl border border-white/8 bg-white/[0.035] p-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{group.label}</span>
                  <select
                    value={visualFilters[group.key]}
                    onChange={(event) => updateVisualFilter(group.key, event.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-sm font-bold text-white outline-none focus:border-white/22"
                  >
                    {group.options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">{query ? `Results for "${query}"` : selected.label}</h2>
          <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-sm font-bold text-white/42">{results.length} titles</span>
        </div>
        {searchQuery.isLoading ? <SkeletonGrid /> : results.length ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
            {results.map((anime) => <AnimeCard key={anime.mal_id || anime.id || anime.title} anime={anime} />)}
          </div>
        ) : (
          <EmptyState text={searchQuery.isError ? 'Anime data could not load. Check your connection and try again.' : query ? `No results for "${query}". Try fewer filters, another title alias, or a broader category.` : 'Try removing filters or searching another title.'}>
            {query ? (
              <button type="button" onClick={clearSearch} className="rounded-full bg-primary px-4 py-2 text-sm font-black text-white shadow-lg shadow-primary/18 hover:bg-primary/90">
                Clear search
              </button>
            ) : null}
            {activeVisualFilterCount ? (
              <button type="button" onClick={clearAllFilters} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:text-white">
                Clear filters
              </button>
            ) : null}
            {searchQuery.isError ? (
              <button type="button" onClick={() => searchQuery.refetch()} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:text-white">
                Retry
              </button>
            ) : null}
          </EmptyState>
        )}
      </section>

      {!query ? (
        <div className="mt-10 space-y-9">
          {filteredRows.map((row) => (
            <section key={row.title}>
              <h2 className="mb-4 text-xl font-semibold tracking-[-0.01em] text-white">{row.title}</h2>
              {row.loading ? <SkeletonGrid /> : row.data.length ? (
                <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
                  {row.data.map((anime) => <AnimeCard key={`${row.title}-${anime.mal_id || anime.id || anime.title}`} anime={anime} />)}
                </div>
              ) : (
                <EmptyState text={`${row.title} could not load right now.`} />
              )}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
