import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Info, Play, Search } from 'lucide-react';
import Seo from '../components/Seo';
import { fetchPopularAnime, fetchRecentEpisodes, fetchSeasonalAnime, fetchTopAiring } from '../api/jikan';
import { animePath } from '../lib/slug';
import { loadLocalPlaybackHistory, type LocalPlaybackSource } from '../lib/desktop';

function imageFor(anime: any) {
  return anime?.banner_image
    || anime?.trailer?.images?.maximum_image_url
    || anime?.images?.webp?.large_image_url
    || anime?.images?.jpg?.large_image_url
    || anime?.images?.jpg?.image_url
    || '';
}

function scoreText(score?: number) {
  return score ? score.toFixed(1) : 'N/A';
}

function heroDescription(anime: any) {
  const text = anime?.synopsis || 'Start local playback quickly, continue recent sources, and use source browsing only when you want to choose another release.';
  return text.length > 136 ? `${text.slice(0, 132).trim()}...` : text;
}

function watchPathFor(anime: any, episode?: string | number) {
  if (!anime) return '/local-player?desktop=1';
  const episodeQuery = episode ? `ep=${episode}&` : '';
  return `${animePath(anime, `/downloads?${episodeQuery}type=dub&play=1&autoplay=1`)}`;
}

function RailHeader({ title, to }: { title: string; to?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-white">{title}</h2>
      {to ? (
        <Link to={to} className="inline-flex items-center gap-1 text-[13px] font-medium text-white/62 hover:text-white">
          View All
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function ContinueCard({ anime, to, episode }: { anime: any; to: string; episode?: string | number }) {
  const image = imageFor(anime);
  return (
    <Link to={to} className="group w-[238px] shrink-0">
      <div className="relative h-[118px] overflow-hidden rounded-lg border border-white/8 bg-white/[0.06] shadow-lg shadow-black/30">
        {image ? (
          <img
            src={image}
            alt={anime.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.46),rgba(0,0,0,0.04))]" />
        <span className="absolute bottom-3 left-3 grid h-28 w-28 max-h-8 max-w-8 place-items-center rounded-full bg-black/62 text-white backdrop-blur">
          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
        </span>
      </div>
      <p className="mt-2 line-clamp-1 text-[15px] font-medium text-white">{anime.title}</p>
      <p className="mt-1 text-[13px] text-white/50">Episode {episode || anime.latestEpisode || anime.episodes || '1'}</p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-primary" style={{ width: `${28 + ((anime.mal_id || anime.id || 1) % 52)}%` }} />
      </div>
    </Link>
  );
}

function SourceCard({ source }: { source: LocalPlaybackSource }) {
  return (
    <Link to="/local-player?desktop=1" className="group w-[238px] shrink-0">
      <div className="relative h-[118px] overflow-hidden rounded-lg border border-primary/18 bg-[linear-gradient(135deg,rgba(225,29,72,0.42),rgba(255,255,255,0.06)),#141015] p-4 shadow-lg shadow-black/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(255,255,255,0.22),transparent_36%)]" />
        <span className="relative grid h-8 w-8 place-items-center rounded-full bg-black/58 text-white backdrop-blur">
          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
        </span>
      </div>
      <p className="mt-2 line-clamp-1 text-[15px] font-medium text-white">{source.animeTitle || source.title}</p>
      <p className="mt-1 text-[13px] text-white/50">{source.episode ? `Episode ${source.episode}` : source.size || 'Recent source'}</p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 rounded-full bg-primary" />
      </div>
    </Link>
  );
}

export default function DesktopHome() {
  const recentSources = loadLocalPlaybackHistory().slice(0, 5);
  const [heroIndex, setHeroIndex] = useState(0);
  const { data: seasonalData, isLoading } = useQuery({ queryKey: ['desktop-seasonal'], queryFn: fetchSeasonalAnime, staleTime: 1000 * 60 * 12 });
  const { data: topData } = useQuery({ queryKey: ['desktop-top-airing'], queryFn: fetchTopAiring, staleTime: 1000 * 60 * 12 });
  const { data: recentEpisodeData } = useQuery({ queryKey: ['desktop-recent-episodes'], queryFn: fetchRecentEpisodes, staleTime: 1000 * 60 * 5 });
  const { data: popularData } = useQuery({ queryKey: ['desktop-popular'], queryFn: fetchPopularAnime, staleTime: 1000 * 60 * 30 });

  const heroPool = useMemo(() => {
    const seasonal = (seasonalData?.data || []).filter((anime: any) => imageFor(anime));
    const topSeasonal = [...seasonal]
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
      .slice(0, 8);
    return topSeasonal.length ? topSeasonal : (topData?.data || []).filter((anime: any) => imageFor(anime)).slice(0, 8);
  }, [seasonalData?.data, topData?.data]);
  const hero = heroPool[heroIndex] || heroPool[0];
  const continueItems = (recentEpisodeData?.data || topData?.data || seasonalData?.data || []).slice(0, 5);
  const latestEpisodes = (recentEpisodeData?.data || []).slice(0, 6);
  const trending = (seasonalData?.data || topData?.data || []).slice(0, 6);
  const popular = (popularData?.data || []).slice(0, 6);
  const heroCount = heroPool.length;

  useEffect(() => {
    setHeroIndex(0);
  }, [heroPool]);

  useEffect(() => {
    if (heroCount < 2) return undefined;
    const timer = window.setInterval(() => {
      setHeroIndex((index) => (index + 1) % heroCount);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [heroCount]);

  const moveHero = (direction: 1 | -1) => {
    if (!heroCount) return;
    setHeroIndex((index) => (index + direction + heroCount) % heroCount);
  };

  return (
    <div className="desktop-home-cinema px-6 pb-9 pt-3">
      <Seo title="StreamNyaa Desktop Cinema" description="StreamNyaa desktop app home." canonicalPath="/" robots="noindex, nofollow" />

      <section className="relative overflow-hidden rounded-lg border border-white/9 bg-[#101014] shadow-2xl shadow-black/45">
        <div className="relative h-[350px]">
          {hero ? (
            <img
              src={imageFor(hero)}
              alt={hero.title}
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
              referrerPolicy="no-referrer"
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,12,15,0.96)_0%,rgba(12,12,15,0.74)_31%,rgba(12,12,15,0.22)_61%,rgba(12,12,15,0.75)_100%),linear-gradient(0deg,rgba(12,12,15,0.62)_0%,transparent_42%)]" />

          <div className="relative flex h-full items-center px-14">
            <div className="max-w-[560px]">
              <h1 className="line-clamp-1 text-[36px] font-semibold leading-tight tracking-[-0.03em] text-white md:text-[42px]">
                {hero?.title || 'StreamNyaa'}
              </h1>
              <p className="mt-1 line-clamp-1 text-[18px] font-normal text-white/82">
                {hero?.title_english || hero?.title_japanese || 'Desktop anime cinema'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[12px] font-medium text-white/86">
                <span className="rounded bg-white/12 px-2.5 py-1 backdrop-blur">{hero?.year || hero?.aired?.prop?.from?.year || '2026'}</span>
                <span className="rounded bg-white/12 px-2.5 py-1 backdrop-blur">{hero?.rating?.replace(' - ', '-') || 'TV-MA'}</span>
                <span className="rounded bg-white/12 px-2.5 py-1 backdrop-blur">{hero?.episodes || 'TBA'} Episodes</span>
                <span className="rounded bg-white/12 px-2.5 py-1 backdrop-blur">HD</span>
                <span className="rounded bg-white/12 px-2.5 py-1 backdrop-blur">Multi Audio</span>
              </div>
              <p className="mt-5 max-w-[500px] text-[15px] leading-7 text-white/72">{heroDescription(hero)}</p>
              <div className="mt-7 flex gap-3">
                <Link
                  to={watchPathFor(hero, hero?.latestEpisode)}
                  className="inline-flex h-11 items-center gap-3 rounded-md bg-primary px-6 text-[16px] font-medium text-white shadow-xl shadow-primary/20 hover:bg-primary/90"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Watch Now
                </Link>
                <Link
                  to={hero ? animePath(hero) : '/search'}
                  className="inline-flex h-11 items-center gap-3 rounded-md border border-white/13 bg-white/10 px-6 text-[16px] font-medium text-white shadow-xl shadow-black/20 backdrop-blur hover:bg-white/14"
                >
                  <Info className="h-4 w-4" />
                  More Info
                </Link>
              </div>
            </div>
          </div>

          <div className="absolute right-12 top-1/2 flex -translate-y-1/2 gap-6">
            <button
              type="button"
              onClick={() => moveHero(-1)}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/36 text-white/80 backdrop-blur hover:bg-white/15"
              aria-label="Previous seasonal pick"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => moveHero(1)}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/36 text-white/80 backdrop-blur hover:bg-white/15"
              aria-label="Next seasonal pick"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {heroCount > 1 ? (
            <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 gap-4">
              {heroPool.map((anime: any, item: number) => (
                <button
                  key={anime.mal_id || anime.title || item}
                  type="button"
                  onClick={() => setHeroIndex(item)}
                  className={`h-2 w-2 rounded-full transition-all ${item === heroIndex ? 'bg-primary' : 'bg-white/28 hover:bg-white/60'}`}
                  aria-label={`Show seasonal pick ${item + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-7">
        <RailHeader title="Continue Watching" to="/local-player?desktop=1" />
        <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
          {recentSources.map((source) => <SourceCard key={source.magnet} source={source} />)}
          {(recentSources.length ? continueItems.slice(0, 5 - recentSources.length) : continueItems).map((anime: any, index: number) => (
            <ContinueCard key={`continue-${anime.mal_id || index}`} anime={anime} to={watchPathFor(anime, anime.latestEpisode || index + 1)} episode={anime.latestEpisode || index + 1} />
          ))}
          {!recentSources.length && !continueItems.length ? (
            <>
              <Link to="/search" className="grid h-[118px] w-[238px] shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-white/60">
                <span className="inline-flex items-center gap-2 text-sm font-medium"><Search className="h-4 w-4" /> Find anime</span>
              </Link>
              {isLoading ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[118px] w-[238px] shrink-0 animate-pulse rounded-lg bg-white/[0.06]" />) : null}
            </>
          ) : null}
        </div>
      </section>

      <section className="mt-7">
        <RailHeader title="New Episodes" to="/schedule" />
        <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
          {latestEpisodes.map((anime: any, index: number) => (
            <ContinueCard key={`latest-${anime.mal_id || index}`} anime={anime} to={watchPathFor(anime, anime.latestEpisode || index + 1)} episode={anime.latestEpisode || index + 1} />
          ))}
        </div>
      </section>

      <section className="mt-7">
        <RailHeader title="Trending Now" to="/search?sort=trending&status=airing" />
        <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
          {trending.map((anime: any, index: number) => (
            <ContinueCard key={`trending-${anime.mal_id || index}`} anime={anime} to={animePath(anime)} episode={anime.episodes || index + 1} />
          ))}
        </div>
      </section>

      <section className="mt-7">
        <RailHeader title="Popular Picks" to="/search?sort=popular" />
        <div className="flex gap-5 overflow-x-auto pb-2 hide-scrollbar">
          {popular.map((anime: any, index: number) => (
            <ContinueCard key={`popular-${anime.mal_id || index}`} anime={anime} to={animePath(anime)} episode={anime.episodes || index + 1} />
          ))}
        </div>
      </section>
    </div>
  );
}
