import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Info, ChevronLeft, ChevronRight } from 'lucide-react';
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
      large_image_url: string;
    };
  };
  genres: { name: string }[];
  score: number;
  type: string;
}

export default function Spotlight({ animeList }: { animeList: Anime[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!animeList || animeList.length === 0) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % animeList.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [animeList]);

  if (!animeList || animeList.length === 0) return <div className="h-[60vh] md:h-[80vh] bg-secondary animate-pulse" />;

  const currentAnime = animeList[currentIndex];

  const nextSlide = () => setCurrentIndex((prev) => (prev + 1) % animeList.length);
  const prevSlide = () => setCurrentIndex((prev) => (prev - 1 + animeList.length) % animeList.length);

  return (
    <div className="relative w-full h-[380px] md:h-[480px] mx-auto max-w-[calc(100%-32px)] md:max-w-[calc(100%-80px)] mt-4 rounded-[24px] overflow-hidden group shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#050507e6] via-[#05050766] to-transparent z-10" />
          <img
            src={currentAnime.banner_image || currentAnime.images.jpg.large_image_url}
            alt={currentAnime.title}
            className="w-full h-full object-cover"
            style={{ 
              objectPosition: currentAnime.banner_image ? 'center center' : 'center 20%',
              backgroundColor: currentAnime.color || 'transparent'
            }}
            referrerPolicy="no-referrer"
          />
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-0 z-20 flex flex-col justify-end px-6 md:px-12 pb-8 md:pb-12">
        <div className="max-w-[500px]">
          <div className="flex items-center flex-wrap gap-2 md:gap-3 mb-3 text-primary font-bold text-[10px] md:text-xs uppercase tracking-wider">
            <span>#{currentIndex + 1} Trending Season</span>
            <span>•</span>
            <span>{currentAnime.genres.slice(0, 2).map(g => g.name).join(', ')}</span>
          </div>

          <motion.h1 
            key={`title-${currentIndex}`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-3xl md:text-[48px] leading-[1.1] font-extrabold text-white mb-3 md:mb-4 line-clamp-2"
          >
            {currentAnime.title}
          </motion.h1>

          <div className="h-auto opacity-100 md:h-0 overflow-hidden md:group-hover:h-auto md:opacity-0 md:group-hover:opacity-100 transition-all duration-300 ease-in-out">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <p className="text-muted-foreground text-[12px] md:text-[13px] line-clamp-2 md:line-clamp-3 mb-4 md:mb-5">
                {currentAnime.synopsis}
              </p>
            </motion.div>
          </div>

          <motion.div 
            key={`btns-${currentIndex}`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-row flex-wrap md:flex-row gap-2 md:gap-3 mt-4"
          >
            <Link
              to={animePath(currentAnime, '/downloads')}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-all hover:bg-primary/90 md:min-w-[160px]"
            >
              <Download className="w-4 h-4" />
              Download Now
            </Link>
            <Link
              to={animePath(currentAnime)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white/10 backdrop-blur-md text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-all hover:bg-white/20 md:min-w-[160px]"
            >
              <Info className="w-4 h-4" />
              Details
            </Link>
          </motion.div>
        </div>
      </div>

      <div className="absolute bottom-4 md:bottom-8 right-4 md:right-8 z-30 flex items-center gap-2 md:gap-4">
        <div className="flex gap-1.5 md:gap-2 mr-2 md:mr-4">
          {animeList.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-1.5 rounded-full transition-all duration-500 ${idx === currentIndex ? 'w-6 bg-primary' : 'w-2 bg-white/30'}`}
            />
          ))}
        </div>
        <button onClick={prevSlide} className="p-1.5 md:p-2 rounded-full bg-background/50 hover:bg-background text-foreground backdrop-blur transition-colors">
          <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
        </button>
        <button onClick={nextSlide} className="p-1.5 md:p-2 rounded-full bg-background/50 hover:bg-background text-foreground backdrop-blur transition-colors">
          <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>
    </div>
  );
}
