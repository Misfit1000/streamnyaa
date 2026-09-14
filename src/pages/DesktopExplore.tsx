import DesktopBookmarkButton from '../components/DesktopBookmarkButton';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { CalendarDays, Check, ChevronDown, Clapperboard, Grid2X2, List, Loader2, Play, RefreshCw, Search, SlidersHorizontal, Sparkles, Star, TrendingUp, Tv, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../components/Seo';
import DesktopCatalogActions from '../components/DesktopCatalogActions';
import { readExplorePresets, writeExplorePresets } from '../lib/desktopExplorePresets';
import { libraryOrganizationEvent, organizationIdentity, readLibraryOrganization } from '../lib/desktopLibraryOrganization';
import DesktopLoadingProgress from '../components/DesktopLoadingProgress';
import UpcomingNotifyButton from '../components/UpcomingNotifyButton';
import { getCurrentAnimeSeason } from '../lib/currentSeason';
import { desktopWatchOrBrowsePath, desktopWatchPath, isUpcomingAnime } from '../lib/desktopAnimeRoute';
import { desktopPosterCandidates } from '../lib/desktopArtwork';
import { episodeAvailabilityLabel } from '../lib/animeEpisodes';
import { preloadDesktopRoute, preloadDesktopWatchData } from '../lib/desktopRoutePreload';
import { primeDesktopWatchSnapshot, readCachedWatchTitles } from '../lib/desktopWatchSnapshot';
import { readCachedExploreTitles, exploreCatalogCacheKey, readDesktopExploreCatalog, writeDesktopExploreCatalog } from '../lib/desktopExploreCache';
import { jikanAdultTitle, fetchExplorePage, type ExplorePage, type ExploreRequest, type ExploreService } from '../api/desktopExplore';
import { useStore } from '../store/useStore';

type ExploreMode = 'new' | 'trending' | 'popular' | 'top' | 'airing' | 'seasonal' | 'upcoming' | 'year' | 'ranking';
type ExploreDensity = 'poster' | 'compact' | 'list';
type SelectOption = { label: string; value: string };

const modes: Array<{ mode: ExploreMode; label: string; icon: typeof Sparkles }> = [
  { mode: 'new', label: 'New episodes', icon: CalendarDays },
  { mode: 'trending', label: 'Trending', icon: Sparkles },
  { mode: 'airing', label: 'Airing now', icon: Tv },
  { mode: 'seasonal', label: 'This season', icon: CalendarDays },
  { mode: 'popular', label: 'Popular', icon: Star },
  { mode: 'top', label: 'Top rated', icon: TrendingUp },
  { mode: 'ranking', label: 'Top 100', icon: Star },
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
  if (/NOT_YET|UPCOMING/.test(value)) return 'Upcoming';
  if (/FINISHED|COMPLETED/.test(value)) return 'Completed';
  if (/RELEASING|AIRING/.test(value)) return 'Airing';
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
  const path = anime.recentFeedKind === 'listed' && anime.listedEpisode ? desktopWatchPath(anime, {ep:anime.listedEpisode}) : desktopWatchOrBrowsePath(anime);
  const genres = genresFor(anime).slice(0, 2);
  const compact = density === 'compact';
  const episodeLabel = anime.recentFeedKind === 'listed' ? (anime.listedEpisode ? `Listed episode ${anime.listedEpisode}` : 'Recently listed') : episodeAvailabilityLabel(anime);
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
        <span className="w-11" />
      </Link>
      {upcoming ? <UpcomingNotifyButton anime={anime} compact className="absolute bottom-3 right-3" /> : null}
      <DesktopBookmarkButton anime={anime} className="absolute right-3 top-3 z-20" />
      </div>
    );
  }

  return (
    <div className="relative min-w-0" style={{ contentVisibility: 'auto', containIntrinsicSize: compact ? '210px 294px' : '230px 345px' }}>
    <Link to={path} onPointerEnter={prepare} onFocus={prepare} onPointerDown={prepare} className="group block min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
      <div className={`sn-explore-poster relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#111114] ${compact ? 'aspect-[5/7]' : 'aspect-[2/3]'}`}>
        {imageNode}<div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_42%,rgba(5,5,7,0.94)_100%)]" />
        <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white/78">EP {episodeLabel}</span>

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
    <DesktopBookmarkButton anime={anime} className="absolute right-3 top-3 z-20" />
    </div>
  );
});

