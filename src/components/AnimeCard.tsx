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
import { preloadDesktopRoute } from '../lib/desktopRoutePreload';

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
    if (desktop) void preloadDesktopRoute(cardPath);
    if (desktop) {
      const [routePath, routeSearch = ''] = cardPath.split('?');
      const desktopRouteId = routePath.split('/').filter(Boolean).pop() || routeId;
      const params = new URLSearchParams(routeSearch);
      const anilistId = params.get('aid') || '';
      const malId = params.get('mid') || '';
      void queryClient.prefetchQuery({
        queryKey: ['anime', desktopRouteId, anilistId, malId],
        queryFn: () => fetchAnimeDetails(desktopRouteId, {
          anilistId,
          malId,
          routeTitle: anime?.title || anime?.title_english || anime?.title_romaji || desktopRouteId,
        }),
        staleTime: 1000 * 60 * 15,
      });
      return;
    }
    void queryClient.prefetchQuery({
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
      className="sn-card-hover group relative block w-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <div className="sn-poster-card relative aspect-[2/3]">
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
            className="sn-icon-action h-8 min-h-0 w-8 min-w-0 rounded-lg p-0 text-white/82"
          >
            <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-primary text-primary' : ''}`} />
          </button>
          <button
            onClick={handleListToggle}
            className="sn-icon-action h-8 min-h-0 w-8 min-w-0 rounded-lg p-0 text-white/82"
          >
            {inList ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end bg-[linear-gradient(0deg,rgba(7,8,12,0.88),rgba(7,8,12,0.20)_48%,transparent)] p-3">
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

        <div className="absolute top-2 right-2 z-10 rounded-lg border border-white/[0.08] bg-black/36 p-1 text-white/78 opacity-80 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
        </div>
      </div>
    </Link>
  );
}
