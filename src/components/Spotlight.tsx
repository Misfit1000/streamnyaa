import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Download, Info, PlayCircle, Star, TrendingUp } from 'lucide-react';
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

const imageFor = (anime?: Anime) => anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url || anime?.banner_image || '';

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
    return <div className="mx-auto mt-4 h-[520px] w-full max-w-[calc(100%-24px)] animate-pulse rounded-[28px] bg-secondary md:max-w-[calc(100%-80px)]" />;
  }

  const currentAnime = animeList[currentIndex] || animeList[0];
  const showcaseList = animeList.slice(0, 8);
  const heroImage = currentAnime.banner_image || imageFor(currentAnime);
  const posterImage = imageFor(currentAnime);
  const genres = currentAnime.genres?.slice(0, 3).map((genre) => genre.name).filter(Boolean) || [];
  const score = currentAnime.score ? currentAnime.score.toFixed(1).replace(/\.0$/, '') : 'N/A';

  const nextSlide = () => setCurrentIndex((prev) => (prev + 1) % animeList.length);
  const prevSlide = () => setCurrentIndex((prev) => (prev - 1 + animeList.length) % animeList.length);

  return (
    <section className="relative mx-auto mt-4 w-full max-w-[calc(100%-24px)] overflow-hidden rounded-[28px] border border-[var(--glass-border)] bg-[#050507] shadow-[0_24px_60px_rgba(0,0,0,0.42)] md:max-w-[calc(100%-80px)]">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.72, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          <div className="absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(5,5,7,0.97),rgba(5,5,7,0.82)_38%,rgba(5,5,7,0.38)_70%,rgba(5,5,7,0.78)),linear-gradient(180deg,rgba(5,5,7,0.12),rgba(5,5,7,0.95))]" />
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

      <div className="relative z-20 grid min-h-[500px] gap-8 px-5 py-6 sm:px-7 md:min-h-[560px] md:px-10 md:py-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex max-w-3xl flex-col justify-end self-stretch pb-4 pt-10 lg:justify-center lg:py-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-primary">
              <TrendingUp className="h-3.5 w-3.5" />
              Trending this season
            </span>
            {currentAnime.type ? <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-bold uppercase text-white/80">{currentAnime.type}</span> : null}
          </div>

          <motion.h1
            key={`title-${currentIndex}`}
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.16 }}
            className="max-w-2xl text-4xl font-black leading-[1.04] tracking-tight text-white md:text-5xl lg:text-6xl"
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

          <p className="mt-5 max-w-2xl line-clamp-2 text-sm leading-7 text-white/70 md:text-base">
            {currentAnime.synopsis || 'Explore the current seasonal highlight with anime details, release context, and download discovery tools on StreamNyaa.'}
          </p>

          <motion.div
            key={`buttons-${currentIndex}`}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
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
          <div className="overflow-hidden rounded-[26px] border border-white/12 bg-black/38 p-2 shadow-2xl shadow-black/35 backdrop-blur-md">
            <div className="aspect-[2/3] overflow-hidden rounded-[20px] bg-white/5">
              {posterImage ? <img src={posterImage} alt={`${currentAnime.title} poster`} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : null}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/10 bg-black/36 px-3 py-2 text-center backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase text-white/42">Rank</p>
              <p className="text-sm font-black text-white">#{currentIndex + 1}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/36 px-3 py-2 text-center backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase text-white/42">Score</p>
              <p className="text-sm font-black text-white">{score}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/36 px-3 py-2 text-center backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase text-white/42">Type</p>
              <p className="truncate text-sm font-black text-white">{currentAnime.type || 'TV'}</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="relative z-30 border-t border-white/10 bg-[#070708]/92 px-4 py-3 backdrop-blur-md md:px-6">
        <div className="flex items-center gap-3">
          <div className="hidden min-w-[150px] items-center gap-2 text-sm font-black text-white sm:flex">
            <PlayCircle className="h-4 w-4 text-primary" />
            Hero queue
          </div>
          <button onClick={prevSlide} className="rounded-full border border-white/10 bg-white/8 p-2 text-white transition-colors hover:bg-white/15" aria-label="Previous spotlight anime">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="hide-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
            {showcaseList.map((anime, idx) => {
              const isActive = idx === currentIndex;
              const image = imageFor(anime);
              return (
                <button
                  key={`${anime.mal_id}-${idx}`}
                  onClick={() => setCurrentIndex(idx)}
                  className={`relative h-20 w-14 shrink-0 overflow-hidden rounded-xl border transition-all ${isActive ? 'border-primary shadow-lg shadow-primary/20' : 'border-white/10 opacity-72 hover:border-white/30 hover:opacity-100'}`}
                  aria-label={`Show ${anime.title}`}
                >
                  {image ? <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : null}
                  <span className={`absolute inset-x-1 bottom-1 h-1 rounded-full ${isActive ? 'bg-primary' : 'bg-white/25'}`} />
                </button>
              );
            })}
          </div>
          <button onClick={nextSlide} className="rounded-full border border-white/10 bg-white/8 p-2 text-white transition-colors hover:bg-white/15" aria-label="Next spotlight anime">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
