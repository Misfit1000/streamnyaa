import '../styles/desktop-preferences.css';
import { useHistoryArchivePage } from '../lib/useHistoryArchivePage';
import { historySource, historyRequest, historyAnime, historyArchiveReady, subscribeHistoryArchive, type HistoryEpisode, type AnimeTrackingSummary } from '../lib/desktopHistoryArchive';
import DesktopBookmarkButton from '../components/DesktopBookmarkButton';
import { useHideEpisodeSpoilers } from '../lib/desktopSpoilers';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Bookmark, Clock3, History, Play, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import AnimeCard from '../components/AnimeCard';
import DesktopLibraryOrganizer from '../components/DesktopLibraryOrganizer';
import DesktopDownloads from '../components/DesktopDownloads';
import Seo from '../components/Seo';
import { animeIdentity } from '../lib/animeIdentity';
import {
  formatPlaybackTime,
  loadLocalPlaybackHistory,
  openLocalSourceNow,
  subscribeLocalPlaybackHistory,
  type LocalPlaybackSource,
} from '../lib/desktop';
import { desktopWatchPath } from '../lib/desktopAnimeRoute';
import { useStore } from '../store/useStore';

type LibraryFilter = 'all' | 'bookmarks' | 'favorites';
type LibrarySort = 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'score-desc' | 'score-asc';
type LibraryCategory = 'watching' | 'completed' | 'plan' | 'favorites' | 'bookmarks' | 'history' | 'offline' | 'collections';

function titleFor(anime: any) {
  return String(anime?.title || anime?.title_english || anime?.title_romaji || '').trim();
}

function scoreFor(anime: any) {
  const score = Number(anime?.score || anime?.meanScore || anime?.averageScore || 0);
  return Number.isFinite(score) ? score : 0;
}

