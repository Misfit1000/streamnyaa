import { Bookmark } from 'lucide-react';
import { useStore } from '../store/useStore';
import { animeIdentity } from '../lib/animeIdentity';
export default function DesktopBookmarkButton({ anime, className = '', label = false }: { anime: any; className?: string; label?: boolean }) {
  const store = useStore();
  const id = animeIdentity(anime);
  const saved = !!store.isInMyList?.(id) || !!store.isLiked?.(id);
  return <button type="button" aria-label={`${saved ? 'Remove bookmark for' : 'Bookmark'} ${anime.title || anime.animeTitle || 'anime'}`} aria-pressed={saved} title={saved ? 'Remove bookmark' : 'Bookmark anime'} className={`sn-bookmark-button ${className}`}
    onPointerDown={event => event.stopPropagation()} onClick={event => {
      event.preventDefault(); event.stopPropagation(); const current = useStore.getState();
      if (saved) { current.removeFromMyList(id); if (current.isLiked(id)) current.toggleLike(anime); }
      else current.addToMyList(anime);
    }}><Bookmark className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />{label && (saved ? 'Bookmarked' : 'Bookmark')}</button>;
}
