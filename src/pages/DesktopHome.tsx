import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Download, HardDrive, History, MonitorPlay, Play, Search, Settings, Star } from 'lucide-react';
import Seo from '../components/Seo';
import { fetchRecentEpisodes, fetchSeasonalAnime, fetchTopAiring, fetchUpcomingAnime } from '../api/jikan';
import { animePath } from '../lib/slug';
import {
  getDesktopRuntimeStatus,
  loadDesktopPlaybackSettings,
  loadLocalPlaybackHistory,
  type DesktopRuntimeStatus,
} from '../lib/desktop';

function imageFor(anime: any) {
  return anime?.banner_image
    || anime?.images?.webp?.large_image_url
    || anime?.images?.jpg?.large_image_url
    || anime?.images?.jpg?.image_url
    || '';
}

function posterFor(anime: any) {
  return anime?.images?.webp?.large_image_url
    || anime?.images?.jpg?.large_image_url
    || anime?.images?.jpg?.image_url
    || anime?.banner_image
    || '';
}

function scoreText(score?: number) {
  return score ? score.toFixed(1) : 'N/A';
}

export default function DesktopHome() {
  const recentSources = loadLocalPlaybackHistory().slice(0, 6);
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(null);
  const { data: seasonalData, isLoading: seasonalLoading } = useQuery({ queryKey: ['desktop-seasonal'], queryFn: fetchSeasonalAnime, staleTime: 1000 * 60 * 12 });
  const { data: topData } = useQuery({ queryKey: ['desktop-top-airing'], queryFn: fetchTopAiring, staleTime: 1000 * 60 * 12 });
  const { data: recentEpisodeData } = useQuery({ queryKey: ['desktop-recent-episodes'], queryFn: fetchRecentEpisodes, staleTime: 1000 * 60 * 5 });
  const { data: upcomingData } = useQuery({ queryKey: ['desktop-upcoming'], queryFn: fetchUpcomingAnime, staleTime: 1000 * 60 * 30 });

  useEffect(() => {
    let cancelled = false;
    getDesktopRuntimeStatus(loadDesktopPlaybackSettings()).then((status) => {
      if (!cancelled && status) setRuntime(status);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const hero = useMemo(() => {
    const pool = seasonalData?.data || topData?.data || [];
    return pool.find((anime: any) => imageFor(anime)) || pool[0];
  }, [seasonalData, topData]);
  const topShelf = (topData?.data || seasonalData?.data || []).slice(0, 8);
  const recentEpisodes = (recentEpisodeData?.data || []).slice(0, 5);
  const upcoming = (upcomingData?.data || []).slice(0, 4);
  const runtimeReady = Boolean(runtime?.ready);

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 lg:px-7">
      <Seo title="StreamNyaa Desktop" description="StreamNyaa desktop app home." canonicalPath="/" robots="noindex, nofollow" />

      <section className="relative min-h-[500px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#08080b] shadow-2xl shadow-black/30">
        {hero ? (
          <>
            <img
              src={imageFor(hero)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-55"
              loading="eager"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#050507_0%,rgba(5,5,7,0.88)_26%,rgba(5,5,7,0.48)_58%,rgba(5,5,7,0.80)_100%),linear-gradient(0deg,#050507_0%,transparent_42%)]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(225,29,72,0.28),transparent_35%),linear-gradient(135deg,#09090d,#050507)]" />
        )}

        <div className="relative grid min-h-[500px] gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:p-10">
          <div className="flex max-w-3xl flex-col justify-end">
            <div className="mb-5 flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-white/70 backdrop-blur-xl">
              <span className={`h-2 w-2 rounded-full ${runtimeReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {runtimeReady ? 'Ready to play locally' : 'Desktop setup needed'}
            </div>
            <h1 className="max-w-4xl text-4xl font-black tracking-tight text-white md:text-6xl">
              {hero?.title || 'A desktop app that feels built for anime.'}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/68">
              Search sources, pick an exact episode, start local playback, and keep your recent anime within reach without bouncing between pages.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/nyaa?desktop=1" className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-black text-white shadow-xl shadow-primary/25 transition-transform hover:-translate-y-0.5 hover:bg-primary/90">
                <Download className="h-4 w-4" />
                Find sources
              </Link>
              <Link to="/local-player?desktop=1" className="inline-flex items-center gap-2 rounded-2xl border border-white/14 bg-white/10 px-6 py-3 text-sm font-black text-white backdrop-blur-xl transition-transform hover:-translate-y-0.5 hover:border-white/30">
                <Play className="h-4 w-4 fill-current" />
                Open player
              </Link>
              {hero ? (
                <Link to={animePath(hero)} className="inline-flex items-center gap-2 rounded-2xl border border-white/14 bg-black/30 px-6 py-3 text-sm font-black text-white/78 backdrop-blur-xl hover:text-white">
                  Details
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </div>

          <div className="hidden self-end lg:block">
            <div className="rounded-[1.8rem] border border-white/12 bg-black/38 p-4 shadow-2xl shadow-black/35 backdrop-blur-2xl">
              <div className="flex items-center gap-4">
                {hero ? <img src={posterFor(hero)} alt={hero.title} className="h-44 w-32 rounded-3xl object-cover shadow-xl shadow-black/40" loading="eager" referrerPolicy="no-referrer" /> : null}
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">Now spotlighting</p>
                  <h2 className="mt-2 line-clamp-3 text-2xl font-black text-white">{hero?.title || 'StreamNyaa Desktop'}</h2>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-white/70">
                    <span className="rounded-full bg-white/10 px-2.5 py-1">Score {scoreText(hero?.score)}</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1">{hero?.type || 'Anime'}</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1">{hero?.episodes || 'TBA'} eps</span>
                  </div>
                </div>
              </div>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/55">{hero?.synopsis || 'Browse, select, and launch local playback from one calm desktop workspace.'}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Top shelf</p>
                <h2 className="text-2xl font-black text-white">Highest-rated airing anime</h2>
              </div>
              <Link to="/search?sort=trending&status=airing" className="hidden items-center gap-2 text-sm font-black text-white/55 hover:text-white sm:inline-flex">
                Browse all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {(seasonalLoading ? Array.from({ length: 6 }) : topShelf).map((anime: any, index: number) => (
                anime?.mal_id ? (
                  <Link key={`${anime.mal_id}-${index}`} to={animePath(anime)} className="group relative aspect-[2/3] overflow-hidden rounded-3xl bg-white/[0.055] shadow-lg shadow-black/20">
                    <img src={posterFor(anime)} alt={anime.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.86),transparent_55%)]" />
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="line-clamp-2 text-sm font-black leading-tight text-white">{anime.title}</p>
                      <div className="mt-2 flex items-center gap-1 text-xs font-black text-yellow-300">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {scoreText(anime.score)}
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div key={index} className="aspect-[2/3] animate-pulse rounded-3xl bg-white/[0.055]" />
                )
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Recently aired</p>
                  <h2 className="text-xl font-black text-white">Fresh episodes</h2>
                </div>
              </div>
              <Link to="/schedule" className="text-sm font-black text-white/55 hover:text-white">Schedule</Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {recentEpisodes.map((anime: any) => (
                <Link key={`${anime.mal_id}-${anime.latestEpisode}`} to={animePath(anime, '/downloads')} className="group grid grid-cols-[54px_1fr_auto] items-center gap-3 rounded-2xl border border-white/8 bg-black/22 p-2.5 hover:border-primary/35 hover:bg-primary/10">
                  <img src={posterFor(anime)} alt={anime.title} className="h-16 w-12 rounded-xl object-cover" loading="lazy" referrerPolicy="no-referrer" />
                  <span className="min-w-0">
                    <span className="block line-clamp-1 text-sm font-black text-white group-hover:text-primary">{anime.title}</span>
                    <span className="mt-1 block text-xs font-bold text-white/45">Episode {anime.latestEpisode || 'new'} available for source search</span>
                  </span>
                  <Download className="h-4 w-4 text-white/35 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <History className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Continue</p>
                <h2 className="text-xl font-black text-white">Recent sources</h2>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {recentSources.length ? recentSources.map((source) => (
                <Link key={source.magnet} to="/local-player?desktop=1" className="block rounded-2xl border border-white/8 bg-black/22 p-3 hover:border-primary/35 hover:bg-primary/10">
                  <p className="line-clamp-1 text-sm font-black text-white">{source.animeTitle || source.title}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-white/42">{source.title}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black text-white/44">
                    {source.episode ? <span>Ep {source.episode}</span> : null}
                    {source.size ? <span>{source.size}</span> : null}
                    {source.seeders ? <span>{source.seeders} seeders</span> : null}
                  </div>
                </Link>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/12 p-5 text-sm leading-6 text-white/45">
                  Search a source once and it appears here for quick playback.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <HardDrive className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">System</p>
                <h2 className="text-xl font-black text-white">{runtimeReady ? 'Ready' : 'Setup needed'}</h2>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/50">{runtime?.message || 'Checking local playback tools.'}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link to="/desktop-settings" className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-center text-xs font-black text-white/72 hover:border-primary/35 hover:text-white">
                <Settings className="mx-auto mb-1 h-4 w-4 text-primary" />
                Settings
              </Link>
              <Link to="/local-player?desktop=1" className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-center text-xs font-black text-white/72 hover:border-primary/35 hover:text-white">
                <MonitorPlay className="mx-auto mb-1 h-4 w-4 text-primary" />
                Player
              </Link>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/15 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black text-white">Coming up</h2>
              <Link to="/search?status=upcoming" className="text-sm font-black text-white/45 hover:text-white">More</Link>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {upcoming.map((anime: any) => (
                <Link key={anime.mal_id} to={animePath(anime)} title={anime.title} className="aspect-[2/3] overflow-hidden rounded-2xl bg-white/[0.055]">
                  <img src={posterFor(anime)} alt={anime.title} className="h-full w-full object-cover transition-transform hover:scale-105" loading="lazy" referrerPolicy="no-referrer" />
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
