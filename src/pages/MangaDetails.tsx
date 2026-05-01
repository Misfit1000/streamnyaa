import React, { useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchMangaDetails } from '../api/jikan';
import { Heart, Star, Calendar, BookOpen, ChevronLeft, ChevronRight, Hash } from 'lucide-react';
import { useStore } from '../store/useStore';
import { motion } from 'motion/react';

export default function MangaDetails() {
  const { id } = useParams<{ id: string }>();
  const { isInMyList, addToMyList, removeFromMyList } = useStore();
  const relationsScrollRef = useRef<HTMLDivElement>(null);

  const scroll = (ref: React.RefObject<HTMLDivElement>, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = direction === 'left' ? -300 : 300;
      ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['manga', id],
    queryFn: () => fetchMangaDetails(id!),
    enabled: !!id,
    retry: false
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-8 max-w-md">
          <p className="text-red-500 font-bold mb-4">{error.message || 'An error occurred while fetching details.'}</p>
          <Link to="/" className="text-sm font-semibold text-primary hover:underline">Return Home</Link>
        </div>
      </div>
    );
  }

  if (!data?.data) return <div className="text-center py-20 font-bold">Manga not found</div>;

  const manga = data.data;
  const inList = isInMyList(manga.mal_id);

  const handleListToggle = () => {
    if (inList) removeFromMyList(manga.mal_id);
    else addToMyList({
      mal_id: manga.mal_id,
      title: manga.title,
      images: manga.images,
      type: 'Manga',
      genres: manga.genres || [],
      score: manga.score
    } as any);
  };

  return (
    <div className="relative min-h-screen pb-20">
      <div className="absolute top-0 left-0 w-full h-[500px] z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background z-10" />
        <img 
          src={manga.banner_image || manga.images.jpg.large_image_url} 
          alt={manga.title}
          className="w-full h-full object-cover opacity-20 blur-sm"
          referrerPolicy="no-referrer"
        />
      </div>

      <div className="container mx-auto px-4 pt-32 relative z-10 max-w-6xl">
        <div className="flex items-center gap-2 text-sm font-bold text-primary mb-6">
          <BookOpen className="w-4 h-4" />
          MANGA
        </div>

        <div className="flex flex-col md:flex-row gap-8 lg:gap-12">
          <div className="w-[60%] sm:w-[50%] mx-auto md:w-[280px] lg:w-[320px] shrink-0">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl overflow-hidden shadow-2xl relative bg-secondary border border-[var(--glass-border)]"
            >
              <img 
                src={manga.images.jpg.large_image_url} 
                alt={manga.title}
                className="w-full h-auto object-cover"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </div>

          <div className="flex-1">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2 text-foreground leading-tight"
            >
              {manga.title}
            </motion.h1>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex flex-wrap items-center gap-4 sm:gap-6 mb-8 text-sm font-semibold"
            >
              <div className="flex items-center gap-1.5 text-yellow-500 bg-yellow-500/10 px-3 py-1.5 rounded-full">
                <Star className="w-4 h-4 fill-current" />
                {manga.score || 'N/A'}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                {manga.year || 'N/A'}
              </div>
              {manga.chapters && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Hash className="w-4 h-4" />
                  {manga.chapters} Chapters
                </div>
              )}
              {manga.volumes && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <BookOpen className="w-4 h-4" />
                  {manga.volumes} Volumes
                </div>
              )}
              <div className="text-primary bg-primary/10 px-3 py-1.5 rounded-full uppercase tracking-wider text-[11px] font-black">
                {manga.status || 'N/A'}
              </div>
            </motion.div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-8">
              <button
                onClick={handleListToggle}
                className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all shadow-sm active:scale-95 ${
                  inList 
                    ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30' 
                    : 'bg-secondary text-foreground hover:bg-secondary/80'
                }`}
              >
                <Heart className={`w-5 h-5 ${inList ? 'fill-current' : ''}`} />
                {inList ? 'In List' : 'Add to List'}
              </button>
            </div>

            <div className="bg-[var(--glass)] border border-[var(--glass-border)] rounded-2xl p-6 md:p-8 mb-8 backdrop-blur-md">
              <h3 className="text-lg font-bold mb-4">Synopsis</h3>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line text-sm sm:text-base">
                {manga.synopsis || 'No synopsis available.'}
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold mb-2">Genres</h3>
              <div className="flex flex-wrap gap-2">
                {manga.genres?.map((g: any) => (
                  <Link
                    key={g.name}
                    to={`/search?genre=${g.name}`}
                    className="px-3 py-1 bg-secondary/50 hover:bg-secondary text-sm rounded-full text-foreground transition-colors"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>

            {manga.relations && manga.relations.length > 0 && (
              <div className="relative group/carousel">
                <h3 className="text-lg font-bold mb-4 mt-8 pt-6 border-t border-[var(--glass-border)]">Related Media</h3>
                <button 
                  onClick={() => scroll(relationsScrollRef, 'left')}
                  className="absolute left-0 top-[60%] -translate-y-1/2 -ml-4 z-10 p-2 bg-background/80 backdrop-blur border border-[var(--glass-border)] rounded-full shadow-lg opacity-0 group-hover/carousel:opacity-100 transition-opacity disabled:opacity-0 hidden md:flex"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div ref={relationsScrollRef} className="flex overflow-x-auto gap-4 pb-4 snap-x pr-4 scroll-smooth hide-scrollbar w-full">
                    {manga.relations.flatMap((r: any) => 
                      r.entry.map((entry: any) => (
                        <Link 
                          key={`${r.relation}-${entry.mal_id}`} 
                          to={`/${entry.type === 'MANGA' ? 'manga' : 'anime'}/${entry.mal_id}`}
                          className="flex-none w-[140px] sm:w-[160px] md:w-[180px] group snap-start"
                        >
                          <div className="aspect-[2/3] rounded-xl overflow-hidden mb-3 relative bg-secondary border border-[var(--glass-border)]">
                            <img 
                              src={entry.images?.jpg?.large_image_url || entry.images?.jpg?.image_url} 
                              alt={entry.name}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                              loading="lazy"
                            />
                            <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm px-2 py-1 rounded-md shadow-sm">
                               <span className="text-[11px] uppercase font-black text-primary tracking-wider">{r.relation.replace(/_/g, ' ')}</span>
                            </div>
                          </div>
                          <h4 className="text-sm font-semibold line-clamp-2 transition-colors group-hover:text-primary leading-tight">{entry.name}</h4>
                          <p className="text-xs text-muted-foreground mt-1.5 capitalize font-medium">{entry.type}</p>
                        </Link>
                      ))
                    )}
                </div>
                <button 
                  onClick={() => scroll(relationsScrollRef, 'right')}
                  className="absolute right-0 top-[60%] -translate-y-1/2 -mr-4 z-10 p-2 bg-background/80 backdrop-blur border border-[var(--glass-border)] rounded-full shadow-lg opacity-0 group-hover/carousel:opacity-100 transition-opacity disabled:opacity-0 hidden md:flex"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