export default function DesktopLibrary() {
  const navigate=useNavigate();
  const hideSpoilers = useHideEpisodeSpoilers();
  const { myList, likedAnimes, clearMyList, isLiked, isInMyList } = useStore();
  const [query, setQuery] = useState('');
  const [params, setParams] = useSearchParams();
  const requestedCategory = params.get('tab') || 'bookmarks';
  const rawCategory = ['plan','favorites'].includes(requestedCategory) ? 'bookmarks' : requestedCategory;
  const category: LibraryCategory = ['watching','completed','bookmarks','plan','favorites','history','offline','collections'].includes(rawCategory) ? rawCategory as LibraryCategory : 'watching';
  const setCategory = (value: LibraryCategory) => setParams({tab:value});
  const [filter, setFilter] = useState<LibraryFilter>(category === 'favorites' ? 'favorites' : category === 'plan' ? 'bookmarks' : 'all');
  useEffect(() => { setFilter(category === 'favorites' ? 'favorites' : category === 'plan' ? 'bookmarks' : 'all'); }, [category]);
  const [sortBy, setSortBy] = useState<LibrarySort>('date-desc');
  const [confirmClear, setConfirmClear] = useState(false);
  const [historyItems, setHistoryItems] = useState<LocalPlaybackSource[]>(() => loadLocalPlaybackHistory());
  const [offset,setOffset]=useState(0);
  const archive=useHistoryArchivePage<HistoryEpisode|AnimeTrackingSummary>(category==='history'?'page':'titles',{search:query,offset,status:category==='completed'?'Completed':category==='watching'?'Watching':''});
  const [trackingCounts,setTrackingCounts]=useState({total:0,watchingTitles:0,completedTitles:0});
  useEffect(()=>{setOffset(0);},[category,query]);
  useEffect(()=>{
    const refresh=()=>{if(historyArchiveReady())void historyRequest<typeof trackingCounts>('stats').then(setTrackingCounts).catch(()=>undefined);};
    refresh();const stop=subscribeHistoryArchive(refresh);window.addEventListener('streamnyaa:history-ready',refresh);
    return()=>{stop();window.removeEventListener('streamnyaa:history-ready',refresh);};
  },[]);

  useEffect(() => subscribeLocalPlaybackHistory(() => {
    setHistoryItems(loadLocalPlaybackHistory());
  }), []);

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
        if (filter === 'bookmarks' && !isInMyList(id) && !isLiked(id)) return false;
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

  const normalizedQuery = query.trim().toLowerCase();
  const visibleHistory = useMemo<Array<LocalPlaybackSource & {trackingStatus?:string;caughtUp?:boolean}>>(() => archive.ready ? archive.items.map(value=>{
    if('episode' in value)return historySource(value);
    const t=value as AnimeTrackingSummary;
    return { ...(t.resume?historySource(t.resume):{magnet:'',title:t.metadata.title || t.identity,animeTitle:t.metadata.title || t.identity,animeId:t.metadata.animeId || t.identity,poster:t.metadata.poster,identity:t.identity}), trackingStatus:t.status,caughtUp:t.caughtUp };
  }) : historyItems
    .filter((item) => {
      const progress = Number(item.progressPercent || 0);
      if (category === 'completed' && progress < 92) return false;
      if (category === 'watching' && progress >= 92) return false;
      if (!normalizedQuery) return true;
      return String(item.animeTitle || item.title || '').toLowerCase().includes(normalizedQuery)
        || String(item.title || '').toLowerCase().includes(normalizedQuery)
        || String(item.episode || '').toLowerCase().includes(normalizedQuery);
    })
    .slice(0, 100), [historyItems, category, normalizedQuery,archive.ready,archive.items]);

  const libraryCategories = [
    { id: 'watching' as const, label: 'Watching', count: archive.ready?trackingCounts.watchingTitles:historyItems.filter((item) => Number(item.progressPercent || 0) < 92).length, icon: Play },
    { id: 'completed' as const, label: 'Completed', count: archive.ready?trackingCounts.completedTitles:historyItems.filter((item) => Number(item.progressPercent || 0) >= 92).length, icon: Clock3 },
    { id: 'bookmarks' as const, label: 'Bookmarks', count: stats.all, icon: Bookmark },
    { id: 'offline' as const, label: 'Offline & Downloads', count: '↗', icon: Play },
    { id: 'collections' as const, label: 'Collections', count: '↗', icon: Bookmark },
    { id: 'history' as const, label: 'History', count: archive.ready?trackingCounts.total:historyItems.length, icon: History },
  ];

  const showsHistoryRows = category === 'watching' || category === 'completed' || category === 'history';

  // Preserve the existing DOM, focus and scroll geometry while unrelated dialog
  // state changes. Each card still receives its own store/subscription updates.
  const historyRows = useMemo(() => showsHistoryRows ? visibleHistory.map((source) => {
    const progress = Math.max(0, Math.min(100, Number(source.progressPercent || 0)));
    const title = source.animeTitle || source.title;
    const artwork = hideSpoilers ? source.poster : source.image || source.poster || source.banner;
    const watchPath = desktopWatchPath(historyAnime(source), source.episode ? { ep: String(source.episode) } : undefined);
    return (
      <article key={`${source.magnet}-${source.episode || 'recent'}`} className="sn-card-hover sn-glass-card grid gap-4 rounded-xl p-3 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-white/[0.055]">
          {artwork ? (
            <img src={artwork} alt={title} className="h-full w-full object-cover" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          ) : (
            <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(244,63,94,0.32),transparent_34%),linear-gradient(145deg,#171017,#07070a)] text-xs font-semibold normal-case tracking-normal text-white/52">
              StreamNyaa
            </div>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-black/58 px-2 py-0.5 text-[10px] font-semibold normal-case text-white/78 backdrop-blur">
            EP {source.episode || '?'}
          </span>
        </div>
        <div className="min-w-0 py-1">
          <h2 className="line-clamp-1 text-base font-semibold text-white">{title}</h2>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-white/48">{hideSpoilers ? (source.episode ? `Episode ${source.episode}` : 'Saved source') : source.title}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs font-semibold text-white/54">
            {source.trackingStatus ? `${source.trackingStatus}${source.caughtUp?' · Caught up':''}` : `Resume ${formatPlaybackTime(source.resumeSeconds)}${source.durationSeconds ? ` / ${formatPlaybackTime(source.durationSeconds)}` : ''} - ${Math.round(progress)}%`}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:flex-col sm:items-stretch sm:justify-center">
          <DesktopBookmarkButton anime={{mal_id:source.animeId,title,images:{jpg:{image_url:source.poster}}}} />
          <button
            type="button"
            onClick={() => {if(!source.magnet && !source.offlineFile)navigate(watchPath);else void openLocalSourceNow(source);}}
            className="sn-primary-action h-10 px-4 text-xs"
          >
            Resume
          </button>
          <Link to={watchPath} className="sn-secondary-action h-10 px-4 text-xs">
            Open page
          </Link>
        </div>
      </article>
    );
  }) : [], [showsHistoryRows, visibleHistory, hideSpoilers,navigate]);
  const bookmarkCards = useMemo(() => !showsHistoryRows && category !== 'offline' && category !== 'collections' ? filteredList.map((anime) => (
    <AnimeCard key={`desktop-library-${animeIdentity(anime)}`} anime={anime} />
  )) : [], [showsHistoryRows, category, filteredList]);

  return (
    <div className="sn-page sn-library py-6">
      <Seo title="Library | StreamNyaa Desktop" description="Desktop anime library." canonicalPath="/my-list" robots="noindex, nofollow" />


      <section className="sn-library-header"><header><h1>My Library</h1><span>{stats.all} bookmarked titles</span></header>
        <nav className="sn-library-tabs" aria-label="Library categories">
          {libraryCategories.map(({ id, label, count, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setCategory(id);
                if (id === 'bookmarks') setFilter('bookmarks');
                else setFilter('all');
              }}
              className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                category === id
                  ? 'bg-primary text-white shadow-none shadow-primary/20'
                  : 'bg-white/[0.055] text-white/62 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm font-semibold">{label}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${category === id ? 'bg-white/18 text-white' : 'bg-black/22 text-white/54'}`}>
                {count}
              </span>
            </button>
          ))}
        </nav>

        <div className="sn-library-toolbar">
          <label className="relative min-w-[180px] flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/36" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search your library" placeholder="Search your library..."
              className="sn-input h-12 w-full pl-12 pr-4"
            />
          </label>

          <div className="sn-glass-card flex rounded-xl p-1">
            {([
              ['all', 'All', Bookmark],
              ['bookmarks', 'Bookmarks', Bookmark],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFilter(value);
                  if (value === 'bookmarks') setCategory('bookmarks');
                }}
                className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${
                  filter === value
                    ? 'bg-primary text-white shadow-none shadow-primary/12'
                    : 'text-white/58 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 ${filter === value ? 'fill-current' : ''}`} />
                {label}
              </button>
            ))}
          </div>

          <label className="sn-glass-card inline-flex h-12 items-center gap-2 rounded-xl px-3">
            <SlidersHorizontal className="h-4 w-4 text-white/42" />
            <select
              aria-label="Sort library" value={sortBy}
              onChange={(event) => setSortBy(event.target.value as LibrarySort)}
              className="bg-transparent text-sm font-semibold text-white outline-none"
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
            className="sn-secondary-action h-12 px-4 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </button>
        </div>
      </section>
      {showsHistoryRows && archive.ready && (offset>0 || archive.nextOffset!==null) && <nav aria-label="Library pages" className="my-4 flex items-center justify-center gap-4"><button className="sn-secondary-action" disabled={!offset} onClick={()=>setOffset(v=>Math.max(0,v-50))}>Previous</button><span className="text-sm text-white/60">{offset+1}–{Math.min(offset+50,archive.total)} of {archive.total}</span><button className="sn-secondary-action" disabled={archive.nextOffset===null} onClick={()=>setOffset(archive.nextOffset!)}>Next</button></nav>}

      {confirmClear ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/72 p-4 backdrop-blur-md">
          <div className="sn-glass-panel w-full max-w-md p-5 shadow-none shadow-black/40">
            <div className="flex items-center gap-3 text-primary">
              <AlertTriangle className="h-6 w-6" />
              <h2 className="text-lg font-semibold text-white">Clear library?</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/56">
              This removes bookmarked anime from this desktop profile. It will not affect playback cache or source history.
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
        {category === 'offline' ? <DesktopDownloads /> : category === 'collections' ? <DesktopLibraryOrganizer anime={combinedList} /> : showsHistoryRows ? (
          visibleHistory.length ? (
            <div className="space-y-3">
              {historyRows}
            </div>
          ) : (
            <div className="sn-empty-state px-6 py-16 text-center">
              <History className="mx-auto h-10 w-10 text-primary" />
              <p className="mt-4 text-lg font-semibold text-white">No {category === 'completed' ? 'completed' : category === 'watching' ? 'in-progress' : 'history'} entries yet.</p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Open an episode source and local resume entries will appear here.</p>
              <Link to="/search" className="sn-primary-action mt-5 h-11 px-5">
                Explore anime
              </Link>
            </div>
          )
        ) : combinedList.length === 0 ? (
          <div className="sn-empty-state px-6 py-16 text-center">
            <Bookmark className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-4 text-lg font-semibold text-white">Your library is empty.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Bookmark anime from Explore to build a desktop library.</p>
            <Link to="/search" className="sn-primary-action mt-5 h-11 px-5">
              Explore anime
            </Link>
          </div>
        ) : filteredList.length ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
            {bookmarkCards}
          </div>
        ) : (
          <div className="sn-empty-state px-6 py-16 text-center">
            <p className="text-lg font-semibold text-white">No matching library items.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Clear search or switch the saved/loved filter.</p>
          </div>
        )}
      </section>
    </div>
  );
}
