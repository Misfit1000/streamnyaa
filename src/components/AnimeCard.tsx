import React from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, Check, Heart } from 'lucide-react';
import { useStore } from '../store/useStore';
import { animePath } from '../lib/slug';

interface AnimeCardProps {
  anime: any;
  key?: React.Key;
}

export default function AnimeCard({ anime }: AnimeCardProps) {
  const { isInMyList, addToMyList, removeFromMyList, isLiked, toggleLike } = useStore();
  const inList = isInMyList(anime.mal_id);
  const liked = isLiked(anime.mal_id);

  const handleListToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    if (inList) {
      removeFromMyList(anime.mal_id);
    } else {
      addToMyList(anime);
    }
  };

  const handleLikeToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    toggleLike(anime);
  };

  return (
    <Link to={animePath(anime)} className="group relative block w-full">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-secondary border border-[var(--glass-border)]">
        <img
          src={anime.images.jpg.large_image_url || anime.images.jpg.image_url}
          alt={anime.title}
          className="w-full h-full object-cover origin-center transition-transform duration-300 group-hover:scale-105"
          // FIX: Changed 'high-quality' to 'auto' to fix the TypeScript/Vercel build error
          style={{ imageRendering: 'auto' }} 
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        
        {/* Actions - visible on mobile, hover on desktop */}
        <div className="absolute top-2 left-2 flex gap-1 z-30 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
          <button 
            onClick={handleLikeToggle}
            className="p-1.5 rounded-md bg-black/50 hover:bg-black/80 text-white backdrop-blur-sm transition-colors"
          >
            <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-primary text-primary' : ''}`} />
          </button>
          <button 
            onClick={handleListToggle}
            className="p-1.5 rounded-md bg-black/50 hover:bg-black/80 text-white backdrop-blur-sm transition-colors"
          >
            {inList ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
        
        {/* Play Icon - center overlay hover only */}
        <div className="absolute inset-0 bg-black/40 opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20 pointer-events-none hidden md:flex">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Gradient Overlay & Info */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-3 z-10 pointer-events-none">
          <div className="text-[13px] font-semibold text-white mb-1 whitespace-nowrap overflow-hidden text-ellipsis">
            {anime.title}
          </div>
          <div className="text-[10px] text-zinc-300 flex justify-between items-center">
            <span>{anime.latestEpisode ? `EP ${anime.latestEpisode}` : (anime.episodes ? `EP ${anime.episodes}` : anime.type)}</span>
            <span className="text-yellow-400 font-medium">⭐ {anime.score || 'N/A'}</span>
          </div>
        </div>

        {/* Download Badge */}
        <div className="absolute top-2 right-2 bg-black/50 p-1 rounded backdrop-blur-sm z-10">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        </div>
      </div>
    </Link>
  );
}