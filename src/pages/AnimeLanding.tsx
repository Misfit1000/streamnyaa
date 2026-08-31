import { Link, useLocation, useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Filter, Flame, Loader2 } from 'lucide-react';
import { fetchAnimeSeason, searchAnime } from '../api/jikan';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import DesktopLoadingProgress from '../components/DesktopLoadingProgress';
import { animePath } from '../lib/slug';

const seasonNames = ['winter', 'spring', 'summer', 'fall'];

function animeKey(anime: any) {
  return String(anime?.mal_id || anime?.id || anime?.title || '');
}

function uniqueAnimeList(items: any[]) {
  const seen = new Set<string>();
  return items.filter((anime) => {
    const key = animeKey(anime);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
    ? `Browse ${genreName} anime on StreamNyaa with title pages, schedules, related anime, and download search options.`
    : isSeasonPage
      ? `Browse popular ${titleCase(season!.season)} ${season!.year} anime with StreamNyaa title pages, episode context, and download search.`
      : 'Browse popular anime on StreamNyaa with title pages, episode context, related anime, and download search options.';

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

  const items = uniqueAnimeList(data?.pages.flatMap((page) => page.data) || []);
  const seasonHighlights = {
    airing: items.filter((anime: any) => anime.status === 'RELEASING').slice(0, 4),
    highestScore: [...items].filter((anime: any) => Number(anime.score) > 0).sort((a: any, b: any) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 4),
    upcoming: items.filter((anime: any) => anime.status === 'NOT_YET_AIRED').slice(0, 4),
    hiddenGems: [...items].filter((anime: any) => Number(anime.score) > 0 && Number(anime.popularity || 0) > 1500).sort((a: any, b: any) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 4),
  };

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
          {description} Use this page as a cleaner entry point than random anime ID pages, then open a title for synopsis, genres, related anime, episode context, and source search.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/anime/popular" className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm font-bold hover:border-primary/40 hover:text-primary transition-colors">Popular</Link>
          <Link to="/anime/genre/action" className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm font-bold hover:border-primary/40 hover:text-primary transition-colors">Action</Link>
          <Link to="/anime/genre/fantasy" className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm font-bold hover:border-primary/40 hover:text-primary transition-colors">Fantasy</Link>
          <Link to="/anime/season/spring-2026" className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm font-bold hover:border-primary/40 hover:text-primary transition-colors">Spring 2026</Link>
        </div>
      </header>

      {isSeasonPage && items.length ? (
        <section className="mb-10 grid gap-4 lg:grid-cols-4">
          {[
            { title: 'Airing now', text: 'Currently releasing titles', items: seasonHighlights.airing },
            { title: 'Highest score', text: 'Best rated season picks', items: seasonHighlights.highestScore },
            { title: 'Upcoming', text: 'Not yet aired entries', items: seasonHighlights.upcoming },
            { title: 'Hidden gems', text: 'Strong score, less obvious picks', items: seasonHighlights.hiddenGems },
          ].map((group) => (
            <div key={group.title} className="rounded-2xl border border-border bg-[var(--glass)] p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-primary">{group.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{group.text}</p>
              <div className="mt-4 space-y-2">
                {group.items.length ? group.items.map((anime: any) => (
                  <Link key={`${group.title}-${animeKey(anime)}`} to={animePath(anime)} className="group grid grid-cols-[42px_1fr] gap-3 rounded-xl bg-background/45 p-2 transition-colors hover:bg-primary/10">
                    <img src={anime.images?.jpg?.image_url || anime.images?.jpg?.large_image_url} alt={anime.title} className="h-14 w-10 rounded-lg object-cover" loading="lazy" referrerPolicy="no-referrer" />
                    <span className="min-w-0">
                      <span className="block line-clamp-1 text-sm font-black text-foreground group-hover:text-primary">{anime.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{anime.score ? `${anime.score}/10` : anime.status || 'Anime'}</span>
                    </span>
                  </Link>
                )) : (
                  <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">No titles listed yet.</p>
                )}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {isLoading ? (
        <DesktopLoadingProgress variant="screen" label="Loading this anime collection" percent={38} detail="Checking saved results while the live catalog responds." />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-secondary/20 p-10 text-center text-muted-foreground">
          No anime found for this landing page yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {items.map((anime: any, index: number) => (
              <AnimeCard key={`${location.pathname}-${animeKey(anime)}-${index}`} anime={anime} />
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
