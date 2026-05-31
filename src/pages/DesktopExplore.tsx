import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
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

type ExploreMode = 'trending' | 'popular' | 'top' | 'airing' | 'upcoming' | 'year';

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
        <div key={index} className="aspect-[2/3] animate-pulse rounded-xl bg-white/[0.055]" />
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.04] px-6 py-14 text-center text-white/56">
      {text}
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

export default function DesktopExplore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentYear = new Date().getFullYear();
  const currentSeason = useMemo(() => getCurrentAnimeSeason(), []);
  const [input, setInput] = useState(searchParams.get('q') || '');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [mode, setMode] = useState<ExploreMode>(() => modeFromSearchParams(searchParams));
  const [year, setYear] = useState(Number(searchParams.get('year') || currentYear));

  useEffect(() => {
    const nextMode = modeFromSearchParams(searchParams);
    const nextQuery = searchParams.get('q') || '';
    const nextYear = Number(searchParams.get('year') || currentYear);
    setMode((value) => (value === nextMode ? value : nextMode));
    setInput((value) => (value === nextQuery ? value : nextQuery));
    setQuery((value) => (value === nextQuery ? value : nextQuery));
    setYear((value) => (value === nextYear ? value : nextYear));
  }, [currentYear, searchParams]);

  const selected = modeConfig[mode];
  const searchQuery = useQuery({
    queryKey: ['desktop-explore-results', query, mode, year],
    queryFn: async () => {
      if (query.trim()) return searchAnime(query, 1, '', '', '', selected.sort, selected.status);
      if (mode === 'year') return fetchTopAnimeByYear(year);
      if (mode === 'popular') return fetchPopularAnime();
      if (mode === 'airing') return fetchTopAiring();
      if (mode === 'upcoming') return fetchUpcomingAnime();
      if (mode === 'trending') return searchAnime('', 1, '', '', '', '', 'airing');
      return searchAnime(query, 1, '', '', '', selected.sort, selected.status);
    },
    staleTime: 1000 * 60 * 20,
    retry: 1,
  });

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

  const results = useMemo(() => {
    const live = uniqueAnime(searchQuery.data?.data || []);
    if (query.trim()) return live;
    return live.length ? live : fallbackByMode[mode];
  }, [mode, query, searchQuery.data]);
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = input.trim();
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

  return (
    <div className="px-6 py-6">
      <Seo title="Explore Anime | StreamNyaa Desktop" description="Desktop anime discovery." canonicalPath="/search" robots="noindex, nofollow" />

      <section className="rounded-lg border border-white/8 bg-[linear-gradient(135deg,rgba(225,29,72,0.14),rgba(255,255,255,0.035)_42%,rgba(0,0,0,0.1))] p-6 shadow-2xl shadow-black/25">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Explore</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">Find anime that actually matches the category.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">{selected.description}</p>
          </div>
          <form onSubmit={submit} className="flex min-w-[420px] max-w-[620px] flex-1 gap-3">
            <label className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/36" />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Search anime..."
                className="h-12 w-full rounded-lg border border-white/10 bg-black/32 pl-12 pr-4 text-sm text-white outline-none placeholder:text-white/36 focus:border-primary/65"
              />
            </label>
            <button className="h-12 rounded-lg bg-primary px-6 text-sm font-black text-white shadow-lg shadow-primary/20 hover:bg-primary/90">
              Search
            </button>
          </form>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          {(Object.keys(modeConfig) as ExploreMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set('mode', item);
                if (item === 'year') next.set('year', String(year));
                else next.delete('year');
                setSearchParams(next, { replace: true });
              }}
              className={`rounded-full border px-4 py-2 text-sm font-black transition-colors ${
                mode === item
                  ? 'border-primary bg-primary text-white'
                  : 'border-white/10 bg-white/[0.045] text-white/64 hover:border-primary/50 hover:text-white'
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
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">{query ? `Results for "${query}"` : selected.label}</h2>
          <span className="text-sm text-white/42">{results.length} titles</span>
        </div>
        {searchQuery.isLoading ? <SkeletonGrid /> : results.length ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
            {results.map((anime) => <AnimeCard key={anime.mal_id || anime.id || anime.title} anime={anime} />)}
          </div>
        ) : (
          <EmptyState text={searchQuery.isError ? 'Anime data could not load. Check your connection and try again.' : 'No anime found for this filter.'} />
        )}
      </section>

      {!query ? (
        <div className="mt-10 space-y-9">
          {rows.map((row) => (
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
