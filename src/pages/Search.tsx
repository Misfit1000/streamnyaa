import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { searchAnime, fetchGenres } from '../api/jikan';
import AnimeCard from '../components/AnimeCard';
import { Filter, Search as SearchIcon } from 'lucide-react';

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [type, setType] = useState(searchParams.get('type') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [rating, setRating] = useState(searchParams.get('rating') || '');
  const [genre, setGenre] = useState(searchParams.get('genre') || '');

  const { data: genresData } = useQuery({
    queryKey: ['genres'],
    queryFn: fetchGenres,
  });

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['search', query, type, rating, genre, searchParams.get('sort'), status],
    queryFn: ({ pageParam = 1 }) => searchAnime(query, pageParam as number, type, rating, genre, searchParams.get('sort') || '', status),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.pagination.has_next_page ? allPages.length + 1 : undefined;
    }
  });

  const allAnimes = (data?.pages.flatMap(page => page.data) || []).filter((anime, index, self) => 
    index === self.findIndex((a) => a.mal_id === anime.mal_id)
  );

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setType(searchParams.get('type') || '');
    setStatus(searchParams.get('status') || '');
    setRating(searchParams.get('rating') || '');
    setGenre(searchParams.get('genre') || '');
  }, [searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (rating) params.append('rating', rating);
    setSearchParams(params);
  };

  const handleFilterChange = (filterName: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(filterName, value);
    else params.delete(filterName);
    setSearchParams(params);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Filters Sidebar */}
        <div className="w-full md:w-64 shrink-0 space-y-6">
          <div className="bg-secondary/50 rounded-xl p-4 border border-border">
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
                  onChange={(e) => { setGenre(e.target.value); handleFilterChange('genre', e.target.value); }}
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

          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : allAnimes.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              No anime found matching your criteria.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {allAnimes.map((anime: any, index: number) => (
                  <AnimeCard key={`search-${anime.mal_id}-${index}`} anime={anime} />
                ))}
              </div>

              {hasNextPage && (
                <div className="mt-12 flex justify-center">
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="bg-secondary hover:bg-secondary/80 text-foreground px-8 py-3 rounded-full font-medium transition-colors disabled:opacity-50"
                  >
                    {isFetchingNextPage ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
