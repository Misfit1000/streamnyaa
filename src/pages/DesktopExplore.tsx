import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Check, ChevronDown, Clapperboard, Grid2X2, List, Loader2, Play, RefreshCw, Search, SlidersHorizontal, Sparkles, Star, TrendingUp, Tv, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../components/Seo';
import DesktopLoadingProgress from '../components/DesktopLoadingProgress';
import UpcomingNotifyButton from '../components/UpcomingNotifyButton';
import { fetchAnimeSeason, fetchJikanExploreCatalog, fetchPopularAnime, fetchRecentEpisodesWithLimit, fetchTopAiring, fetchTopAnimeByYear, fetchUpcomingAnime, searchAnime } from '../api/jikan';
import { getCurrentAnimeSeason } from '../lib/currentSeason';
import { desktopWatchOrBrowsePath, isUpcomingAnime } from '../lib/desktopAnimeRoute';
import { desktopPosterCandidates } from '../lib/desktopArtwork';
import { episodeAvailabilityLabel } from '../lib/animeEpisodes';
import { preloadDesktopRoute, preloadDesktopWatchData } from '../lib/desktopRoutePreload';
import { primeDesktopWatchSnapshot } from '../lib/desktopWatchSnapshot';
import { exploreCatalogCacheKey, readDesktopExploreCatalog, writeDesktopExploreCatalog } from '../lib/desktopExploreCache';

type ExploreMode = 'new' | 'trending' | 'popular' | 'top' | 'airing' | 'seasonal' | 'upcoming' | 'year';
type ExploreDensity = 'poster' | 'compact' | 'list';
type SelectOption = { label: string; value: string };

const modes: Array<{ mode: ExploreMode; label: string; icon: typeof Sparkles }> = [
  { mode: 'new', label: 'New episodes', icon: CalendarDays },
  { mode: 'trending', label: 'Trending', icon: Sparkles },
  { mode: 'airing', label: 'Airing now', icon: Tv },
  { mode: 'seasonal', label: 'This season', icon: CalendarDays },
  { mode: 'popular', label: 'Popular', icon: Star },
  { mode: 'top', label: 'Top rated', icon: TrendingUp },
  { mode: 'upcoming', label: 'Upcoming', icon: CalendarDays },
  { mode: 'year', label: 'Top by year', icon: Clapperboard },
];

