import DesktopBookmarkButton from './DesktopBookmarkButton';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Heart, Plus, Star } from 'lucide-react';
import { useStore } from '../store/useStore';
import { animePath } from '../lib/slug';
import { fetchAnimeDetails } from '../api/jikan';
import { isDesktopApp } from '../lib/desktop';
import { animeIdentity } from '../lib/animeIdentity';
import { desktopWatchPath,desktopWatchOrBrowsePath } from '../lib/desktopAnimeRoute';
import { preloadDesktopRoute } from '../lib/desktopRoutePreload';
import { primeDesktopWatchSnapshot } from '../lib/desktopWatchSnapshot';
import { desktopAnimeQueryKey } from '../lib/desktopRequests';
import { createIntentPrefetch } from '../lib/intentPrefetch';
import ScheduleDelayBadge from './ScheduleDelayBadge';

interface AnimeCardProps {
  anime: any;
  key?: React.Key;
  delayLabel?: string;
  destination?: string;
}

function imageCandidatesFor(anime: any) {
  const fallbackId = Number(anime?.anilist_id || 0);
  const fallbackCover = fallbackId > 0 ? `https://img.anili.st/media/${fallbackId}` : '';
  return [
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.webp?.image_url,
    anime?.images?.jpg?.image_url,
    anime?.image,
    fallbackCover,
    anime?.banner_image,
  ]
    .map((value) => String(value || '').trim())
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

export default function AnimeCard({ anime, delayLabel, destination }: AnimeCardProps) {
  const desktop = isDesktopApp();
  const queryClient = useQueryClient();
  const { isInMyList, addToMyList, removeFromMyList, isLiked, toggleLike } = useStore();
  const animeId = animeIdentity(anime);
  const inList = isInMyList(animeId);
  const liked = isLiked(animeId);
  const detailPath = animePath(anime);
  const cardPath = destination || (desktop ? anime.releaseEpisode?desktopWatchPath(anime,{ep:anime.releaseEpisode,type:anime.releaseTrack}):desktopWatchOrBrowsePath(anime) : `${detailPath}${anime.releaseEpisode?`?ep=${anime.releaseEpisode}`:''}`);
  const routeId = detailPath.split('/').pop() || animeId;
  const imageCandidates = useMemo(() => imageCandidatesFor(anime), [anime]);
  const [imageIndex, setImageIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const currentImage = imageCandidates[imageIndex] || '';

  useEffect(() => {
    setImageIndex(0);
    setImageFailed(false);
  }, [detailPath, imageCandidates.join('|')]);

  const prefetchAnime = async (signal:AbortSignal) => {
    if(destination)return;
    if (desktop) void preloadDesktopRoute(cardPath);
    if (desktop) {
      primeDesktopWatchSnapshot(cardPath, anime);
      const [routePath, routeSearch = ''] = cardPath.split('?');
      const desktopRouteId = routePath.split('/').filter(Boolean).pop() || routeId;
      const params = new URLSearchParams(routeSearch);
      const anilistId = params.get('aid') || '';
      const malId = params.get('mid') || '';
      const queryKey=desktopAnimeQueryKey(desktopRouteId, anilistId, malId);
      const saved=queryClient.getQueryState(queryKey);
      if(saved?.data&&Date.now()-saved.dataUpdatedAt<15*60_000)return;
      const result=await fetchAnimeDetails(desktopRouteId, {
          signal, priority:'prefetch',
          anilistId,
          malId,
          routeTitle: anime?.title || anime?.title_english || anime?.title_romaji || desktopRouteId,
      });
      if(!signal.aborted){const updatedAt=Number(result.streamnyaa?.fetchedAt)||Date.now();if((queryClient.getQueryState(queryKey)?.dataUpdatedAt||0)<=updatedAt)queryClient.setQueryData(queryKey,result,{updatedAt});}
      return;
    }
    const queryKey=['anime',routeId];const saved=queryClient.getQueryState(queryKey);
    if(saved?.data&&Date.now()-saved.dataUpdatedAt<30*60_000)return;
    const result=await fetchAnimeDetails(routeId,{signal,priority:'prefetch'});
    if(!signal.aborted){const updatedAt=Number(result.streamnyaa?.fetchedAt)||Date.now();if((queryClient.getQueryState(queryKey)?.dataUpdatedAt||0)<=updatedAt)queryClient.setQueryData(queryKey,result,{updatedAt});}
  };
  const intent=useMemo(()=>createIntentPrefetch(prefetchAnime),[cardPath,routeId,desktop,queryClient,destination]);
  useEffect(()=>()=>intent.cancel(),[intent]);

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
    <div className="relative"><Link
      to={cardPath}
      onMouseEnter={()=>intent.start()}
      onMouseLeave={()=>intent.cancel()}
      onFocus={()=>intent.start(true)}
      onBlur={()=>intent.cancel()}
      onPointerDown={()=>intent.start(true)}
      className="sn-card-hover group relative block w-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <div className="sn-poster-card relative aspect-[2/3]" data-delayed={Boolean(delayLabel)}>
        <ScheduleDelayBadge label={delayLabel}/>
        {anime.releaseEpisode&&<span className="absolute left-2 top-2 z-10 rounded bg-black/80 px-2 py-1 text-xs font-bold">Episode {anime.releaseEpisode}</span>}
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

        {!desktop && <div className="absolute top-2 left-2 z-30 flex gap-1 transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100">
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
        </div>}

        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end bg-[linear-gradient(0deg,rgba(7,8,12,0.88),rgba(7,8,12,0.20)_48%,transparent)] p-3">
          <div className="mb-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-white">
            {anime.title}
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-300">
            <span>{anime.releaseEpisode ? (anime.type || 'Anime') : anime.latestEpisode ? `EP ${anime.latestEpisode}` : (anime.episodes ? `EP ${anime.episodes}` : anime.type)}</span>
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
    </Link>{anime.homeAvailabilityLabel&&<p className="mt-2 text-xs text-muted-foreground">{anime.homeAvailabilityLabel}</p>}{desktop && <DesktopBookmarkButton anime={anime} className="absolute right-3 top-3 z-30" />}</div>
  );
}
