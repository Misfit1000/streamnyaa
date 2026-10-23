import {useRecentReleaseFeed} from '../lib/useRecentReleaseFeed';
import RecentReleaseStatus from '../components/RecentReleaseStatus';
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchGenres } from '../api/jikan';
import { catalogOptions, catalogRequest, mediaKey, uniqueMedia } from '../api/webCatalog';
import DataStatus from '../components/DataStatus';
import { useStore } from '../store/useStore';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import { slugifyTitle } from '../lib/slug';
import { Filter, Search as SearchIcon } from 'lucide-react';
import { isDesktopApp } from '../lib/desktop';

const DESKTOP_EXPLORE_FALLBACK = [
  {
    mal_id: 21,
    title: 'ONE PIECE',
    episodes: 1161,
    score: 8.7,
    images: { jpg: { image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg', large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg' }, webp: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg' } },
  },
  {
    mal_id: 51553,
    title: 'Witch Hat Atelier',
    episodes: 13,
    score: 8.6,
    images: { jpg: { image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx147105-rwOX8qyUy8gV.jpg', large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx147105-rwOX8qyUy8gV.jpg' }, webp: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx147105-rwOX8qyUy8gV.jpg' } },
  },
  {
    mal_id: 61316,
    title: 'Re:ZERO -Starting Life in Another World- Season 4',
    episodes: 19,
    score: 8.7,
    images: { jpg: { image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx189046-yaHWtS5FII46.jpg', large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx189046-yaHWtS5FII46.jpg' }, webp: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx189046-yaHWtS5FII46.jpg' } },
  },
  {
    mal_id: 59983,
    title: 'Wistoria: Wand and Sword Season 2',
    episodes: 12,
    score: 8.1,
    images: { jpg: { image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx182300-IYkq5KrkQq1V.jpg', large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx182300-IYkq5KrkQq1V.jpg' }, webp: { large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx182300-IYkq5KrkQq1V.jpg' } },
  },
];

export default function Search() {
  const desktop = isDesktopApp();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const nsfwMode = useStore(state => state.nsfwMode);
  const type = searchParams.get('type') || '', status = searchParams.get('status') || '';
  const rating = searchParams.get('rating') || '', genre = searchParams.get('genre') || '';
  const committedQuery = searchParams.get('q') || '';
  const request = useMemo(() => catalogRequest(searchParams, nsfwMode), [searchParams.toString(), nsfwMode]);
  const genresQuery = useQuery({ queryKey: ['genres', nsfwMode], queryFn: fetchGenres });
  const genresData = genresQuery.data;
  const legacyResults = useInfiniteQuery({...catalogOptions(request),enabled:request.feed!=='recent'});
  const releaseFeed=useRecentReleaseFeed({track:'sub',adult:nsfwMode,before:request.before,type:request.type,status:request.status,genre:request.genre,enabled:request.feed==='recent'});
  const results=request.feed==='recent'?releaseFeed:legacyResults;
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = results;
  const allAnimes = useMemo(() => request.feed==='recent'?releaseFeed.items:uniqueMedia(data?.pages.flatMap(page => page.data) || []), [data,request.feed,releaseFeed.items]);
  const visibleAnimes = desktop && !committedQuery && allAnimes.length === 0 && !isLoading && !results.isError
    ? DESKTOP_EXPLORE_FALLBACK : allAnimes;
  const sort = searchParams.get('sort') || '';
  const hasSimpleGenreFilter = Boolean(genre) && !query && !type && !status && !rating;
  const hasPopularFilter = sort === 'popular' && !query && !genre && !type && !status && !rating;
  const canonicalPath = hasSimpleGenreFilter
    ? `/anime/genre/${slugifyTitle(genre)}`
    : hasPopularFilter
      ? '/anime/popular'
      : '/search';
  const seoTitle = hasSimpleGenreFilter
    ? `${genre} Anime | StreamNyaa`
    : hasPopularFilter
      ? 'Popular Anime | StreamNyaa'
      : 'Search Anime | StreamNyaa';
  const seoDescription = hasSimpleGenreFilter
    ? `Browse ${genre} anime on StreamNyaa with title pages, related anime, schedules, and download search options.`
    : hasPopularFilter
      ? 'Browse popular anime on StreamNyaa with title pages, related anime, schedules, and download search options.'
      : 'Search anime on StreamNyaa by title, genre, type, status, and rating with clean anime pages and source search options.';
  const activeFilterCount = [type, status, rating, genre, sort].filter(Boolean).length;

  useEffect(() => { setQuery(committedQuery); }, [committedQuery]);
  useEffect(() => {
    if (query.trim() === committedQuery) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (query.trim()) params.set('q', query.trim()); else params.delete('q');
      params.delete('before'); setSearchParams(params, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, committedQuery, searchParams, setSearchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    params.delete('before');
    if (query) params.set('q', query.trim());
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    if (rating) params.set('rating', rating);
    if (genre) params.set('genre', genre);
    const currentSort = searchParams.get('sort');
    if (currentSort) params.set('sort', currentSort);
    setSearchParams(params);
  };

  const handleFilterChange = (filterName: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(filterName, value);
    else params.delete(filterName);
    setSearchParams(params);
  };

  return (
    <div className={`container mx-auto px-4 py-8 ${desktop ? 'md:px-10' : ''}`}>
      <Seo
        title={seoTitle}
        description={seoDescription}
        canonicalPath={canonicalPath}
      />
      {!desktop && <h1 className="mb-5 text-2xl font-black">{request.query ? 'Search anime' : ({recent:'Recently updated',trending:'Trending now',upcoming:'Upcoming anime',score:'Strongest airing picks',popular:'Popular anime',search:'Browse anime'})[request.feed]}</h1>}
      {request.feed==='recent'&&<RecentReleaseStatus page={releaseFeed.latest} fetching={releaseFeed.isFetching} retry={()=>{void (releaseFeed.hasNextPage?releaseFeed.fetchNextPage():releaseFeed.refetch());}}/>}
      {desktop ? (
        <div className="mb-8 rounded-3xl border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-6 shadow-2xl shadow-black/20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Explore</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Anime discovery</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
                Search titles, narrow by status or genre, and open the desktop watch flow without leaving the app shell.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-black text-white/60">
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">{visibleAnimes.length} visible</span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">{activeFilterCount} filters</span>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Filters Sidebar */}
        <div className="w-full md:w-64 shrink-0 space-y-6">
          <div className={`${desktop ? 'rounded-3xl border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-5 shadow-xl shadow-black/15' : 'bg-secondary/50 rounded-xl p-4 border border-border'}`}>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Filter className="w-5 h-5" /> Filter
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Type</label>
                <select 
                  value={type} 
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">All</option>
                  <option value="tv">TV</option>
                  <option value="movie">Movie</option>
                  <option value="ova">OVA</option>
                  <option value="special">Special</option>
                  <option value="ona">ONA</option>
                  <option value="music">Music</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Status</label>
                <select 
                  value={status} 
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">All</option>
                  <option value="airing">Airing</option>
                  <option value="complete">Complete</option>
                  <option value="upcoming">Upcoming</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Rating</label>
                <select 
                  value={rating} 
                  onChange={(e) => handleFilterChange('rating', e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">All</option>
                  <option value="g">G - All Ages</option>
                  <option value="pg">PG - Children</option>
                  <option value="pg13">PG-13 - Teens 13 or older</option>
                  <option value="r17">R - 17+ (violence & profanity)</option>
                  <option value="r">R+ - Mild Nudity</option>
                  <option value="rx">Rx - Hentai</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Genre</label>
                <select 
                  value={genre} 
                  onChange={(e) => { handleFilterChange('genre', e.target.value); }}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">All</option>
                  {genresData?.data?.map((g: any) => (
                    <option key={g.mal_id} value={g.name}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1">
          <form onSubmit={handleSearch} className="relative mb-8">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search for anime..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-12 pl-12 pr-4 rounded-xl bg-secondary/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-base text-foreground transition-all"
            />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              Search
            </button>
          </form>

          <DataStatus label="Anime results" error={results.isError} fetching={results.isFetching && !isLoading && !isFetchingNextPage} retry={() => void results.refetch()}/>
          {isLoading ? <div role="status" className="py-20 text-center text-muted-foreground">Loading anime…</div>
            : visibleAnimes.length === 0 ? <div className="py-20 text-center text-muted-foreground">{request.feed==='recent'&&!releaseFeed.complete?'Release coverage is still being checked.':results.isError ? 'Anime results are temporarily unavailable.' : hasNextPage ? 'No matching titles in this page. More results are available below.' : 'No anime found matching your criteria.'}</div>
            : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-6">{visibleAnimes.map((anime: any) => <AnimeCard key={mediaKey(anime)} anime={anime}/>)}</div>}
          {hasNextPage && <div className="mt-10 flex justify-center"><button onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} className="rounded-full bg-secondary px-8 py-3 font-medium disabled:opacity-50">{isFetchingNextPage ? 'Loading…' : results.isFetchNextPageError ? 'Retry next page' : 'Load More'}</button></div>}
        </div>
      </div>
    </div>
  );
}