const genreOptions = ['Any', 'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];
const formatOptions = ['Any', 'TV', 'TV Short', 'Movie', 'OVA', 'ONA', 'Special'];
const statusOptions = ['Any', 'Airing', 'Completed', 'Upcoming'];
const sortOptions: SelectOption[] = [
  { label: 'Best match', value: 'best' },
  { label: 'Highest score', value: 'score' },
  { label: 'Most popular', value: 'popular' },
  { label: 'Newest first', value: 'recent' },
  { label: 'Title A-Z', value: 'title' },
];

function providerFormat(value: string) {
  if (value === 'TV Short') return 'TV_SHORT';
  return value === 'Any' ? '' : value;
}

function providerStatus(value: string) {
  if (value === 'Airing') return 'airing';
  if (value === 'Completed') return 'complete';
  if (value === 'Upcoming') return 'upcoming';
  return '';
}

function uniqueAnime(items: any[]) {
  const seen = new Set<string>();
  return items.filter((anime) => {
    const key = String(anime?.anilist_id || anime?.id || anime?.mal_id || anime?.title || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreFor(anime: any) {
  const value = Number(anime?.score || anime?.averageScore || 0);
  return Number.isFinite(value) ? value : 0;
}

function yearFor(anime: any) {
  const value = Number(anime?.year || anime?.seasonYear || anime?.aired?.prop?.from?.year || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function genresFor(anime: any) {
  return (Array.isArray(anime?.genres) ? anime.genres : [])
    .map((genre: any) => String(genre?.name || genre || '').trim())
    .filter(Boolean);
}

function formatFor(anime: any) {
  return String(anime?.type || anime?.format || 'Anime').replace(/_/g, ' ');
}

function statusFor(anime: any) {
  const value = String(anime?.status || '').toUpperCase();
  if (/RELEASING|AIRING/.test(value)) return 'Airing';
  if (/FINISHED|COMPLETED/.test(value)) return 'Completed';
  if (/NOT_YET|UPCOMING/.test(value)) return 'Upcoming';
  return '';
}

function localSort(items: any[], sort: string) {
  const next = [...items];
  if (sort === 'title') return next.sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || '')));
  if (sort === 'score') return next.sort((a, b) => scoreFor(b) - scoreFor(a));
  if (sort === 'recent') return next.sort((a, b) => Number(yearFor(b) || 0) - Number(yearFor(a) || 0));
  if (sort === 'popular') return next.sort((a, b) => Number(b?.popularity || 0) - Number(a?.popularity || 0));
  return next;
}

type ExploreCatalogArgs = {
  mode: ExploreMode;
  query: string;
  year: number;
  format: string;
  genre: string;
  status: string;
  sort: string;
};

async function loadPrimaryExploreCatalog(args: ExploreCatalogArgs) {
  const { mode, query, year, format, genre, status, sort } = args;
  const currentSeason = getCurrentAnimeSeason();
  const type = providerFormat(format);
  const providerGenre = genre === 'Any' ? '' : genre;
  const providerSort = sort === 'best' ? '' : sort;
  const state = providerStatus(status);
  if (query) return searchAnime(query, 1, type, '', providerGenre, providerSort, state);
  if (mode === 'new') return fetchRecentEpisodesWithLimit(48);
  if (mode === 'airing') return fetchTopAiring();
  if (mode === 'popular') return fetchPopularAnime();
  if (mode === 'upcoming') return fetchUpcomingAnime();
  if (mode === 'seasonal') return fetchAnimeSeason(currentSeason.season, currentSeason.year, 1);
  if (mode === 'year') return fetchTopAnimeByYear(year, 1);
  if (mode === 'top') return searchAnime('', 1, type, '', providerGenre, 'score', state);
  return searchAnime('', 1, type, '', providerGenre, 'popular', state || 'airing');
}

function loadExploreCatalog(args: ExploreCatalogArgs) {
  const currentSeason = getCurrentAnimeSeason();
  const allowEmpty = Boolean(args.query);
  return new Promise<any>((resolve, reject) => {
    let settled = false;
    let secondaryStarted = false;
    let failures = 0;
    const errors: unknown[] = [];
    const accept = (value: any) => {
      if (settled) return;
      if (!Array.isArray(value?.data) || (!allowEmpty && !value.data.length)) {
        fail(new Error('The anime catalog returned no usable entries.'));
        return;
      }
      settled = true;
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      failures += 1;
      errors.push(error);
      if (!secondaryStarted) startSecondary();
      else if (failures >= 2) reject(errors[0] || error);
    };
    const startSecondary = () => {
      if (secondaryStarted || settled) return;
      secondaryStarted = true;
      void fetchJikanExploreCatalog({
        mode: args.mode,
        query: args.query,
        year: args.year,
        season: currentSeason.season,
        type: providerFormat(args.format),
        genre: args.genre === 'Any' ? '' : args.genre,
        status: providerStatus(args.status),
      }).then(accept, fail);
    };

    void loadPrimaryExploreCatalog(args).then(accept, fail);
    window.setTimeout(startSecondary, 850);
  });
}

export function PremiumSelect({ value, options, onChange, ariaLabel }: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 180 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setPosition({ left: rect.left, top: rect.bottom + 6, width: Math.max(rect.width, 180) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!buttonRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value)?.label || value;
  return (
    <>
      <button ref={buttonRef} type="button" aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex h-10 min-w-[150px] items-center justify-between gap-3 rounded-lg bg-white/[0.055] px-3 text-sm font-semibold text-white/72 transition-colors hover:bg-white/[0.085] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
        <span className="truncate">{selected}</span><ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && typeof document !== 'undefined' ? createPortal(
        <div role="listbox" aria-label={ariaLabel} className="fixed z-[100] max-h-72 overflow-y-auto rounded-lg border border-white/[0.09] bg-[#151519] p-1 shadow-sm" style={position}>
          {options.map((option) => (
            <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); }} className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${option.value === value ? 'bg-primary/18 text-white' : 'text-white/68 hover:bg-white/[0.06] hover:text-white'}`}>
              {option.label}{option.value === value ? <Check className="h-4 w-4 text-primary" /> : null}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export const ExploreAnimeCard = memo(function ExploreAnimeCard({ anime, index, density = 'poster' }: { anime: any; index: number; density?: ExploreDensity }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const candidates = useMemo(() => desktopPosterCandidates(anime), [anime]);
  const image = candidates[imageIndex] || '';
  const title = anime?.title || anime?.title_english || anime?.title_romaji || 'Anime';
  const path = desktopWatchOrBrowsePath(anime);
  const genres = genresFor(anime).slice(0, 2);
  const compact = density === 'compact';
  const episodeLabel = episodeAvailabilityLabel(anime);
  const upcoming = isUpcomingAnime(anime);

  useEffect(() => {
    setImageIndex(0);
    setImageFailed(false);
  }, [String(anime?.anilist_id || anime?.id || anime?.mal_id || title), candidates.join('|')]);

  const prepare = () => {
    primeDesktopWatchSnapshot(path, anime);
    void preloadDesktopRoute(path);
    void preloadDesktopWatchData(path, false);
  };

  const imageNode = image && !imageFailed ? (
    <img key={image} src={image} alt={title} className="absolute inset-0 block h-full w-full object-cover object-center" loading={index < 8 ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setImageIndex((current) => { if (current < candidates.length - 1) return current + 1; setImageFailed(true); return current; })} />
  ) : (
    <div className="absolute inset-0 flex items-end bg-[linear-gradient(145deg,#18131a,#08080b)] p-4 text-sm font-semibold text-white/70">{title}</div>
  );

  if (density === 'list') {
    return (
      <div className="relative">
      <Link to={path} onPointerEnter={prepare} onFocus={prepare} onPointerDown={prepare} className="group grid min-h-[126px] grid-cols-[82px_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
        <div className="sn-explore-poster relative h-[108px] overflow-hidden rounded-lg">{imageNode}</div>
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-base font-semibold text-white">{title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-white/52">{anime?.synopsis || genres.join(' · ') || 'Anime details are being refreshed.'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-white/56">
            <span>{formatFor(anime)}</span><span>Episodes {episodeLabel}</span><span>{yearFor(anime) || 'Year TBA'}</span>
            <span className="inline-flex items-center gap-1 text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{scoreFor(anime) ? scoreFor(anime).toFixed(1) : 'N/A'}</span>
          </div>
        </div>
        {upcoming ? <span className="mr-[116px]" /> : <span className="mr-2 grid h-10 w-10 place-items-center rounded-full bg-primary text-white"><Play className="ml-0.5 h-4 w-4 fill-current" /></span>}
      </Link>
      {upcoming ? <UpcomingNotifyButton anime={anime} compact className="absolute bottom-3 right-3" /> : null}
      </div>
    );
  }

  return (
    <div className="min-w-0" style={{ contentVisibility: 'auto', containIntrinsicSize: compact ? '210px 294px' : '230px 345px' }}>
    <Link to={path} onPointerEnter={prepare} onFocus={prepare} onPointerDown={prepare} className="group block min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
      <div className={`sn-explore-poster relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#111114] ${compact ? 'aspect-[5/7]' : 'aspect-[2/3]'}`}>
        {imageNode}<div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_42%,rgba(5,5,7,0.94)_100%)]" />
        <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white/78">EP {episodeLabel}</span>
        {!upcoming ? <span className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Play className="ml-0.5 h-4 w-4 fill-current" /></span> : null}
        <div className="absolute inset-x-0 bottom-0 p-3.5">
          <h3 className={`${compact ? 'text-[13px]' : 'text-[15px]'} line-clamp-2 font-semibold leading-tight text-white`}>{title}</h3>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-white/58">
            <span className="truncate">{formatFor(anime)}{statusFor(anime) ? ` · ${statusFor(anime)}` : ''}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-amber-300"><Star className="h-3 w-3 fill-current" />{scoreFor(anime) ? scoreFor(anime).toFixed(1) : 'N/A'}</span>
          </div>
        </div>
      </div>
      {!compact ? <p className="mt-2 truncate text-xs font-medium text-white/48">{genres.join(' · ') || yearFor(anime) || 'Anime'}</p> : null}
    </Link>
    {upcoming ? <UpcomingNotifyButton anime={anime} compact fullWidth className="mt-2" /> : null}
    </div>
  );
});

function ExploreSkeleton() {
  return (
    <DesktopLoadingProgress label="Loading anime catalog" percent={46} detail="Restoring saved titles while the catalog refreshes.">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => <div key={index} className="aspect-[2/3] animate-pulse rounded-xl bg-white/[0.045] motion-reduce:animate-none" />)}
      </div>
    </DesktopLoadingProgress>
  );
}

export default function DesktopExplore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSeason = getCurrentAnimeSeason();
  const currentYear = new Date().getFullYear();
  const mode = (modes.some((item) => item.mode === searchParams.get('mode')) ? searchParams.get('mode') : 'trending') as ExploreMode;
  const query = String(searchParams.get('q') || '').trim();
  const genre = searchParams.get('genre') || 'Any';
  const format = searchParams.get('format') || 'Any';
  const status = searchParams.get('status') || 'Any';
  const sort = searchParams.get('order') || 'best';
  const year = Math.max(1960, Math.min(currentYear + 1, Number(searchParams.get('year') || currentYear)));
  const density = (['poster', 'compact', 'list'].includes(searchParams.get('view') || '') ? searchParams.get('view') : 'poster') as ExploreDensity;
  const [input, setInput] = useState(query);
  const catalogCacheKey = useMemo(() => exploreCatalogCacheKey({ mode, query, year, format, genre, status, sort }), [format, genre, mode, query, sort, status, year]);

  useEffect(() => setInput(query), [query]);

  const catalogQuery = useQuery({
    queryKey: ['desktop-explore-v2', mode, query, year, format, genre, status, sort],
    queryFn: async () => {
      const response = await loadExploreCatalog({ mode, query, year, format, genre, status, sort });
      writeDesktopExploreCatalog(catalogCacheKey, response);
      return response;
    },
    initialData: () => readDesktopExploreCatalog(catalogCacheKey)?.data,
    initialDataUpdatedAt: () => readDesktopExploreCatalog(catalogCacheKey)?.savedAt,
    staleTime: query ? 1000 * 60 * 10 : 1000 * 60 * 25,
    gcTime: 1000 * 60 * 90,
    retry: (count, error) => count < 2 && !/invalid|cancel/i.test(String((error as Error)?.message || '')),
    retryDelay: (attempt) => 250 + attempt * 500,
  });

  const results = useMemo(() => {
    let items = uniqueAnime(catalogQuery.data?.data || []);
    if (genre !== 'Any') items = items.filter((anime) => genresFor(anime).some((item) => item.toLowerCase() === genre.toLowerCase()));
    if (format !== 'Any') items = items.filter((anime) => formatFor(anime).toLowerCase() === format.toLowerCase());
    if (status !== 'Any') items = items.filter((anime) => statusFor(anime) === status);
    return localSort(items, sort);
  }, [catalogQuery.data?.data, format, genre, sort, status]);

  const setParam = (key: string, value: string, defaultValue = '') => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const chooseMode = (nextMode: ExploreMode) => {
    const next = new URLSearchParams(searchParams);
    next.set('mode', nextMode);
    next.delete('q');
    if (nextMode === 'year') next.set('year', String(year));
    setSearchParams(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    const value = input.trim();
    if (value) next.set('q', value);
    else next.delete('q');
    setSearchParams(next);
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    ['genre', 'format', 'status', 'order'].forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
  };

  const activeFilters = [genre !== 'Any' ? genre : '', format !== 'Any' ? format : '', status !== 'Any' ? status : ''].filter(Boolean);
  const selectedMode = modes.find((item) => item.mode === mode) || modes[1];
  const gridClass = density === 'list' ? 'grid gap-3' : density === 'compact' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7' : 'grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6';

  return (
    <div className="min-h-full px-6 pb-16 pt-5 text-white">
      <Seo title="Explore anime - StreamNyaa" description="Search and browse current anime." />
      <section className="rounded-xl border border-white/[0.07] bg-[#0d0d10] p-5">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><h1 className="text-3xl font-semibold tracking-tight">Explore anime</h1><p className="mt-1 text-sm text-white/52">Live categories, exact search, and aired-episode availability.</p></div>
          <form onSubmit={submit} className="flex w-full max-w-2xl items-center gap-2" role="search">
            <label className="sn-input flex h-11 min-w-0 flex-1 items-center gap-3 px-4"><Search className="h-5 w-5 shrink-0 text-white/42" /><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Search titles and aliases" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/36" />{input ? <button type="button" onClick={() => setInput('')} className="grid h-8 w-8 place-items-center rounded-md text-white/48 hover:bg-white/[0.06] hover:text-white" aria-label="Clear search"><X className="h-4 w-4" /></button> : null}</label>
            <button type="submit" className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-[#ff3558]">Search</button>
          </form>
        </div>
      </section>

      <section className="sticky top-0 z-20 mt-4 rounded-xl border border-white/[0.07] bg-[#0d0d10]/95 p-3 backdrop-blur-md">
        <div className="sn-scroll-rail flex gap-2 pb-1">
          {modes.map((item) => { const Icon = item.icon; const selected = item.mode === mode && !query; return <button key={item.mode} type="button" onClick={() => chooseMode(item.mode)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors ${selected ? 'bg-primary text-white' : 'bg-white/[0.045] text-white/58 hover:bg-white/[0.075] hover:text-white'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
          <SlidersHorizontal className="mx-1 h-4 w-4 text-white/38" />
          <PremiumSelect ariaLabel="Genre" value={genre} options={genreOptions.map((value) => ({ label: value === 'Any' ? 'All genres' : value, value }))} onChange={(value) => setParam('genre', value, 'Any')} />
          <PremiumSelect ariaLabel="Format" value={format} options={formatOptions.map((value) => ({ label: value === 'Any' ? 'All formats' : value, value }))} onChange={(value) => setParam('format', value, 'Any')} />
          <PremiumSelect ariaLabel="Status" value={status} options={statusOptions.map((value) => ({ label: value === 'Any' ? 'Any status' : value, value }))} onChange={(value) => setParam('status', value, 'Any')} />
          <PremiumSelect ariaLabel="Sort" value={sort} options={sortOptions} onChange={(value) => setParam('order', value, 'best')} />
          {mode === 'year' ? <PremiumSelect ariaLabel="Year" value={String(year)} options={Array.from({ length: 30 }, (_, index) => ({ label: String(currentYear + 1 - index), value: String(currentYear + 1 - index) }))} onChange={(value) => setParam('year', value)} /> : null}
          {activeFilters.length ? <button type="button" onClick={clearFilters} className="h-10 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary/10">Clear filters</button> : null}
          <div className="ml-auto flex rounded-lg bg-white/[0.045] p-1" aria-label="Result layout">
            {([['poster', Grid2X2, 'Poster grid'], ['compact', Grid2X2, 'Compact grid'], ['list', List, 'List']] as const).map(([value, Icon, label]) => <button key={value} type="button" onClick={() => setParam('view', value, 'poster')} className={`grid h-8 w-9 place-items-center rounded-md ${density === value ? 'bg-white/[0.12] text-white' : 'text-white/42 hover:text-white'}`} aria-label={label}><Icon className={value === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /></button>)}
          </div>
        </div>
      </section>

      <div className="mt-6 flex items-end justify-between gap-4">
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-semibold">{query ? `Results for “${query}”` : selectedMode.label}</h2>{catalogQuery.isFetching && catalogQuery.data ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/46"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />Refreshing</span> : null}</div><p className="mt-1 text-sm text-white/48">{results.length ? `${results.length} anime title${results.length === 1 ? '' : 's'}` : `${currentSeason.season} ${currentSeason.year}`}</p></div>
        {catalogQuery.isError ? <button type="button" onClick={() => void catalogQuery.refetch()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white/[0.06] px-3 text-sm font-semibold text-white/72 hover:bg-white/[0.09]"><RefreshCw className="h-4 w-4" />Retry</button> : null}
      </div>

      {catalogQuery.isLoading && !catalogQuery.data ? <div className="mt-5"><ExploreSkeleton /></div> : null}
      {catalogQuery.isError && !catalogQuery.data ? <div className="mt-5"><DesktopLoadingProgress label="Reconnecting to the anime catalog" percent={68} detail="The page remains usable while the catalog refreshes." /><div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] px-4 py-3"><span className="text-sm text-white/52">Refresh paused. Filters and search remain available.</span><button type="button" onClick={() => void catalogQuery.refetch()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" />Retry now</button></div></div> : null}
      {catalogQuery.data && !results.length ? <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-6 py-12 text-center"><Search className="mx-auto h-6 w-6 text-white/34" /><h3 className="mt-3 font-semibold text-white">No matching anime</h3><p className="mt-1 text-sm text-white/48">Clear a filter or try another title.</p></div> : null}
      {results.length ? <div className={`${gridClass} mt-5`}>{results.map((anime, index) => <ExploreAnimeCard key={anime?.anilist_id || anime?.id || anime?.mal_id || anime?.title} anime={anime} index={index} density={density} />)}</div> : null}

      <section className="mt-8 grid gap-3 md:grid-cols-3">
        <button type="button" onClick={() => chooseMode('new')} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-left hover:bg-white/[0.05]"><CalendarDays className="h-5 w-5 text-primary" /><span><span className="block font-semibold">Latest aired episodes</span><span className="mt-0.5 block text-xs text-white/46">See what became available most recently.</span></span></button>
        <button type="button" onClick={() => chooseMode('seasonal')} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-left hover:bg-white/[0.05]"><Tv className="h-5 w-5 text-primary" /><span><span className="block font-semibold">Current season</span><span className="mt-0.5 block text-xs text-white/46">Browse verified {currentSeason.season} {currentSeason.year} titles.</span></span></button>
        <button type="button" onClick={() => chooseMode('top')} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-left hover:bg-white/[0.05]"><Star className="h-5 w-5 text-primary" /><span><span className="block font-semibold">Top rated</span><span className="mt-0.5 block text-xs text-white/46">Sort verified titles by community score.</span></span></button>
      </section>
    </div>
  );
}
