import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, ChevronLeft, ChevronRight, Download, Info, Star, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { animePath } from '../lib/slug';

interface Anime {
  mal_id: number;
  title: string;
  synopsis: string;
  banner_image?: string;
  color?: string;
  images: {
    jpg: {
      image_url?: string;
      large_image_url: string;
    };
  };
  genres: { name: string }[];
  score: number;
  type: string;
  episodes?: number;
  status?: string;
  year?: number;
}

export default function Spotlight({ animeList }: { animeList: Anime[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!animeList?.length) return undefined;
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % animeList.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [animeList]);

  if (!animeList?.length) {
    return <div className="mx-auto mt-4 h-[520px] w-full max-w-[calc(100%-24px)] animate-pulse rounded-[24px] bg-secondary md:max-w-[calc(100%-80px)]" />;
  }

  const currentAnime = animeList[currentIndex] || animeList[0];
  const showcaseList = animeList.slice(0, 6);
  const heroImage = currentAnime.banner_image || currentAnime.images?.jpg?.large_image_url || currentAnime.images?.jpg?.image_url;
  const posterImage = currentAnime.images?.jpg?.large_image_url || currentAnime.images?.jpg?.image_url;
  const genres = currentAnime.genres?.slice(0, 3).map((genre) => genre.name).filter(Boolean) || [];
  const score = currentAnime.score ? currentAnime.score.toFixed(1).replace(/\.0$/, '') : 'N/A';

  const nextSlide = () => setCurrentIndex((prev) => (prev + 1) % animeList.length);
  const prevSlide = () => setCurrentIndex((prev) => (prev - 1 + animeList.length) % animeList.length);

  return (
    <section className="relative mx-auto mt-4 w-full max-w-[calc(100%-24px)] overflow-hidden rounded-[24px] border border-[var(--glass-border)] bg-black shadow-[0_24px_60px_rgba(0,0,0,0.42)] md:max-w-[calc(100%-80px)]">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.75, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          <div className="absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(5,5,7,0.97),rgba(5,5,7,0.78)_42%,rgba(5,5,7,0.28)_74%,rgba(5,5,7,0.76)),linear-gradient(180deg,rgba(5,5,7,0.08),rgba(5,5,7,0.92))]" />
          {heroImage ? (
            <img
              src={heroImage}
              alt={currentAnime.title}
              className="h-full w-full object-cover"
              style={{
                objectPosition: currentAnime.banner_image ? 'center center' : 'center 18%',
                backgroundColor: currentAnime.color || 'transparent',
              }}
              referrerPolicy="no-referrer"
            />
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="relative z-20 grid min-h-[520px] gap-8 px-5 py-6 sm:px-7 md:min-h-[580px] md:px-10 md:py-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-end xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="flex min-h-[420px] max-w-3xl flex-col justify-end pb-2 md:min-h-[500px] lg:pb-10">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-primary">
              <TrendingUp className="h-3.5 w-3.5" />
              #{currentIndex + 1} seasonal showcase
            </span>
            {currentAnime.type ? <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-bold uppercase text-white/80">{currentAnime.type}</span> : null}
            {currentAnime.year ? <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-bold text-white/80">{currentAnime.year}</span> : null}
          </div>

          <motion.h1
            key={`title-${currentIndex}`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.18 }}
            className="max-w-2xl text-4xl font-black leading-[1.02] tracking-tight text-white md:text-6xl lg:text-7xl"
          >
            {currentAnime.title}
          </motion.h1>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-bold text-white/78">
            <span className="inline-flex items-center gap-1.5 text-yellow-400">
              <Star className="h-4 w-4 fill-current" />
              {score}
            </span>
            {genres.length ? <span>{genres.join(' / ')}</span> : null}
            {currentAnime.episodes ? <span>{currentAnime.episodes} episodes</span> : null}
          </div>

          <p className="mt-5 max-w-2xl line-clamp-3 text-sm leading-7 text-white/70 md:text-base">
            {currentAnime.synopsis || 'Explore the current seasonal highlight with anime details, release context, and download discovery tools on StreamNyaa.'}
          </p>

          <motion.div
            key={`buttons-${currentIndex}`}
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.32 }}
            className="mt-6 flex flex-col gap-3 sm:flex-row"
          >
            <Link
              to={animePath(currentAnime, '/downloads')}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-black text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 sm:min-w-[170px]"
            >
              <Download className="h-4 w-4" />
              Download Now
            </Link>
            <Link
              to={animePath(currentAnime)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-black text-white backdrop-blur-md transition-all hover:bg-white/20 sm:min-w-[150px]"
            >
              <Info className="h-4 w-4" />
              Details
            </Link>
          </motion.div>
        </div>

        <aside className="hidden lg:block">
          <div className="rounded-2xl border border-white/12 bg-black/42 p-3 shadow-2xl shadow-black/30 backdrop-blur-md">
            <div className="grid grid-cols-[132px_1fr] gap-4">
              <div className="aspect-[2/3] overflow-hidden rounded-xl border border-white/12 bg-white/5">
                {posterImage ? <img src={posterImage} alt={`${currentAnime.title} poster`} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : null}
              </div>
              <div className="flex flex-col justify-between py-1">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-primary">Featured title</p>
                  <h2 className="mt-2 line-clamp-3 text-xl font-black leading-tight text-white">{currentAnime.title}</h2>
                </div>
                <div className="space-y-2 text-sm font-semibold text-white/68">
                  <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> Seasonal highlight</p>
                  <p>{currentAnime.status || 'Current anime'}{currentAnime.type ? ` / ${currentAnime.type}` : ''}</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="relative z-30 border-t border-white/10 bg-black/52 px-4 py-3 backdrop-blur-md md:px-6">
        <div className="flex items-center gap-3">
          <button onClick={prevSlide} className="hidden rounded-full border border-white/10 bg-white/8 p-2 text-white transition-colors hover:bg-white/15 sm:inline-flex" aria-label="Previous spotlight anime">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {showcaseList.map((anime, idx) => {
              const isActive = idx === currentIndex;
              const image = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
              return (
                <button
                  key={`${anime.mal_id}-${idx}`}
                  onClick={() => setCurrentIndex(idx)}
                  className={`grid min-w-0 grid-cols-[44px_1fr] items-center gap-2 rounded-xl border p-1.5 text-left transition-colors ${isActive ? 'border-primary/60 bg-primary/14' : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/8'}`}
                >
                  <span className="block h-14 w-11 overflow-hidden rounded-lg bg-white/10">
                    {image ? <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block line-clamp-1 text-xs font-black text-white">{anime.title}</span>
                    <span className="mt-1 block text-[10px] font-bold uppercase text-white/45">{anime.type || 'Anime'}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button onClick={nextSlide} className="hidden rounded-full border border-white/10 bg-white/8 p-2 text-white transition-colors hover:bg-white/15 sm:inline-flex" aria-label="Next spotlight anime">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
