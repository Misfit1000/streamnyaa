import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Compass, Download, Flame, Play, Search, Star, Trophy } from 'lucide-react';
import Seo from '../components/Seo';
import { fetchPopularAnime, fetchRecentEpisodes, fetchSeasonalAnime, fetchTopAiring, fetchUpcomingAnime } from '../api/jikan';
import { animePath } from '../lib/slug';
import { loadLocalPlaybackHistory, type LocalPlaybackSource } from '../lib/desktop';

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

function RailHeader({ title, to }: { title: string; to?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[15px] font-black tracking-tight text-white">{title}</h2>
      {to ? <Link to={to} className="text-[12px] font-black text-white/48 hover:text-white">View all</Link> : null}
    </div>
  );
}

function AnimeRailCard({ anime, to, badge }: { anime: any; to: string; badge?: string }) {
  const image = imageFor(anime) || posterFor(anime);
  return (
    <Link
      to={to}
      className="group relative block h-[116px] w-[222px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.08] shadow-xl shadow-black/30 transition-transform hover:-translate-y-0.5 hover:border-primary/45"
    >
      {image ? (
        <img
          src={image}
          alt={anime.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.78),rgba(0,0,0,0.08)_60%)]" />
      {badge ? (
        <span className="absolute left-2.5 top-2.5 rounded bg-black/60 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white/78 backdrop-blur">
          {badge}
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="line-clamp-1 text-[13px] font-black leading-tight text-white">{anime.title}</p>
        <div className="mt-1.5 flex items-center gap-1 text-[11px] font-black text-yellow-300">
          <Star className="h-3 w-3 fill-current" />
          {scoreText(anime.score)}
        </div>
      </div>
    </Link>
  );
}

function SourceRailCard({ source }: { source: LocalPlaybackSource }) {
  return (
    <Link
      to="/local-player?desktop=1"
      className="group relative block h-[116px] w-[222px] shrink-0 overflow-hidden rounded-xl border border-primary/25 bg-[linear-gradient(135deg,rgba(225,29,72,0.38),rgba(255,255,255,0.08)),#101015] p-4 shadow-xl shadow-black/30 transition-transform hover:-translate-y-0.5 hover:border-primary/60"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.18),transparent_34%)]" />
      <div className="relative flex h-full flex-col justify-end">
        <p className="line-clamp-2 text-[13px] font-black leading-tight text-white">{source.animeTitle || source.title}</p>
        <p className="mt-2 line-clamp-1 text-[11px] font-bold text-white/58">
          {source.episode ? `Episode ${source.episode}` : source.size || 'Recent source'}
        </p>
      </div>
    </Link>
  );
}

function ShortcutCard({ to, icon: Icon, label, text }: { to: string; icon: typeof Search; label: string; text: string }) {
  return (
    <Link
      to={to}
      className="group flex h-[116px] w-[222px] shrink-0 flex-col justify-between rounded-xl border border-white/10 bg-black/35 p-4 shadow-xl shadow-black/25 backdrop-blur transition-colors hover:border-primary/45 hover:bg-primary/10"
    >
      <Icon className="h-5 w-5 text-primary" />
      <span>
        <span className="block text-[13px] font-black text-white group-hover:text-primary">{label}</span>
        <span className="mt-1 block text-[11px] font-semibold leading-4 text-white/48">{text}</span>
      </span>
    </Link>
  );
}

