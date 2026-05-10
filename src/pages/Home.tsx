import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronRight, Clock, RefreshCw, TrendingUp } from 'lucide-react';
import { fetchRecentEpisodes, fetchSchedule, fetchSeasonalAnime, fetchUpcomingAnime } from '../api/jikan';
import AdSenseAd from '../components/AdSenseAd';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import Spotlight from '../components/Spotlight';
import { getRecentAnime, type RecentAnime } from '../lib/activity';
import { animePath } from '../lib/slug';
import { useStore } from '../store/useStore';

function AnimeGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={`anime-grid-skeleton-${index}`} className="aspect-[2/3] animate-pulse rounded-xl bg-secondary/60" />
      ))}
    </>
  );
}

export default function Home() {
  const { myList } = useStore();
  const [recentlyViewed, setRecentlyViewed] = useState<RecentAnime[]>([]);
  const localTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time', []);

  useEffect(() => {
    setRecentlyViewed(getRecentAnime(6));
  }, []);

  const { data: seasonalData, isLoading: seasonalLoading } = useQuery({
    queryKey: ['seasonalAnime'],
    queryFn: fetchSeasonalAnime,
  });
  const topSeasonScores = useMemo(() => {
    return [...(seasonalData?.data || [])]
      .filter((anime: any) => Number(anime.score) > 0)
      .sort((a: any, b: any) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, 6);
  }, [seasonalData]);

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

  return (
    <div className="pb-20">
      <Seo
        title="StreamNyaa - Anime Downloads, Schedules and Episode Updates"
        description="StreamNyaa is an anime download and discovery app for finding anime pages, episode updates, release schedules, and clean download source options."
        canonicalPath="/"
        jsonLd={homeJsonLd}
      />

      <Spotlight animeList={seasonalData?.data || []} />

      <main className="container mx-auto mt-14 grid grid-cols-1 gap-12 px-4 md:px-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-16">
          <section>
            <div className="mb-7 flex items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-primary">New drops</p>
              <h2 className="flex items-center gap-2 text-xl font-black text-foreground">
                <RefreshCw className="h-6 w-6 text-primary" />
                Recently updated
              </h2>
              </div>
              <Link to="/search?sort=recent" className="flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary">
                View All <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {recentLoading ? (
                <AnimeGridSkeleton />
              ) : (
                recentData?.data?.slice(0, 10).map((anime: any, idx: number) => (
                  <AnimeCard key={`recent-${anime.mal_id}-${idx}`} anime={anime} />
                ))
              )}
            </div>
          </section>

          <AdSenseAd />

          <section>
            <div className="mb-7 flex items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-primary">This season</p>
              <h2 className="flex items-center gap-2 text-xl font-black text-foreground">
                <TrendingUp className="h-6 w-6 text-primary" />
                Trending now
              </h2>
              </div>
              <Link to="/search?sort=trending" className="flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary">
                View All <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {seasonalLoading ? (
                <AnimeGridSkeleton />
              ) : (
                seasonalData?.data?.slice(0, 10).map((anime: any, idx: number) => (
                  <AnimeCard key={`trending-${anime.mal_id}-${idx}`} anime={anime} />
                ))
              )}
            </div>
          </section>

          <section>
            <div className="mb-7 flex items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-primary">Next up</p>
              <h2 className="flex items-center gap-2 text-xl font-black text-foreground">
                <Calendar className="h-6 w-6 text-primary" />
                Upcoming anime
              </h2>
              </div>
              <Link to="/search?sort=upcoming" className="flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary">
                View All <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {upcomingLoading ? (
                <AnimeGridSkeleton />
              ) : (
                upcomingData?.data?.slice(0, 10).map((anime: any, idx: number) => (
                  <AnimeCard key={`upcoming-${anime.mal_id}-${idx}`} anime={anime} />
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-8">
          <div className="overflow-hidden rounded-3xl bg-[linear-gradient(145deg,rgba(225,29,72,0.13),rgba(255,255,255,0.045)_48%,rgba(255,255,255,0.02)),rgba(255,255,255,0.035)] p-5 shadow-xl shadow-black/10 ring-1 ring-white/[0.06] backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Score board</p>
                <h2 className="mt-1 text-lg font-black text-foreground">Strongest airing picks</h2>
              </div>
              <Link to="/search?sort=score&status=airing" className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
                View
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {seasonalLoading ? (
                Array.from({ length: 6 }, (_, index) => (
                  <div key={`top-score-skeleton-${index}`} className="aspect-[2/3] animate-pulse rounded-2xl bg-secondary/60" />
                ))
              ) : topSeasonScores.map((anime: any, index: number) => (
                <Link
                  to={animePath(anime, '/downloads')}
                  key={`download-shortcut-${anime.mal_id}-${index}`}
                  className="group relative aspect-[2/3] overflow-hidden rounded-2xl bg-secondary shadow-lg shadow-black/20"
                  title={`${anime.title} downloads`}
                >
                  <img
                    src={anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}
                    alt={anime.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="line-clamp-1 text-[10px] font-black text-white">{anime.title}</p>
                    <p className="mt-0.5 text-[10px] font-black text-yellow-300">Score {anime.score ? anime.score.toFixed(1) : 'N/A'}</p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <Link to="/search?sort=trending&status=airing" className="rounded-2xl bg-white/[0.05] p-3 font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                Season feed
                <span className="mt-1 block text-[11px] font-medium text-muted-foreground/80">Airing titles</span>
              </Link>
              <Link to="/schedule" className="rounded-2xl bg-white/[0.05] p-3 font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                Today
                <span className="mt-1 block text-[11px] font-medium text-muted-foreground/80">Episode times</span>
              </Link>
            </div>
          </div>

          {recentlyViewed.length ? (
            <div className="rounded-3xl bg-white/[0.035] p-5 shadow-xl shadow-black/10 ring-1 ring-white/[0.06] backdrop-blur-2xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Continue</p>
                  <h2 className="mt-1 text-lg font-black text-foreground">Recently opened</h2>
                </div>
                <Link to="/dashboard" className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
                  History
                </Link>
              </div>
              <div className="space-y-2">
                {recentlyViewed.map((anime) => (
                  <Link key={anime.mal_id} to={animePath(anime)} className="group grid grid-cols-[44px_1fr_auto] items-center gap-3 rounded-2xl bg-white/[0.045] p-2 transition-colors hover:bg-primary/10">
                    <img
                      src={anime.images?.jpg?.image_url || anime.images?.jpg?.large_image_url}
                      alt={anime.title}
                      className="h-14 w-11 rounded-xl object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                    <span className="min-w-0">
                      <span className="block line-clamp-1 text-sm font-black text-foreground group-hover:text-primary">{anime.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{anime.score ? `${anime.score}/10` : anime.type || 'Anime'}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex h-fit flex-col rounded-3xl bg-white/[0.045] p-6 shadow-xl shadow-black/10 ring-1 ring-white/[0.06] backdrop-blur-2xl transition-all duration-300">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-[16px] font-bold leading-none">Today's Schedule</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">All listed episodes in {localTimezone}</p>
                </div>
              </div>
            </div>

            <div className="max-h-[680px] space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              {scheduleData?.data?.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">No episodes scheduled for today.</div>
              ) : scheduleLoading ? (
                Array.from({ length: 8 }, (_, index) => (
                  <div key={`schedule-skeleton-${index}`} className="flex gap-4 rounded-xl p-2">
                    <div className="h-16 w-12 shrink-0 animate-pulse rounded-md bg-secondary/70" />
                    <div className="flex flex-1 flex-col justify-center gap-2">
                      <div className="h-3 w-4/5 animate-pulse rounded bg-secondary/70" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-secondary/50" />
                    </div>
                  </div>
                ))
              ) : (
                scheduleData?.data?.map((anime: any) => {
                  const airingTime = new Date(anime.airingAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
                  return (
                    <Link to={animePath(anime)} key={`sched-${anime.scheduleId || anime.mal_id}`} className="group flex gap-4 rounded-xl border border-transparent p-2 transition-all hover:border-border hover:bg-background/45">
                      <div className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-md">
                        <img
                          src={anime.images.webp?.large_image_url || anime.images.jpg.large_image_url || anime.images.jpg.image_url}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                          alt={anime.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center">
                        <div className="line-clamp-1 text-[13px] font-bold transition-colors group-hover:text-primary">{anime.title}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="rounded border border-border bg-background/80 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            Ep {anime.airingEpisode}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] font-bold text-primary">
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

            <div className="mt-8 border-t border-border pt-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[12px] font-bold text-muted-foreground">MY LIST ({myList.length})</div>
                <Link to="/my-list" className="text-[12px] font-medium text-primary hover:underline">View all</Link>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {myList.slice(0, 7).map((anime) => (
                  <Link to={animePath(anime)} key={`mylist-${anime.mal_id}`} title={anime.title}>
                    <img src={anime.images?.jpg?.image_url} className="h-9 w-9 rounded-full border-2 border-transparent bg-secondary object-cover transition-colors hover:border-primary" alt={anime.title} loading="lazy" referrerPolicy="no-referrer" />
                  </Link>
                ))}
                {myList.length > 7 ? (
                  <Link to="/my-list" className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-muted-foreground bg-secondary/50 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : myList.length === 0 ? (
                  <div className="w-full">
                    <p className="text-xs leading-5 text-muted-foreground">Your list is empty. Start from a seasonal pick.</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {(seasonalData?.data || []).slice(0, 3).map((anime: any, index: number) => (
                        <Link to={animePath(anime)} key={`empty-list-pick-${anime.mal_id}-${index}`} className="aspect-[2/3] overflow-hidden rounded-xl bg-secondary shadow-lg shadow-black/15">
                          <img
                            src={anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}
                            alt={anime.title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        </Link>
                      ))}
                    </div>
                    <Link to="/search" className="mt-3 inline-flex text-xs font-black text-primary hover:underline">
                      Browse anime
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white/[0.035] p-5 shadow-xl shadow-black/10 ring-1 ring-white/[0.06] backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Browse faster</p>
              <h2 className="mt-1 text-lg font-black text-foreground">Jump back in</h2>
              </div>
            </div>
            <div className="grid gap-2">
              {[
                { label: 'Popular anime', text: 'Titles people keep opening', to: '/anime/popular' },
                { label: 'Action anime', text: 'Fight-heavy seasonal picks', to: '/anime/genre/action' },
                { label: 'Romance anime', text: 'New and returning favorites', to: '/anime/genre/romance' },
                { label: 'Source search', text: 'Find episode and batch options', to: '/nyaa' },
              ].map((item) => (
                <Link key={item.to} to={item.to} className="group flex items-center justify-between gap-3 rounded-2xl bg-white/[0.045] p-3 transition-colors hover:bg-primary/10">
                  <span>
                    <span className="block text-sm font-black text-foreground group-hover:text-primary">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{item.text}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </main>

      <section className="container mx-auto mt-12 px-4 md:px-10" aria-labelledby="anime-discovery-heading">
        <div className="max-w-6xl rounded-3xl bg-white/[0.035] p-6 shadow-xl shadow-black/10 ring-1 ring-white/[0.06] backdrop-blur-2xl md:p-8">
          <div className="grid gap-8 text-sm leading-relaxed text-muted-foreground md:grid-cols-[1fr_1fr] md:text-base">
            <div>
              <h2 id="anime-discovery-heading" className="mb-4 text-2xl font-black text-foreground md:text-3xl">Built around the way anime fans actually look things up</h2>
              <p>
                StreamNyaa keeps the useful pieces close together: title pages, airing times, recent episode movement, manga links, and source search. The homepage stays media-first so you can recognize a show quickly instead of reading through feature copy.
              </p>
              <p className="mt-4">
                Detail pages carry the heavier context: synopsis, status, genres, score, schedule notes, related titles, and download links. That keeps browsing fast while still giving search engines enough structured information to understand each title.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Airing now', 'Seasonal titles, scores, and episode timing.'],
                ['Episode search', 'Source results by episode, batch, quality, and audio.'],
                ['Saved titles', 'Recent views and bookmarked anime stay within reach.'],
                ['Anime pages', 'Synopsis, relations, FAQ, score, and schedule context.'],
              ].map(([title, text]) => (
                <div key={title} className="rounded-2xl bg-white/[0.045] p-4">
                  <h3 className="text-sm font-black text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
