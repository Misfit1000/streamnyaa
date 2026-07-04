import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bookmark, Heart, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import { animeIdentity } from '../lib/animeIdentity';
import { useStore } from '../store/useStore';

type LibraryFilter = 'all' | 'bookmarks' | 'favorites';
type LibrarySort = 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'score-desc' | 'score-asc';

function titleFor(anime: any) {
  return String(anime?.title || anime?.title_english || anime?.title_romaji || '').trim();
}

function scoreFor(anime: any) {
  const score = Number(anime?.score || anime?.meanScore || anime?.averageScore || 0);
  return Number.isFinite(score) ? score : 0;
}

export default function DesktopLibrary() {
  const { myList, likedAnimes, clearMyList, isLiked, isInMyList } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [sortBy, setSortBy] = useState<LibrarySort>('date-desc');
  const [confirmClear, setConfirmClear] = useState(false);

  const combinedList = useMemo(() => {
    const combined = new Map<string, any>();
    myList.forEach((anime, index) => combined.set(animeIdentity(anime), { ...anime, _libraryIndex: index, _bookmarked: true }));
    (likedAnimes || []).forEach((anime, index) => {
      const id = animeIdentity(anime);
      const existing = combined.get(id);
      combined.set(id, { ...(existing || anime), _liked: true, _likedIndex: index });
    });
    return Array.from(combined.values());
  }, [likedAnimes, myList]);

  const filteredList = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return combinedList
      .filter((anime) => {
        const id = animeIdentity(anime);
        if (filter === 'bookmarks' && !isInMyList(id)) return false;
        if (filter === 'favorites' && !isLiked(id)) return false;
        if (!normalizedQuery) return true;
        return titleFor(anime).toLowerCase().includes(normalizedQuery);
      })
      .map((anime, index) => ({ ...anime, _sortIndex: anime._libraryIndex ?? anime._likedIndex ?? index }))
      .sort((left, right) => {
        if (sortBy === 'date-desc') return Number(right._sortIndex || 0) - Number(left._sortIndex || 0);
        if (sortBy === 'date-asc') return Number(left._sortIndex || 0) - Number(right._sortIndex || 0);
        if (sortBy === 'title-asc') return titleFor(left).localeCompare(titleFor(right));
        if (sortBy === 'title-desc') return titleFor(right).localeCompare(titleFor(left));
        if (sortBy === 'score-desc') return scoreFor(right) - scoreFor(left);
        if (sortBy === 'score-asc') return scoreFor(left) - scoreFor(right);
        return 0;
      });
  }, [combinedList, filter, isInMyList, isLiked, query, sortBy]);

  const stats = {
    all: combinedList.length,
    bookmarks: combinedList.filter((anime) => isInMyList(animeIdentity(anime))).length,
    favorites: combinedList.filter((anime) => isLiked(animeIdentity(anime))).length,
  };

  return (
    <div className="sn-page py-6">
      <Seo title="Library | StreamNyaa Desktop" description="Desktop anime library." canonicalPath="/my-list" robots="noindex, nofollow" />

      <section className="sn-hero-panel p-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Library</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">Saved anime, cleanly organized.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
              Bookmarked and favorited anime stay here for quick desktop access.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-black">
            <span className="sn-glass-card rounded-xl px-3 py-2 text-white/58">
              <span className="block text-base text-white">{stats.all}</span>
              All
            </span>
            <span className="sn-glass-card rounded-xl px-3 py-2 text-white/58">
              <span className="block text-base text-white">{stats.bookmarks}</span>
              Saved
            </span>
            <span className="sn-glass-card rounded-xl px-3 py-2 text-white/58">
              <span className="block text-base text-white">{stats.favorites}</span>
              Loved
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[320px] flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/36" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your library..."
              className="sn-input h-12 w-full pl-12 pr-4"
            />
          </label>

          <div className="sn-glass-card flex rounded-xl p-1">
            {([
              ['all', 'All', Bookmark],
              ['bookmarks', 'Saved', Bookmark],
              ['favorites', 'Loved', Heart],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-black transition-colors ${
                  filter === value
                    ? 'bg-primary text-white shadow-lg shadow-primary/12'
                    : 'text-white/58 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 ${value === 'favorites' && filter === value ? 'fill-current' : ''}`} />
                {label}
              </button>
            ))}
          </div>

          <label className="sn-glass-card inline-flex h-12 items-center gap-2 rounded-xl px-3">
            <SlidersHorizontal className="h-4 w-4 text-white/42" />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as LibrarySort)}
              className="bg-transparent text-sm font-black text-white outline-none"
            >
              <option value="date-desc">Newest</option>
              <option value="date-asc">Oldest</option>
              <option value="title-asc">Title A-Z</option>
              <option value="title-desc">Title Z-A</option>
              <option value="score-desc">Score High</option>
              <option value="score-asc">Score Low</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={!combinedList.length}
            className="sn-primary-action h-12 px-4 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </button>
        </div>
      </section>

      {confirmClear ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/72 p-4 backdrop-blur-md">
          <div className="sn-glass-panel w-full max-w-md p-5 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-3 text-primary">
              <AlertTriangle className="h-6 w-6" />
              <h2 className="text-lg font-black text-white">Clear library?</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/56">
              This removes saved and favorited anime from this desktop profile. It will not affect playback cache or source history.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="sn-secondary-action h-10 px-4 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearMyList();
                  setConfirmClear(false);
                }}
                className="sn-primary-action h-10 px-4 text-sm"
              >
                Clear library
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mt-6">
        {combinedList.length === 0 ? (
          <div className="sn-empty-state px-6 py-16 text-center">
            <Bookmark className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-4 text-lg font-black text-white">Your library is empty.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Save or favorite anime from Explore to build a desktop library.</p>
            <Link to="/search" className="sn-primary-action mt-5 h-11 px-5">
              Explore anime
            </Link>
          </div>
        ) : filteredList.length ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
            {filteredList.map((anime) => (
              <AnimeCard key={`desktop-library-${animeIdentity(anime)}`} anime={anime} />
            ))}
          </div>
        ) : (
          <div className="sn-empty-state px-6 py-16 text-center">
            <p className="text-lg font-black text-white">No matching library items.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Clear search or switch the saved/loved filter.</p>
          </div>
        )}
      </section>
    </div>
  );
}