function ExploreSkeleton() {
  return (
    <DesktopLoadingProgress label="Loading anime catalog" detail="Restoring saved titles while the catalog refreshes.">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => <div key={index} className="aspect-[2/3] animate-pulse rounded-xl bg-white/[0.045] motion-reduce:animate-none" />)}
      </div>
    </DesktopLoadingProgress>
  );
}

export default function DesktopExplore() {
  const [presets, setPresets] = useState(readExplorePresets);
  const [presetName, setPresetName] = useState('');
  const [presetError, setPresetError] = useState('');
  const [organization, setOrganization] = useState(readLibraryOrganization);
  useEffect(() => {
    const refresh = () => setOrganization(readLibraryOrganization());
    window.addEventListener(libraryOrganizationEvent, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(libraryOrganizationEvent, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSeason = getCurrentAnimeSeason();
  const currentYear = new Date().getFullYear();
  const mode = (modes.some((item) => item.mode === searchParams.get('mode')) ? searchParams.get('mode') : 'popular') as ExploreMode;
  const query = String(searchParams.get('q') || '').trim();
  const genre = searchParams.get('genre') || 'Any';
  const format = searchParams.get('format') || 'Any';
  const status = searchParams.get('status') || 'Any';
  const sort = searchParams.get('order') || 'best';
  const year = Math.max(1960, Math.min(currentYear + 1, Math.floor(Number(searchParams.get('year')) || currentYear)));
  const density = (['poster', 'compact', 'list'].includes(searchParams.get('view') || '') ? searchParams.get('view') : 'poster') as ExploreDensity;
  const ranking = mode === 'ranking';
  const hideCompleted = searchParams.get('hideCompleted') === '1';
  const service: ExploreService = 'anilist';
  const block = Math.max(1, Math.min(1000, Math.floor(Number(searchParams.get('page')) || 1)));
  const adult = useStore((state) => state.nsfwMode);
  const season = searchParams.get('season') || currentSeason.season;
  const releaseDays = ['7', '30', '90'].includes(searchParams.get('released') || '') ? searchParams.get('released')! : 'all';
  const releasedAfter = useMemo(() => releaseDays === 'all' ? undefined : new Date(Date.now() - Number(releaseDays) * 86_400_000).toISOString().slice(0, 10), [releaseDays]);
  const request = useMemo<ExploreRequest>(() => ({ mode, query, genre, format, status, sort, service, adult,
    year: ['seasonal', 'year'].includes(mode) || (ranking && searchParams.has('year')) ? year : undefined,
    season: mode === 'seasonal' ? season : undefined,
    releasedAfter,
  }), [mode, query, genre, format, status, sort, service, adult, year, season, releasedAfter, ranking, searchParams]);
  const catalogCacheKey = exploreCatalogCacheKey({ ...request, block: ranking ? block : 1, version: 5 });
  const snapshot = useRef({ key: '', before: 0 });
  if (snapshot.current.key !== catalogCacheKey) {
    const saved = readDesktopExploreCatalog(catalogCacheKey)?.data?.pages?.[0]?.before;
    snapshot.current = { key: catalogCacheKey, before: Number.isSafeInteger(saved) && saved > 0 && saved <= Date.now() / 1000 ? saved : Math.floor(Date.now() / 1000) };
  }
  const sentinel = useRef<HTMLDivElement>(null);
  const requestBefore = snapshot.current.before;
  const firstPage = ranking ? (block - 1) * 4 + 1 : 1;
  const catalogQuery = useInfiniteQuery({
    queryKey: ['desktop-explore-v3', catalogCacheKey],
    initialPageParam: { page: firstPage, service: service as ExploreService },
    queryFn: async ({ signal, pageParam }) => {
      const result = await fetchExplorePage({ ...request, service: pageParam.service, before: requestBefore,
        allowFallback: pageParam.page === 1 }, pageParam.page, signal);
      return { ...result, fallback: result.fallback || (!ranking && result.service !== service) };
    },
    getNextPageParam: (last, pages) => last.paginationVersion === 2 && last.hasNextPage && (!ranking || pages.length < 4)
      ? { page: last.page + 1, service: last.service } : undefined,
    initialData: () => {
      const cached = readDesktopExploreCatalog(catalogCacheKey)?.data;
      if (!Array.isArray(cached?.pages) || !cached.pages.length || !Array.isArray(cached.pageParams)) return undefined;
      const savedService = cached.pages[0].service;
      if (savedService !== service && savedService !== 'mal') return undefined;
      if (!cached.pages.every((page: ExplorePage, i: number) => page.service === savedService && page.page === firstPage + i
        && Array.isArray(page.data) && typeof page.hasNextPage === 'boolean') || cached.pages.length !== cached.pageParams.length) return undefined;
      return { pages: cached.pages as ExplorePage[], pageParams: cached.pages.map((page: ExplorePage, index: number) => ({ page: page.page, service: index === 0 ? service as ExploreService : page.service })) };
    },
    initialDataUpdatedAt: () => readDesktopExploreCatalog(catalogCacheKey)?.savedAt,
    staleTime: state => state.state.data?.pages[0]?.paginationVersion !== 2 ? 0 : query ? 1000 * 60 * 10 : 1000 * 60 * 25,
    gcTime: 1000 * 60 * 90,
    retry: false,
    retryDelay: (attempt) => 250 + attempt * 500,
    refetchOnReconnect: true,
    refetchInterval: query => query.state.error || query.state.data?.pages[0]?.fallback ? 300_000 : false,
  });

  useEffect(() => {
    if (!catalogQuery.data) return;
    const pages = catalogQuery.data.pages.slice(0, 12);
    writeDesktopExploreCatalog(catalogCacheKey, { data: pages.flatMap((page) => page.data), pages,
      pageParams: catalogQuery.data.pageParams.slice(0, 12) });
  }, [catalogCacheKey, catalogQuery.data]);

  useEffect(() => {
    if (!catalogQuery.hasNextPage || catalogQuery.isFetching || catalogQuery.isError || navigator.onLine === false) return;
    if (ranking) { void catalogQuery.fetchNextPage(); return; }
    if (!sentinel.current || typeof IntersectionObserver === 'undefined') return;
    // Do not drain an entire filtered schedule while the sentinel stays visible.
    // A deliberate Load more action can continue when three lanes add no match.
    const recentPages = catalogQuery.data?.pages.slice(-3) || [];
    const matches = (anime: any) => (genre === 'Any' || genresFor(anime).some((item) => item.toLowerCase() === genre.toLowerCase()))
      && (format === 'Any' || formatFor(anime).toLowerCase() === format.toLowerCase())
      && (status === 'Any' || statusFor(anime) === status);
    if (recentPages.length === 3 && recentPages.every((page) => !page.data.some(matches))) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void catalogQuery.fetchNextPage({ cancelRefetch: false });
    }, { rootMargin: '500px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [ranking, genre, format, status, catalogQuery.hasNextPage, catalogQuery.isFetching, catalogQuery.isError, catalogQuery.fetchNextPage, catalogQuery.data]);

  const loadedItems = useMemo(() => uniqueAnime(catalogQuery.data?.pages.flatMap((page) => page.data) || []), [catalogQuery.data]);
  const rankPositions = useMemo(() => new Map(loadedItems.map((anime, index) => [organizationIdentity(anime), Number(anime.rankingPosition) || (block - 1) * 100 + index + 1])), [loadedItems, block]);
  const results = useMemo(() => {
    // Preserve item references so appending a page does not invalidate every
    // memoized poster card just to attach its rank.
    let items = loadedItems;
    if (hideCompleted) items = items.filter((anime) => organization.entries[organizationIdentity(anime)]?.status !== 'Completed');
    if (ranking) return items; // Service filters run before ranking/pagination.
    if (genre !== 'Any') items = items.filter((anime) => genresFor(anime).some((item) => item.toLowerCase() === genre.toLowerCase()));
    if (format !== 'Any') items = items.filter((anime) => formatFor(anime).toLowerCase() === format.toLowerCase());
    if (status !== 'Any') items = items.filter((anime) => statusFor(anime) === status);
    return items;
  }, [loadedItems, format, genre, status, ranking, hideCompleted, organization]);

  const savedTitles = useStore(state => state.myList);
  const favoriteTitles = useStore(state => state.likedAnimes);
  const localMatches = useMemo(() => {
    if (!query || !catalogQuery.isError || results.length) return [];
    const tokens = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return uniqueAnime([...savedTitles, ...favoriteTitles, ...readCachedWatchTitles(), ...readCachedExploreTitles()])
      .filter(anime => {
        const titles = [anime.title, anime.title_english, anime.title_romaji, anime.title_native, ...(anime.synonyms || [])].filter(value => typeof value === 'string').join(' ').toLocaleLowerCase();
        const premiere = anime.aired?.from || anime.startDate;
        return tokens.every(token => titles.includes(token)) && (adult || !jikanAdultTitle(anime))
          && (genre === 'Any' || genresFor(anime).some(value => value.toLowerCase() === genre.toLowerCase()))
          && (format === 'Any' || formatFor(anime).toLowerCase() === format.toLowerCase())
          && (status === 'Any' || statusFor(anime) === status)
          && (!request.year || Number(anime.year || anime.seasonYear) === request.year)
          && (!request.season || String(anime.season).toLowerCase() === request.season.toLowerCase())
          && (!releasedAfter || (typeof premiere === 'string' && Number.isFinite(Date.parse(premiere)) && Date.parse(premiere) >= Date.parse(releasedAfter)))
          && (!hideCompleted || organization.entries[organizationIdentity(anime)]?.status !== 'Completed');
      }).slice(0, 100);
  }, [query, catalogQuery.isError, results.length, savedTitles, favoriteTitles, adult, genre, format, status, request.year, request.season, releasedAfter, hideCompleted, organization]);

  const rankingFilterKeys = ['genre','format','status','order','year','released','hideCompleted'] as const;
  useEffect(() => {
    if (!ranking) return;
    try { localStorage.setItem(`streamnyaa.desktop.rankingFilters.v1.${service}`, new URLSearchParams([...searchParams.entries()].filter(([key]) => ['genre','format','status','order','year','released','hideCompleted'].includes(key))).toString()); } catch { /* Optional preference only. */ }
  }, [ranking, service, searchParams]);

  const setParam = (key: string, value: string, defaultValue = '') => {
    const next = new URLSearchParams(searchParams);
    if (!['page', 'view'].includes(key)) next.delete('page');
    if (key === 'ranking' && value !== service) {
      try { const stored = localStorage.getItem(`streamnyaa.desktop.rankingFilters.v1.${value}`); if (stored !== null && stored.length < 2000) { const restored = new URLSearchParams(stored); rankingFilterKeys.forEach(key => { next.delete(key); if (restored.has(key)) next.set(key,restored.get(key)!); }); } } catch { /* Retain current filters if storage is unavailable. */ }
      if (value === 'mal' && next.get('format') === 'TV Short') next.delete('format');
    }
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const chooseMode = (nextMode: ExploreMode) => {
    const next = new URLSearchParams(searchParams);
    next.set('mode', nextMode);
    next.delete('q');
    next.delete('page');
    if (nextMode === 'year') next.set('year', String(year));
    setSearchParams(next);
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    ['genre', 'format', 'status', 'order', 'page', 'released', ...(ranking ? ['year'] : [])].forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
  };

  const activeFilters = [genre !== 'Any' ? genre : '', format !== 'Any' ? format : '', status !== 'Any' ? status : '', ranking && searchParams.has('year') ? String(year) : '', sort !== 'best' ? sort : '', releaseDays !== 'all' ? releaseDays : ''].filter(Boolean);
  const selectedMode = modes.find((item) => item.mode === mode) || modes[1];
  const gridClass = density === 'list' ? 'grid gap-3' : density === 'compact' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7' : 'grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6';

  return (
    <div className="min-h-full px-6 pb-16 pt-5 text-white">
      <Seo title="Explore anime - StreamNyaa" description="Search and browse current anime." />
      <section className="rounded-xl border border-white/[0.07] bg-[#0d0d10] p-5">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><h1 className="text-3xl font-semibold tracking-tight">Explore anime</h1><p className="mt-1 text-sm text-white/52">Find something worth watching.</p></div>
          <button type="button" onClick={() => { const input = document.getElementById('desktop-global-search') as HTMLInputElement | null; input?.focus(); input?.select(); }} className="sn-secondary-action">
            <Search className="h-4 w-4" />{query ? 'Edit search' : 'Search anime'}
          </button>
        </div>
      </section>

      <section className="sticky top-0 z-20 mt-4 rounded-xl border border-white/[0.07] bg-[#0d0d10]/95 p-3 backdrop-blur-md">
        <div className="sn-scroll-rail flex gap-2 pb-1">
          {modes.map((item) => { const Icon = item.icon; const selected = item.mode === mode && !query; return <button key={item.mode} type="button" onClick={() => chooseMode(item.mode)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors ${selected ? 'bg-primary text-white' : 'bg-white/[0.045] text-white/58 hover:bg-white/[0.075] hover:text-white'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}
        </div>
        <fieldset className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
          <legend className="px-2 text-sm font-semibold">{ranking ? 'Top 100 filters' : 'Catalog filters'}</legend>
          <SlidersHorizontal className="mx-1 h-4 w-4 text-white/38" />
          <label className="flex items-center gap-2 px-2 text-sm text-white/65"><input type="checkbox" checked={hideCompleted} onChange={(event) => setParam('hideCompleted', event.target.checked ? '1' : '')} />Hide marked completed</label>
          <PremiumSelect ariaLabel="Genre" value={genre} options={genreOptions.map((value) => ({ label: value === 'Any' ? 'All genres' : value, value }))} onChange={(value) => setParam('genre', value, 'Any')} />
          <PremiumSelect ariaLabel="Format" value={format} options={formatOptions.map((value) => ({ label: value === 'Any' ? 'All formats' : value, value }))} onChange={(value) => setParam('format', value, 'Any')} />
          <PremiumSelect ariaLabel="Status" value={status} options={statusOptions.map((value) => ({ label: value === 'Any' ? 'Any status' : value, value }))} onChange={(value) => setParam('status', value, 'Any')} />
          <PremiumSelect ariaLabel="Sort" value={sort} options={sortOptions} onChange={(value) => setParam('order', value, 'best')} />
          <PremiumSelect ariaLabel={mode === 'new' ? 'Episode release window' : 'Premiere window'} value={releaseDays} options={[{ value: 'all', label: 'Any release date' }, { value: '7', label: 'Past 7 days' }, { value: '30', label: 'Past 30 days' }, { value: '90', label: 'Past 90 days' }]} onChange={value => setParam('released', value, 'all')} />
          {['year', 'seasonal'].includes(mode) ? <PremiumSelect ariaLabel="Year" value={String(year)} options={Array.from({ length: 70 }, (_, index) => ({ label: String(currentYear + 1 - index), value: String(currentYear + 1 - index) }))} onChange={(value) => setParam('year', value)} /> : null}
          {mode === 'seasonal' ? <PremiumSelect ariaLabel="Season" value={season.toUpperCase()} options={['WINTER', 'SPRING', 'SUMMER', 'FALL'].map((value) => ({ value, label: value[0] + value.slice(1).toLowerCase() }))} onChange={(value) => setParam('season', value)} /> : null}
          {ranking ? <PremiumSelect ariaLabel="Ranking year" value={searchParams.has('year') ? String(year) : 'all'} options={[{ value: 'all', label: 'All years' }, ...Array.from({ length: 70 }, (_, index) => ({ label: String(currentYear - index), value: String(currentYear - index) }))]} onChange={value => setParam('year', value, 'all')} /> : null}

          {activeFilters.length ? <button type="button" onClick={clearFilters} className="h-10 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary/10">Clear filters</button> : null}
          <div className="ml-auto flex rounded-lg bg-white/[0.045] p-1" aria-label="Result layout">
            {([['poster', Grid2X2, 'Poster grid'], ['compact', Grid2X2, 'Compact grid'], ['list', List, 'List']] as const).map(([value, Icon, label]) => <button key={value} type="button" onClick={() => setParam('view', value, 'poster')} className={`grid h-8 w-9 place-items-center rounded-md ${density === value ? 'bg-white/[0.12] text-white' : 'text-white/42 hover:text-white'}`} aria-label={label}><Icon className={value === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /></button>)}
          </div>
        </fieldset>
      </section>

      <div className="mt-3 flex flex-wrap gap-2" aria-label="Active catalog filters">{rankingFilterKeys.filter(key=>searchParams.has(key)).map(key=><button className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/65" key={key} aria-label={`Remove ${key} filter`} onClick={()=>setParam(key,'')}>{key}: {searchParams.get(key)} ×</button>)}</div>
      <details className="mt-3 text-sm text-white/65">
        <summary className="w-fit cursor-pointer rounded-md px-2 py-2 focus-visible:outline focus-visible:outline-primary">Saved filters{presets.length ? ` (${presets.length})` : ''}</summary>
        <div className="flex flex-wrap items-center gap-2 py-2">
          {presets.map((preset) => <div key={preset.name} className="flex items-center rounded-lg bg-white/5">
            <button type="button" className="px-3 py-2 hover:text-white" onClick={() => setSearchParams(preset.query)}>{preset.name}</button>
            <button type="button" aria-label={`Remove saved filter ${preset.name}`} className="p-2 hover:text-white" onClick={() => { try { setPresets(writeExplorePresets(presets.filter((item) => item.name !== preset.name))); setPresetError(''); } catch { setPresetError('Saved filters could not be updated. Storage may be full.'); } }}><X className="h-4 w-4" /></button>
          </div>)}
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const name = presetName.trim(); if (!name) return; if (presets.length >= 12 && !presets.some((item) => item.name === name)) { setPresetError('Remove a saved filter before adding another (maximum 12).'); return; } try { setPresets(writeExplorePresets([...presets.filter((item) => item.name !== name), { name, query: searchParams.toString() }])); setPresetName(''); setPresetError(''); } catch { setPresetError('Filters could not be saved. Storage may be full.'); } }}>
            <input aria-label="Saved filter name" maxLength={40} value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Name these filters" className="rounded-lg bg-white/5 px-3 py-2 text-white outline-none focus:ring-1 focus:ring-primary" />
            <button type="submit" disabled={!presetName.trim()} className="sn-secondary-action disabled:opacity-40">Save filters</button>
          </form>
          {presetError ? <p role="status">{presetError}</p> : null}
        </div>
      </details>

      <div className="mt-6 flex items-end justify-between gap-4">
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-semibold">{query ? `Results for “${query}”` : selectedMode.label}</h2>{catalogQuery.isFetching && catalogQuery.data ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/46"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />Refreshing</span> : null}</div><p className="mt-1 text-sm text-white/48">{results.length ? `${results.length} anime title${results.length === 1 ? '' : 's'}` : ranking ? (request.year ? `Year ${request.year}` : 'All years') : mode === 'seasonal' ? `${season} ${year}` : catalogQuery.isError ? 'Catalog unavailable' : 'Loading catalog…'}</p></div>
        {catalogQuery.isError ? <button type="button" onClick={() => void catalogQuery.refetch()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white/[0.06] px-3 text-sm font-semibold text-white/72 hover:bg-white/[0.09]"><RefreshCw className="h-4 w-4" />Retry</button> : null}
      </div>

      {catalogQuery.isLoading && !catalogQuery.data ? <div className="mt-5"><ExploreSkeleton /></div> : null}
      {!ranking && catalogQuery.data?.pages[0]?.fallback ? <p role="status" className="mt-4 text-sm text-white/65">{catalogQuery.data.pages[0].fallbackLabel || (catalogQuery.data.pages[0].recentFeedKind === 'listed' ? 'Recently added episode listings from MyAnimeList. Listing order is not an exact broadcast timeline; episode video IDs are not used as episode numbers.' : 'Using MyAnimeList through Jikan while AniList is unavailable. Refresh to check AniList again.')}</p> : null}
      {catalogQuery.isError ? <div role="status" className="mt-5 rounded-lg border border-white/[0.07] bg-white/[0.025] px-4 py-3"><span className="text-sm text-white/65">{catalogQuery.error.message} Filters, search and saved results remain available.</span>{!query && ['new', 'trending'].includes(mode) ? <button type="button" onClick={() => chooseMode('popular')} className="ml-3 inline-flex h-9 items-center rounded-lg bg-white/10 px-3 text-sm font-semibold text-white">Browse Popular</button> : null}<button type="button" onClick={() => void catalogQuery.refetch()} className="ml-3 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" />Retry now</button></div> : null}
      {catalogQuery.data && !results.length ? <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-6 py-12 text-center"><Search className="mx-auto h-6 w-6 text-white/34" /><h3 className="mt-3 font-semibold text-white">{catalogQuery.hasNextPage || catalogQuery.isError ? 'No matches in the loaded results yet' : 'No matching anime'}</h3><p className="mt-1 text-sm text-white/48">{catalogQuery.hasNextPage ? 'Load more results or adjust your filters.' : 'Clear a filter or try another title.'}</p></div> : null}
      {ranking ? <p className="mt-3 text-sm text-white/60"><span title={`Ranking source: ${catalogQuery.data?.pages[0]?.service === "mal" ? "MyAnimeList" : "AniList"}`}>Top 100 ⓘ</span> · Positions {(block - 1) * 100 + 1}–{block * 100} · {sort === 'popular' ? 'Most popular' : sort === 'title' ? 'Title A–Z' : sort === 'recent' ? 'Newest first' : 'Highest score'}{catalogQuery.data?.pages[0]?.fetchedAt ? ` · Updated ${new Date(catalogQuery.data.pages[0].fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</p> : null}
      {results.length ? <div className={`${gridClass} mt-5`}>{results.map((anime, index) => <div key={`${anime.anilist_id ? 'anilist' : 'mal'}:${anime?.anilist_id || anime?.mal_id}`} className="min-w-0">{ranking ? <div className="mb-2 flex justify-between text-sm font-semibold"><span>#{rankPositions.get(organizationIdentity(anime))}</span><span className="text-white/60">{anime.rankingScore === undefined ? '—' : (anime.rankingService === 'mal' ? Number(anime.rankingScore) : Number(anime.rankingScore)/10).toFixed(1)}/10</span></div> : null}<ExploreAnimeCard anime={anime} index={index} density={density} /></div>)}</div> : null}
      {query && catalogQuery.isError && !results.length && <section aria-label="Saved search results" className="mt-5">
        <h3 className="text-xl font-semibold">On this device · {localMatches.length} matches</h3>
        <p className="mt-2 text-sm text-white/60">Online search is unavailable. These titles come from your Library and recent catalog cache and match the selected filters. This is not a complete online search or a ranking.</p>
        {localMatches.length ? <div className={`mt-4 ${gridClass}`}>{localMatches.map((anime, index) => <ExploreAnimeCard key={organizationIdentity(anime)} anime={anime} index={index} density={density} />)}</div> : <p className="mt-3 text-sm text-white/60">No matching titles are cached on this device.</p>}
      </section>}
      <div ref={sentinel} className="mt-6 flex min-h-12 items-center justify-center gap-3" aria-live="polite">
        {catalogQuery.isFetchingNextPage ? <span className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" />Loading more anime…</span> : null}
        {catalogQuery.hasNextPage && !catalogQuery.isFetchingNextPage ? <button className="sn-secondary-action" onClick={() => void catalogQuery.fetchNextPage()}>Load more</button> : null}
        {ranking ? <><button className="sn-secondary-action" disabled={block === 1 || catalogQuery.isFetching} onClick={() => setParam('page', String(block - 1))}>Previous 100</button><button className="sn-primary-action disabled:opacity-40 disabled:cursor-not-allowed" disabled={catalogQuery.isFetching || catalogQuery.isError || (catalogQuery.data?.pages.length || 0) < 4 || !catalogQuery.data?.pages.at(-1)?.hasNextPage} onClick={() => setParam('page', String(block + 1))}>Next 100</button></> : null}
        {!catalogQuery.hasNextPage && !catalogQuery.isFetching && results.length > 0 && !ranking ? <span className="text-sm text-white/50">You’ve reached the end.</span> : null}
      </div>

      <section className="mt-8 grid gap-3 md:grid-cols-3">
        <button type="button" onClick={() => chooseMode('new')} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-left hover:bg-white/[0.05]"><CalendarDays className="h-5 w-5 text-primary" /><span><span className="block font-semibold">Latest aired episodes</span><span className="mt-0.5 block text-xs text-white/46">See what became available most recently.</span></span></button>
        <button type="button" onClick={() => chooseMode('seasonal')} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-left hover:bg-white/[0.05]"><Tv className="h-5 w-5 text-primary" /><span><span className="block font-semibold">Current season</span><span className="mt-0.5 block text-xs text-white/46">Browse verified {currentSeason.season} {currentSeason.year} titles.</span></span></button>
        <button type="button" onClick={() => chooseMode('top')} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-left hover:bg-white/[0.05]"><Star className="h-5 w-5 text-primary" /><span><span className="block font-semibold">Top rated</span><span className="mt-0.5 block text-xs text-white/46">Sort verified titles by community score.</span></span></button>
      </section>
    </div>
  );
}
