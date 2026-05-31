import { useState } from 'react';
import { useStore } from '../store/useStore';
import AnimeCard from '../components/AnimeCard';
import { Bookmark, Trash2, SlidersHorizontal, AlertTriangle, Heart } from 'lucide-react';
import { animeIdentity } from '../lib/animeIdentity';

export default function MyList() {
  const { myList, likedAnimes, clearMyList, isLiked, isInMyList } = useStore();
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'score-desc' | 'score-asc'>('date-desc');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [filterBookmarks, setFilterBookmarks] = useState(true);

  const combinedMap = new Map();
  myList.forEach((anime) => combinedMap.set(animeIdentity(anime), anime));
  (likedAnimes || []).forEach((anime) => combinedMap.set(animeIdentity(anime), anime));
  const combinedList = Array.from(combinedMap.values());

  const getSortedList = () => {
    let filteredList = combinedList;
    
    if (filterFavorites) {
      filteredList = filteredList.filter((anime) => isLiked(animeIdentity(anime)));
    }
    if (filterBookmarks) {
      filteredList = filteredList.filter((anime) => isInMyList(animeIdentity(anime)));
    }
    
    // Add indices so we have stable 'date added' sorting
    const listWithIndices = filteredList.map((anime, idx) => ({ ...anime, _originalIndex: idx }));
    
    return listWithIndices.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return b._originalIndex - a._originalIndex;
        case 'date-asc':
          return a._originalIndex - b._originalIndex;
        case 'title-asc':
          return (a.title || '').localeCompare(b.title || '');
        case 'title-desc':
          return (b.title || '').localeCompare(a.title || '');
        case 'score-desc':
          return (b.score || 0) - (a.score || 0);
        case 'score-asc':
          return (a.score || 0) - (b.score || 0);
        default:
          return 0;
      }
    });
  };

  const sortedList = getSortedList();

  return (
    <div className="container mx-auto px-4 py-8 min-h-[80vh]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Bookmark className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">My List</h1>
            <p className="text-muted-foreground text-sm">Your bookmarked ({combinedList.length})</p>
          </div>
        </div>

        {combinedList.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setFilterBookmarks(!filterBookmarks)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors border ${filterBookmarks ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-secondary border-border text-muted-foreground hover:text-primary hover:border-primary/30'}`}
              title="Show Bookmarked Only"
            >
              <Bookmark className={`w-4 h-4 ${filterBookmarks ? 'fill-current' : ''}`} />
              Bookmarks
            </button>
            <button
              onClick={() => setFilterFavorites(!filterFavorites)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors border ${filterFavorites ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-secondary border-border text-muted-foreground hover:text-red-500 hover:border-red-500/30'}`}
              title="Show Favorites Only"
            >
              <Heart className={`w-4 h-4 ${filterFavorites ? 'fill-current' : ''}`} />
              Favorites
            </button>
            <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-sm font-semibold focus:outline-none text-foreground cursor-pointer w-full"
              >
                <option value="date-desc">Date Added (Newest)</option>
                <option value="date-asc">Date Added (Oldest)</option>
                <option value="title-asc">Title (A-Z)</option>
                <option value="title-desc">Title (Z-A)</option>
                <option value="score-desc">Score (Highest)</option>
                <option value="score-asc">Score (Lowest)</option>
              </select>
            </div>
            
            <button
              onClick={() => setShowConfirmClear(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-sm font-bold transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Remove All
            </button>
          </div>
        )}
      </div>

      {showConfirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border p-6 rounded-2xl max-w-sm w-full shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-4 text-red-500">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Clear My List?</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to remove all items from your list? This will clear both bookmarked and favorited anime. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setShowConfirmClear(false)}
                className="px-4 py-2 font-semibold text-foreground bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  clearMyList();
                  setShowConfirmClear(false);
                }}
                className="px-4 py-2 font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Remove All
              </button>
            </div>
          </div>
        </div>
      )}

      {combinedList.length === 0 ? (
        <div className="text-center py-20 bg-secondary/30 rounded-2xl border border-border border-dashed">
          <Bookmark className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-medium text-foreground mb-2">Your list is empty</h3>
          <p className="text-muted-foreground">Add anime to your list or favorite them to keep track of titles you want to follow.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
          {sortedList.map((anime) => (
            <AnimeCard key={`list-${animeIdentity(anime)}`} anime={anime as any} />
          ))}
        </div>
      )}
    </div>
  );
}