export default function DesktopHome() {
  const recentSources = loadLocalPlaybackHistory().slice(0, 8);
  const { data: seasonalData, isLoading: seasonalLoading } = useQuery({ queryKey: ['desktop-seasonal'], queryFn: fetchSeasonalAnime, staleTime: 1000 * 60 * 12 });
  const { data: topData } = useQuery({ queryKey: ['desktop-top-airing'], queryFn: fetchTopAiring, staleTime: 1000 * 60 * 12 });
  const { data: recentEpisodeData } = useQuery({ queryKey: ['desktop-recent-episodes'], queryFn: fetchRecentEpisodes, staleTime: 1000 * 60 * 5 });
  const { data: upcomingData } = useQuery({ queryKey: ['desktop-upcoming'], queryFn: fetchUpcomingAnime, staleTime: 1000 * 60 * 30 });
  const { data: popularData } = useQuery({ queryKey: ['desktop-popular'], queryFn: fetchPopularAnime, staleTime: 1000 * 60 * 30 });

  const hero = useMemo(() => {
    const pool = seasonalData?.data || topData?.data || [];
    return pool.find((anime: any) => imageFor(anime)) || pool[0];
  }, [seasonalData, topData]);

  const latestEpisodes = (recentEpisodeData?.data || []).slice(0, 10);
  const trending = (seasonalData?.data || topData?.data || []).slice(0, 10);
  const topRated = (topData?.data || seasonalData?.data || []).slice(0, 10);
  const upcoming = (upcomingData?.data || []).slice(0, 10);
  const popular = (popularData?.data || []).slice(0, 10);

  return (
    <div className="desktop-home-cinematic relative min-h-[calc(100vh-5rem)] overflow-hidden bg-[#08080a]">
      <Seo title="StreamNyaa Desktop" description="StreamNyaa desktop app home." canonicalPath="/" robots="noindex, nofollow" />

      {hero ? (
        <img
          src={imageFor(hero)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-55"
          loading="eager"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#08080a_0%,rgba(8,8,10,0.82)_28%,rgba(8,8,10,0.35)_62%,rgba(8,8,10,0.88)_100%),linear-gradient(0deg,#08080a_0%,rgba(8,8,10,0.72)_25%,rgba(8,8,10,0.16)_68%,rgba(8,8,10,0.42)_100%)]" />

      <main className="relative flex min-h-[calc(100vh-5rem)] flex-col px-5 py-6 lg:px-7">
        <section className="grid max-w-7xl gap-7 pt-3 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_310px]">
          <div className="max-w-3xl">
          <p className="text-[12px] font-black uppercase tracking-[0.22em] text-white/72">StreamNyaa</p>
          <h1 className="mt-4 line-clamp-2 text-6xl font-black leading-[0.92] tracking-tight text-white md:text-8xl">
            {hero?.title || 'Anime'}
          </h1>
          <p className="mt-5 line-clamp-3 max-w-xl text-sm font-medium leading-6 text-white/66 md:text-base">
            {hero?.synopsis || 'Browse current anime, find fresh episode sources, and continue local playback from a clean desktop home.'}
          </p>
          <div className="mt-5 flex items-center gap-2 text-[12px] font-black text-white/68">
            <span>{hero?.type || 'TV'}</span>
            <span className="h-1 w-1 rounded-full bg-white/45" />
            <span>Score {scoreText(hero?.score)}</span>
            <span className="h-1 w-1 rounded-full bg-white/45" />
            <span>{hero?.episodes || 'TBA'} eps</span>
          </div>
          <div className="mt-5 flex gap-3">
            <Link
              to={hero ? animePath(hero, '/downloads') : '/nyaa?desktop=1'}
              className="inline-flex h-10 items-center gap-2 rounded bg-white px-6 text-[13px] font-black text-black hover:bg-white/90"
            >
              <Download className="h-3.5 w-3.5" />
              Sources
            </Link>
            <Link
              to="/local-player?desktop=1"
              className="inline-flex h-10 items-center gap-2 rounded border border-white/18 bg-black/35 px-6 text-[13px] font-black text-white backdrop-blur hover:border-white/35"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Play
            </Link>
          </div>
          </div>

          {hero ? (
            <Link
              to={animePath(hero)}
              className="group hidden overflow-hidden rounded-2xl border border-white/12 bg-black/35 p-2 shadow-2xl shadow-black/35 backdrop-blur-xl lg:block"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl">
                <img
                  src={posterFor(hero)}
                  alt={hero.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="eager"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.74),rgba(0,0,0,0.02)_62%)]" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="line-clamp-2 text-lg font-black leading-tight text-white">{hero.title}</p>
                  <p className="mt-2 text-xs font-bold text-white/56">Open title page</p>
                </div>
              </div>
            </Link>
          ) : null}
        </section>

        <section className="mt-7 space-y-6 pb-2">
          <div>
            <RailHeader title="Continue watching" />
            <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
              {recentSources.length ? recentSources.map((source) => (
                <SourceRailCard key={source.magnet} source={source} />
              )) : (
                <>
                  <ShortcutCard to="/nyaa?desktop=1" icon={Search} label="Find a source" text="Search an anime and send a source to the local player." />
                  <ShortcutCard to="/local-player?desktop=1" icon={Play} label="Open player" text="Pick from saved sources or start a new local playback session." />
                  <ShortcutCard to="/schedule" icon={CalendarDays} label="Today’s schedule" text="Check what aired recently before choosing a source." />
                </>
              )}
            </div>
          </div>

          <div>
            <RailHeader title="Latest episodes" to="/schedule" />
            <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
              {(seasonalLoading ? Array.from({ length: 6 }) : latestEpisodes).map((anime: any, index: number) => (
                anime?.mal_id ? (
                  <AnimeRailCard
                    key={`latest-${anime.mal_id}-${anime.latestEpisode || index}`}
                    anime={anime}
                    to={animePath(anime, '/downloads')}
                    badge={anime.latestEpisode ? `Ep ${anime.latestEpisode}` : 'New'}
                  />
                ) : (
                  <div key={`latest-skeleton-${index}`} className="h-[82px] w-[162px] shrink-0 animate-pulse rounded-lg bg-white/[0.08]" />
                )
              ))}
            </div>
          </div>

          <div>
            <RailHeader title="Trending this season" to="/search?sort=trending&status=airing" />
            <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
              {trending.map((anime: any, index: number) => (
                <AnimeRailCard key={`trending-${anime.mal_id}-${index}`} anime={anime} to={animePath(anime)} badge="Trending" />
              ))}
            </div>
          </div>

          <div>
            <RailHeader title="Top rated airing" to="/search?sort=score&status=airing" />
            <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
              {topRated.map((anime: any, index: number) => (
                <AnimeRailCard key={`top-${anime.mal_id}-${index}`} anime={anime} to={animePath(anime)} badge="Top" />
              ))}
            </div>
          </div>

          <div>
            <RailHeader title="Upcoming" to="/search?status=upcoming" />
            <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
              {upcoming.map((anime: any, index: number) => (
                <AnimeRailCard key={`upcoming-${anime.mal_id}-${index}`} anime={anime} to={animePath(anime)} badge="Soon" />
              ))}
            </div>
          </div>

          <div>
            <RailHeader title="Popular picks" to="/search?sort=popular" />
            <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
              {popular.map((anime: any, index: number) => (
                <AnimeRailCard key={`popular-${anime.mal_id}-${index}`} anime={anime} to={animePath(anime)} badge="Popular" />
              ))}
              <ShortcutCard to="/compare" icon={Trophy} label="Compare two anime" text="Check score, genres, popularity, studio, and episode count." />
              <ShortcutCard to="/search" icon={Compass} label="Browse by filters" text="Use genre, status, format, and rating filters." />
              <ShortcutCard to="/nyaa?desktop=1" icon={Flame} label="Source presets" text="Jump into 1080p, batch, dual audio, and quality filters." />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
