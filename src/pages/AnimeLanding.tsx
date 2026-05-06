import { Link, useLocation, useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Filter, Flame, Loader2 } from 'lucide-react';
import { fetchAnimeSeason, searchAnime } from '../api/jikan';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import { animePath } from '../lib/slug';

const seasonNames = ['winter', 'spring', 'summer', 'fall'];

function titleCase(value: string) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseSeasonSlug(value = '') {
  const [season, yearValue] = value.toLowerCase().split('-');
  const year = Number(yearValue);
  if (!seasonNames.includes(season) || !Number.isInteger(year)) return null;
  return { season, year };
}

export default function AnimeLanding() {
  const location = useLocation();
  const { genre, seasonSlug } = useParams<{ genre?: string; seasonSlug?: string }>();
  const season = parseSeasonSlug(seasonSlug);
  const isGenrePage = Boolean(genre);
  const isSeasonPage = Boolean(season);
  const genreName = genre ? titleCase(decodeURIComponent(genre)) : '';

  const pageTitle = isGenrePage
    ? `${genreName} Anime`
    : isSeasonPage
      ? `${titleCase(season!.season)} ${season!.year} Anime`
      : 'Popular Anime';
  const description = isGenrePage
    ? `Browse ${genreName} anime on StreamNyaa with title pages, watch links, schedules, related anime, and download search options.`
    : isSeasonPage
      ? `Browse popular ${titleCase(season!.season)} ${season!.year} anime with StreamNyaa title pages, episode context, watch links, and download search.`
      : 'Browse popular anime on StreamNyaa with title pages, episode context, watch links, related anime, and download search options.';

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['anime-landing', location.pathname, genreName, season?.season, season?.year],
    queryFn: ({ pageParam = 1 }) => {
      if (isSeasonPage) return fetchAnimeSeason(season!.season, season!.year, pageParam as number);
      if (isGenrePage) return searchAnime('', pageParam as number, '', '', genreName, 'popular');
      return searchAnime('', pageParam as number, '', '', '', 'popular');
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => lastPage.pagination?.has_next_page ? allPages.length + 1 : undefined,
  });

  const items = (data?.pages.flatMap((page) => page.data) || []).filter((anime, index, list) =>
    index === list.findIndex((item) => item.mal_id === anime.mal_id)
  );

  const Icon = isGenrePage ? Filter : isSeasonPage ? CalendarDays : Flame;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: pageTitle,
    description,
    itemListElement: items.slice(0, 24).map((anime: any, index: number) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: anime.title,
      url: 'https://www.streamnyaa.xyz' + animePath(anime),
    })),
  };

  return (
    <div className="container mx-auto px-4 md:px-10 py-10">
      <Seo
        title={`${pageTitle} | StreamNyaa`}
        description={description}
        canonicalPath={location.pathname}
        image={items[0]?.images?.jpg?.large_image_url || items[0]?.images?.jpg?.image_url}
        jsonLd={jsonLd}
      />
      <Link to="/search" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary transition-colors mb-7">
        <ArrowLeft className="h-4 w-4" />
        Search anime
      </Link>

      <header className="mb-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-primary">Anime discovery</p>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-foreground">{pageTitle}</h1>
          </div>
        </div>
        <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
          {description} Use this page as a cleaner entry point than random anime ID pages, then open a title for synopsis, genres, related anime, watch options, and source search.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/anime/popular" className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm font-bold hover:border-primary/40 hover:text-primary transition-colors">Popular</Link>
          <Link to="/anime/genre/action" className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm font-bold hover:border-primary/40 hover:text-primary transition-colors">Action</Link>
          <Link to="/anime/genre/fantasy" className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm font-bold hover:border-primary/40 hover:text-primary transition-colors">Fantasy</Link>
          <Link to="/anime/season/spring-2026" className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm font-bold hover:border-primary/40 hover:text-primary transition-colors">Spring 2026</Link>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-secondary/20 p-10 text-center text-muted-foreground">
          No anime found for this landing page yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {items.map((anime: any, index: number) => (
              <AnimeCard key={`${location.pathname}-${anime.mal_id}-${index}`} anime={anime} />
            ))}
          </div>
          {hasNextPage && (
            <div className="mt-12 flex justify-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="rounded-full bg-secondary px-8 py-3 font-bold text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
