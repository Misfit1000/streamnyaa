import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Heart, Plus, Star } from 'lucide-react';
import { useStore } from '../store/useStore';
import { animePath } from '../lib/slug';
import { fetchAnimeDetails } from '../api/jikan';
import { isDesktopApp } from '../lib/desktop';
import { animeIdentity } from '../lib/animeIdentity';
import { desktopWatchOrBrowsePath } from '../lib/desktopAnimeRoute';

interface AnimeCardProps {
  anime: any;
  key?: React.Key;
}

function imageCandidatesFor(anime: any) {
  const fallbackId = Number(anime?.anilist_id || anime?.id || 0);
  const fallbackCover = fallbackId > 0 ? `https://img.anili.st/media/${fallbackId}` : '';
  return [
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.webp?.image_url,
    anime?.images?.jpg?.image_url,
    fallbackCover,
    anime?.banner_image,
  ]
    .map((value) => String(value || '').trim())
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

export default function AnimeCard({ anime }: AnimeCardProps) {
  const desktop = isDesktopApp();
  const queryClient = useQueryClient();
  const { isInMyList, addToMyList, removeFromMyList, isLiked, toggleLike } = useStore();
  const animeId = animeIdentity(anime);
  const inList = isInMyList(animeId);
  const liked = isLiked(animeId);
  const detailPath = animePath(anime);
  const cardPath = desktop ? desktopWatchOrBrowsePath(anime) : detailPath;
  const routeId = detailPath.split('/').pop() || animeId;
  const imageCandidates = useMemo(() => imageCandidatesFor(anime), [anime]);
  const [imageIndex, setImageIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const currentImage = imageCandidates[imageIndex] || '';

  useEffect(() => {
    setImageIndex(0);
    setImageFailed(false);
  }, [detailPath, imageCandidates.join('|')]);

  const prefetchAnime = () => {
    if (desktop) return;
    queryClient.prefetchQuery({
      queryKey: ['anime', routeId],
      queryFn: () => fetchAnimeDetails(routeId),
      staleTime: 1000 * 60 * 30,
    });
  };

  const handleListToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    if (inList) {
      removeFromMyList(animeId);
    } else {
      addToMyList(anime);
    }
  };

  const handleLikeToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    toggleLike(anime);
  };

  return (
    <Link
      to={cardPath}
      onMouseEnter={prefetchAnime}
      onFocus={prefetchAnime}
      className="group relative block w-full"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-secondary shadow-lg shadow-black/16 ring-1 ring-white/[0.03]">
        {currentImage && !imageFailed ? (
          <img
            key={currentImage}
            src={currentImage}
            alt={anime.title}
            className="h-full w-full object-cover origin-center transition-transform duration-300 group-hover:scale-105"
            style={{ imageRendering: 'auto' }}
            decoding="async"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => {
              setImageIndex((value) => {
                if (value < imageCandidates.length - 1) {
                  return value + 1;
                }
                setImageFailed(true);
                return value;
              });
            }}
          />
        ) : (
          <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_35%_20%,rgba(225,29,72,0.36),transparent_34%),linear-gradient(145deg,#1b1118,#07070a)] p-3">
            <span className="line-clamp-3 text-sm font-black leading-tight text-white/78">{anime.title || 'Anime'}</span>
          </div>
        )}

        <div className="absolute top-2 left-2 z-30 flex gap-1 transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100">
          <button
            onClick={handleLikeToggle}
            className="rounded-md bg-black/50 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-primary text-primary' : ''}`} />
          </button>
          <button
            onClick={handleListToggle}
            className="rounded-md bg-black/50 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            {inList ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/20 to-transparent p-3">
          <div className="mb-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-white">
            {anime.title}
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-300">
            <span>{anime.latestEpisode ? `EP ${anime.latestEpisode}` : (anime.episodes ? `EP ${anime.episodes}` : anime.type)}</span>
            <span className="inline-flex items-center gap-1 font-medium text-yellow-400">
              <Star className="h-3.5 w-3.5 fill-current" />
              {anime.score || 'N/A'}
            </span>
          </div>
        </div>

        <div className="absolute top-2 right-2 z-10 rounded bg-black/50 p-1 backdrop-blur-sm">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
        </div>
      </div>
    </Link>
  );
}
