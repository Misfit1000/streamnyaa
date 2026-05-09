import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  Film,
  Flame,
  LibraryBig,
  MessageSquareText,
  PlayCircle,
  Search,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import { fetchPopularAnime, fetchRecentEpisodes, fetchSchedule, fetchSeasonalAnime, fetchUpcomingAnime } from '../api/jikan';
import AdSenseAd from '../components/AdSenseAd';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import Spotlight from '../components/Spotlight';
import { animePath } from '../lib/slug';
import { useStore } from '../store/useStore';

const getAnimeImage = (anime: any) =>
  anime?.images?.webp?.large_image_url ||
  anime?.images?.jpg?.large_image_url ||
  anime?.images?.jpg?.image_url ||
  anime?.banner_image ||
  '';

const scoreLabel = (score?: number) => (score ? score.toFixed(1).replace(/\.0$/, '') : 'N/A');

function SectionHeader({
  title,
  subtitle,
  icon,
  to,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  to?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-foreground">
          <span className="text-primary">{icon}</span>
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{subtitle}</p> : null}
      </div>
      {to ? (
        <Link to={to} className="hidden shrink-0 items-center gap-1 text-sm font-black text-muted-foreground transition-colors hover:text-primary sm:flex">
          View all <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function CompactAnimeList({ items, label }: { items: any[]; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-secondary/35">
      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">{label}</p>
      </div>
      <div className="divide-y divide-border/80">
        {items.slice(0, 5).map((anime: any, index: number) => (
          <Link
            to={animePath(anime)}
            key={`${label}-${anime.mal_id}-${index}`}
            className="grid grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary"
          >
            <span className="h-14 w-11 overflow-hidden rounded-lg bg-background">
              <img src={getAnimeImage(anime)} alt={anime.title} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
            </span>
            <span className="min-w-0">
              <span className="block line-clamp-1 text-sm font-black text-foreground">{anime.title}</span>
              <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                {anime.type || 'Anime'}{anime.latestEpisode ? ` / Episode ${anime.latestEpisode}` : anime.episodes ? ` / ${anime.episodes} eps` : ''}
              </span>
            </span>
            <span className="text-xs font-black text-primary">#{index + 1}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function WideAnimeRow({ anime, index }: { anime: any; index: number }) {
  return (
    <Link
      to={animePath(anime, '/downloads')}
      className="group grid min-w-[270px] grid-cols-[76px_1fr] gap-3 rounded-2xl border border-border bg-secondary/35 p-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-secondary sm:min-w-[330px]"
    >
      <div className="aspect-[2/3] overflow-hidden rounded-xl bg-background">
        <img src={getAnimeImage(anime)} alt={anime.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" referrerPolicy="no-referrer" />
      </div>
      <div className="flex min-w-0 flex-col justify-between py-1">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-primary/12 px-2 py-1 text-[10px] font-black uppercase text-primary">New #{index + 1}</span>
            {anime.type ? <span className="text-[11px] font-bold uppercase text-muted-foreground">{anime.type}</span> : null}
          </div>
          <h3 className="line-clamp-2 text-sm font-black leading-tight text-foreground">{anime.title}</h3>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{anime.synopsis || 'Open the anime page for release details and source options.'}</p>
        </div>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-black text-primary">
          <Download className="h-3.5 w-3.5" />
          Source options
        </span>
      </div>
    </Link>
  );
}

function BrowseRail() {
  const browseLinks = [
    { label: 'This Season', to: '/anime/season/spring-2026', icon: <Flame className="h-4 w-4" /> },
    { label: 'Upcoming', to: '/search?sort=upcoming', icon: <Calendar className="h-4 w-4" /> },
    { label: 'Popular', to: '/anime/popular', icon: <TrendingUp className="h-4 w-4" /> },
    { label: 'Movies', to: '/search?type=movie', icon: <Film className="h-4 w-4" /> },
    { label: 'Search', to: '/search', icon: <Search className="h-4 w-4" /> },
    { label: 'Schedule', to: '/schedule', icon: <Clock className="h-4 w-4" /> },
  ];

  return (
    <aside className="hidden xl:block">
      <div className="sticky top-24 space-y-4">
        <div className="rounded-3xl border border-border bg-secondary/40 p-4">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Browse</p>
          <div className="space-y-1.5">
            {browseLinks.map((item) => (
              <Link key={item.to} to={item.to} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
                <span className="text-primary">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-primary/20 bg-primary/10 p-4">
          <p className="text-sm font-black text-foreground">Download-first anime hub</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Find title pages, episode updates, schedule timing, and clean source search from one homepage.</p>
          <Link to="/nyaa" className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-black text-white">
            Open source search <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

export default function Home() {
  const { myList } = useStore();
  const [routineExpanded, setRoutineExpanded] = useState(false);
  const localTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time', []);

  const { data: seasonalData, isLoading: seasonalLoading } = useQuery({
    queryKey: ['seasonalAnime'],
    queryFn: fetchSeasonalAnime,
  });

  const { data: popularData, isLoading: popularLoading } = useQuery({
    queryKey: ['popularAnime'],
    queryFn: fetchPopularAnime,
  });

  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ['recentEpisodes'],
    queryFn: fetchRecentEpisodes,
  });

  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ['upcomingAnime'],
    queryFn: fetchUpcomingAnime,
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayStartSeconds = Math.floor(todayStart.getTime() / 1000);
  const todayEndSeconds = Math.floor(todayEnd.getTime() / 1000);

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ['todaySchedule', todayStartSeconds, todayEndSeconds],
    queryFn: () => fetchSchedule(1, todayStartSeconds, todayEndSeconds),
  });

  const recentAnime = recentData?.data || [];
  const seasonalAnime = seasonalData?.data || [];
  const popularAnime = popularData?.data || [];
  const upcomingAnime = upcomingData?.data || [];
  const movieLikeAnime = popularAnime.filter((anime: any) => anime.type === 'MOVIE').length
    ? popularAnime.filter((anime: any) => anime.type === 'MOVIE')
    : popularAnime.slice(4, 9);

  const homeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'StreamNyaa',
    alternateName: ['Stream Nyaa', 'StreamNyaa Anime'],
    url: 'https://www.streamnyaa.xyz/',
    description: 'Anime download discovery, release schedules, episode updates, seasonal anime browsing, and clean anime source search.',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://www.streamnyaa.xyz/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
    publisher: {
      '@type': 'Organization',
      name: 'StreamNyaa',
      url: 'https://www.streamnyaa.xyz/',
    },
  };

  if (seasonalLoading || popularLoading || recentLoading || upcomingLoading || scheduleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="pb-20">
      <Seo
        title="StreamNyaa - Anime Downloads, Schedules and Episode Updates"
        description="StreamNyaa is an anime download and discovery app for finding anime pages, episode updates, release schedules, and clean download source options."
        canonicalPath="/"
        jsonLd={homeJsonLd}
      />

      <Spotlight animeList={seasonalAnime} />

      <main className="container mx-auto mt-7 grid grid-cols-1 gap-7 px-4 md:px-10 xl:grid-cols-[210px_minmax(0,1fr)_330px]">
        <BrowseRail />

        <div className="min-w-0 space-y-8">
          <section className="rounded-3xl border border-border bg-background/70 p-4 shadow-xl shadow-black/10 md:p-5">
            <SectionHeader
              title="Recently Added"
              subtitle="Fresh episode updates and quick download entry points."
              icon={<PlayCircle className="h-5 w-5" />}
              to="/search?sort=recent"
            />
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 custom-scrollbar">
              {recentAnime.slice(0, 8).map((anime: any, index: number) => (
                <WideAnimeRow anime={anime} index={index} key={`wide-recent-${anime.mal_id}-${index}`} />
              ))}
            </div>
          </section>

          <AdSenseAd />

          <section className="rounded-3xl border border-border bg-secondary/20 p-4 md:p-5">
            <SectionHeader
              title="Popular This Season"
              subtitle="Current titles with strong activity and fan interest."
              icon={<TrendingUp className="h-5 w-5" />}
              to="/anime/popular"
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {seasonalAnime.slice(0, 10).map((anime: any, idx: number) => (
                <AnimeCard key={`trending-${anime.mal_id}-${idx}`} anime={anime} />
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <CompactAnimeList items={popularAnime} label="Popular Anime" />
            <CompactAnimeList items={movieLikeAnime} label="Popular Movies" />
          </div>

          <section className="rounded-3xl border border-border bg-secondary/20 p-4 md:p-5">
            <SectionHeader
              title="Coming Soon"
              subtitle="Upcoming anime worth tracking before release."
              icon={<Calendar className="h-5 w-5" />}
              to="/search?sort=upcoming"
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {upcomingAnime.slice(0, 5).map((anime: any, idx: number) => (
                <AnimeCard key={`upcoming-${anime.mal_id}-${idx}`} anime={anime} />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-7">
          <div className="rounded-3xl border border-border bg-secondary/50 p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-[16px] font-black leading-none text-foreground">Today's Schedule</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">Local time: {localTimezone}</p>
                </div>
              </div>
              <button onClick={() => setRoutineExpanded(!routineExpanded)} className="rounded-full border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:text-primary" aria-label="Toggle schedule">
                {routineExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            <div className={`space-y-3 overflow-hidden transition-all duration-300 ${routineExpanded ? 'max-h-[820px] overflow-y-auto pr-2 custom-scrollbar' : 'max-h-[336px]'}`}>
              {scheduleData?.data?.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">No episodes scheduled for today.</div>
              ) : (
                scheduleData?.data?.slice(0, routineExpanded ? scheduleData.data.length : 5).map((anime: any) => {
                  const airingTime = new Date(anime.airingAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
                  return (
                    <Link to={animePath(anime)} key={`sched-${anime.scheduleId || anime.mal_id}`} className="group grid grid-cols-[46px_1fr] gap-3 rounded-2xl border border-transparent p-2 transition-all hover:border-border hover:bg-secondary">
                      <div className="h-16 w-12 overflow-hidden rounded-xl bg-background">
                        <img src={getAnimeImage(anime)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" alt={anime.title} loading="lazy" referrerPolicy="no-referrer" />
                      </div>
                      <div className="min-w-0 self-center">
                        <div className="line-clamp-1 text-[13px] font-black text-foreground transition-colors group-hover:text-primary">{anime.title}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">Ep {anime.airingEpisode}</span>
                          <span className="flex items-center gap-1 text-[11px] font-black text-primary">
                            <Clock className="h-3 w-3" />
                            {airingTime}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            {!routineExpanded && scheduleData?.data?.length > 5 ? (
              <button onClick={() => setRoutineExpanded(true)} className="mt-4 w-full rounded-xl border border-border bg-background py-2 text-center text-[13px] font-black text-foreground transition-colors hover:border-primary/50 hover:text-primary">
                View all ({scheduleData.data.length})
              </button>
            ) : null}
          </div>

          <div className="rounded-3xl border border-border bg-secondary/45 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-muted-foreground">
                <LibraryBig className="h-4 w-4 text-primary" />
                My List ({myList.length})
              </div>
              <Link to="/my-list" className="text-xs font-bold text-primary hover:underline">View all</Link>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {myList.slice(0, 8).map((anime) => (
                <Link to={animePath(anime)} key={`mylist-${anime.mal_id}`} title={anime.title}>
                  <img src={anime.images?.jpg?.image_url} className="h-10 w-10 rounded-full border-2 border-transparent bg-secondary object-cover transition-colors hover:border-primary" alt={anime.title} loading="lazy" referrerPolicy="no-referrer" />
                </Link>
              ))}
              {myList.length > 8 ? (
                <Link to="/my-list" className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-muted-foreground bg-secondary/50 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : myList.length === 0 ? (
                <div className="text-xs text-muted-foreground">Your list is empty.</div>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-secondary/45 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-foreground">
              <MessageSquareText className="h-4 w-4 text-primary" />
              StreamNyaa Notes
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <p><span className="font-black text-foreground">Search:</span> find anime by title, genre, status, or season.</p>
              <p><span className="font-black text-foreground">Download:</span> compare source results by episode, batch, audio, and quality signals.</p>
              <p><span className="font-black text-foreground">Schedule:</span> check upcoming episode timing in your local timezone.</p>
            </div>
          </div>
        </aside>
      </main>

      <section className="container mx-auto mt-12 px-4 md:px-10" aria-labelledby="anime-discovery-heading">
        <div className="rounded-3xl border border-border bg-secondary/25 p-6 md:p-8">
          <div className="grid gap-7 text-sm leading-relaxed text-muted-foreground md:grid-cols-[1.1fr_0.9fr] md:text-base">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Anime download discovery
              </div>
              <h2 id="anime-discovery-heading" className="mb-4 text-2xl font-black text-foreground md:text-3xl">Anime Downloads, Release Schedules, and Episode Updates</h2>
              <p>
                StreamNyaa helps anime fans find download options, trending anime, seasonal releases, upcoming episodes, and detailed anime information in one fast browsing experience. Use the homepage to follow recently updated anime, check today's anime release schedule, browse popular titles, and jump into dedicated anime detail pages.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-1">
              {[
                ['Browse Seasonal Anime', 'Find currently airing anime, upcoming series, popular shows, and recent episode updates.'],
                ['Track Anime Schedules', 'See release timing, episode numbers, and local-time updates for new anime episodes.'],
                ['Find Download Sources', 'Search by title, episode, quality, audio type, and batch or single-episode format.'],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-2xl border border-border bg-background/55 p-4">
                  <h3 className="mb-2 font-black text-foreground">{title}</h3>
                  <p>{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
