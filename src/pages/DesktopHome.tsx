import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Play, Star } from 'lucide-react';
import Seo from '../components/Seo';
import { fetchRecentEpisodes, fetchSeasonalAnime, fetchTopAiring, fetchUpcomingAnime } from '../api/jikan';
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
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-[13px] font-black tracking-tight text-white">{title}</h2>
      {to ? <Link to={to} className="text-[11px] font-black text-white/45 hover:text-white">View all</Link> : null}
    </div>
  );
}

function AnimeRailCard({ anime, to, badge }: { anime: any; to: string; badge?: string }) {
  const image = imageFor(anime) || posterFor(anime);
  return (
    <Link
      to={to}
      className="group relative block h-[82px] w-[162px] shrink-0 overflow-hidden rounded-lg bg-white/[0.08] shadow-lg shadow-black/25 transition-transform hover:-translate-y-0.5"
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
        <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white/75 backdrop-blur">
          {badge}
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-2">
        <p className="line-clamp-1 text-[11px] font-black leading-tight text-white">{anime.title}</p>
        <div className="mt-1 flex items-center gap-1 text-[10px] font-black text-yellow-300">
          <Star className="h-2.5 w-2.5 fill-current" />
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
      className="group relative block h-[82px] w-[162px] shrink-0 overflow-hidden rounded-lg bg-[linear-gradient(135deg,rgba(225,29,72,0.35),rgba(255,255,255,0.08)),#101015] p-3 shadow-lg shadow-black/25 transition-transform hover:-translate-y-0.5"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.18),transparent_34%)]" />
      <div className="relative flex h-full flex-col justify-end">
        <p className="line-clamp-2 text-[11px] font-black leading-tight text-white">{source.animeTitle || source.title}</p>
        <p className="mt-1 line-clamp-1 text-[10px] font-bold text-white/52">
          {source.episode ? `Episode ${source.episode}` : source.size || 'Recent source'}
        </p>
      </div>
    </Link>
  );
}

export default function DesktopHome() {
  const recentSources = loadLocalPlaybackHistory().slice(0, 8);
  const { data: seasonalData, isLoading: seasonalLoading } = useQuery({ queryKey: ['desktop-seasonal'], queryFn: fetchSeasonalAnime, staleTime: 1000 * 60 * 12 });
  const { data: topData } = useQuery({ queryKey: ['desktop-top-airing'], queryFn: fetchTopAiring, staleTime: 1000 * 60 * 12 });
  const { data: recentEpisodeData } = useQuery({ queryKey: ['desktop-recent-episodes'], queryFn: fetchRecentEpisodes, staleTime: 1000 * 60 * 5 });
  const { data: upcomingData } = useQuery({ queryKey: ['desktop-upcoming'], queryFn: fetchUpcomingAnime, staleTime: 1000 * 60 * 30 });

  const hero = useMemo(() => {
    const pool = seasonalData?.data || topData?.data || [];
    return pool.find((anime: any) => imageFor(anime)) || pool[0];
  }, [seasonalData, topData]);

  const latestEpisodes = (recentEpisodeData?.data || []).slice(0, 7);
  const trending = (seasonalData?.data || topData?.data || []).slice(0, 7);
  const topRated = (topData?.data || seasonalData?.data || []).slice(0, 7);
  const upcoming = (upcomingData?.data || []).slice(0, 7);

  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-[#08080a]">
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
        <section className="max-w-xl pt-3">
          <p className="text-[12px] font-black uppercase tracking-[0.22em] text-white/72">StreamNyaa</p>
          <h1 className="mt-4 line-clamp-2 text-5xl font-black leading-[0.95] tracking-tight text-white md:text-7xl">
            {hero?.title || 'Anime'}
          </h1>
          <p className="mt-4 line-clamp-3 max-w-md text-[12px] font-medium leading-5 text-white/64 md:text-sm">
            {hero?.synopsis || 'Browse current anime, find fresh episode sources, and continue local playback from a clean desktop home.'}
          </p>
          <div className="mt-4 flex items-center gap-2 text-[11px] font-black text-white/65">
            <span>{hero?.type || 'TV'}</span>
            <span className="h-1 w-1 rounded-full bg-white/45" />
            <span>Score {scoreText(hero?.score)}</span>
            <span className="h-1 w-1 rounded-full bg-white/45" />
            <span>{hero?.episodes || 'TBA'} eps</span>
          </div>
          <div className="mt-5 flex gap-3">
            <Link
              to={hero ? animePath(hero, '/downloads') : '/nyaa?desktop=1'}
              className="inline-flex h-9 items-center gap-2 rounded bg-white px-5 text-[12px] font-black text-black hover:bg-white/90"
            >
              <Download className="h-3.5 w-3.5" />
              Sources
            </Link>
            <Link
              to="/local-player?desktop=1"
              className="inline-flex h-9 items-center gap-2 rounded border border-white/18 bg-black/35 px-5 text-[12px] font-black text-white backdrop-blur hover:border-white/35"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Play
            </Link>
          </div>
        </section>

        <section className="mt-auto space-y-5 pb-2">
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

          <div className="grid gap-5 2xl:grid-cols-2">
            <div>
              <RailHeader title={recentSources.length ? 'Continue' : 'Top rated'} />
              <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
                {recentSources.length ? recentSources.map((source) => (
                  <SourceRailCard key={source.magnet} source={source} />
                )) : topRated.map((anime: any, index: number) => (
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
          </div>
        </section>
      </main>
    </div>
  );
}
