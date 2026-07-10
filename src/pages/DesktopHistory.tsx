import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ExternalLink, Grid2X2, List, Play, RotateCcw, Search, Trash2, X } from 'lucide-react';
import Seo from '../components/Seo';
import {
  clearLocalPlaybackHistory,
  formatPlaybackTime,
  loadLocalPlaybackHistory,
  openLocalSourceNow,
  removeLocalPlaybackHistoryItem,
  subscribeLocalPlaybackHistory,
  type LocalPlaybackSource,
} from '../lib/desktop';
import { desktopWatchPath } from '../lib/desktopAnimeRoute';

type HistoryFilter = 'all' | 'in-progress' | 'completed' | 'recent';
type HistorySort = 'recent' | 'progress' | 'title' | 'episode';
type HistoryView = 'compact' | 'grid';

const COMPLETED_PERCENT = 92;

function historyKey(source: LocalPlaybackSource) {
  return `${source.animeId || source.animeTitle || source.title}:${source.episode || ''}:${source.infoHash || source.magnet || source.title}`;
}

function imageCandidates(source: LocalPlaybackSource) {
  const extended = source as LocalPlaybackSource & {
    thumbnail?: string;
    episodeImage?: string;
    backdrop?: string;
  };
  return [extended.thumbnail, extended.episodeImage, extended.backdrop, source.image, source.banner, source.poster]
    .map((value) => String(value || '').trim())
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

function HistoryImage({ source }: { source: LocalPlaybackSource }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const candidates = useMemo(() => imageCandidates(source), [source]);
  const current = candidates[imageIndex] || '';

  useEffect(() => {
    setImageIndex(0);
    setFailed(false);
  }, [candidates.join('|')]);

  if (!current || failed) {
    return (
      <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_35%_20%,rgba(244,63,94,0.30),transparent_36%),linear-gradient(145deg,#1b1118,#07070a)] p-3">
        <span className="line-clamp-2 text-sm font-black leading-tight text-white/78">{source.animeTitle || source.title}</span>
      </div>
    );
  }

  return (
    <img
      src={current}
      alt={source.animeTitle || source.title}
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        setImageIndex((value) => {
          if (value < candidates.length - 1) return value + 1;
          setFailed(true);
          return value;
        });
      }}
    />
  );
}

function progressPercent(source: LocalPlaybackSource) {
  const direct = Number(source.progressPercent || 0);
  if (Number.isFinite(direct) && direct > 0) return Math.max(0, Math.min(100, direct));
  const resume = Number(source.resumeSeconds || 0);
  const duration = Number(source.durationSeconds || 0);
  if (resume > 0 && duration > 0) return Math.max(0, Math.min(100, (resume / duration) * 100));
  return 0;
}

function isComplete(source: LocalPlaybackSource) {
  const progress = progressPercent(source);
  const resume = Number(source.resumeSeconds || 0);
  const duration = Number(source.durationSeconds || 0);
  return progress >= COMPLETED_PERCENT || (duration > 0 && duration - resume <= 90);
}

function updatedAt(source: LocalPlaybackSource) {
  return Number(source.progressUpdatedAt || source.savedAt || 0);
}

function formatLastWatched(source: LocalPlaybackSource) {
  const value = updatedAt(source);
  if (!value) return 'Recently watched';
  const diff = Date.now() - value;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m ago`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))}h ago`;
  if (diff < 7 * day) return `${Math.max(1, Math.floor(diff / day))}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function resumeLabel(source: LocalPlaybackSource) {
  const resume = Number(source.resumeSeconds || 0);
  const duration = Number(source.durationSeconds || 0);
  if (resume > 0 && duration > 0) return `${formatPlaybackTime(resume)} / ${formatPlaybackTime(duration)}`;
  if (resume > 0) return `Resume ${formatPlaybackTime(resume)}`;
  const progress = progressPercent(source);
  return progress ? `${Math.round(progress)}% watched` : 'Not started';
}

function watchPathForHistory(source: LocalPlaybackSource) {
  return desktopWatchPath(
    {
      mal_id: source.animeId,
      title: source.animeTitle || source.title,
    },
    source.episode ? { episode: source.episode } : undefined,
  );
}

function normalizedSearchValue(source: LocalPlaybackSource) {
  return [
    source.animeTitle,
    source.title,
    source.episode ? `episode ${source.episode}` : '',
    source.size,
    source.seeders ? `${source.seeders} seeders` : '',
  ].join(' ').toLowerCase();
}

function sortHistory(items: LocalPlaybackSource[], sort: HistorySort) {
  return [...items].sort((left, right) => {
    if (sort === 'progress') return progressPercent(right) - progressPercent(left);
    if (sort === 'title') return String(left.animeTitle || left.title).localeCompare(String(right.animeTitle || right.title));
    if (sort === 'episode') return Number(left.episode || 0) - Number(right.episode || 0);
    return updatedAt(right) - updatedAt(left);
  });
}

export default function DesktopHistory() {
  const [history, setHistory] = useState<LocalPlaybackSource[]>(() => loadLocalPlaybackHistory());
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [sort, setSort] = useState<HistorySort>('recent');
  const [view, setView] = useState<HistoryView>('compact');
  const [pendingClear, setPendingClear] = useState<'all' | 'completed' | null>(null);

  useEffect(() => subscribeLocalPlaybackHistory(() => {
    setHistory(loadLocalPlaybackHistory());
  }), []);

  const completedCount = useMemo(() => history.filter(isComplete).length, [history]);
  const inProgressCount = Math.max(0, history.length - completedCount);
  const recentCount = useMemo(
    () => history.filter((source) => updatedAt(source) >= Date.now() - 7 * 24 * 60 * 60 * 1000).length,
    [history],
  );
  const filteredHistory = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const filtered = history.filter((source) => {
      const complete = isComplete(source);
      if (filter === 'in-progress' && complete) return false;
      if (filter === 'completed' && !complete) return false;
      if (filter === 'recent' && updatedAt(source) < recentCutoff) return false;
      if (normalizedQuery && !normalizedSearchValue(source).includes(normalizedQuery)) return false;
      return true;
    });
    return sortHistory(filtered, sort);
  }, [filter, history, query, sort]);
  const filters: Array<{ id: HistoryFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: history.length },
    { id: 'in-progress', label: 'In Progress', count: inProgressCount },
    { id: 'completed', label: 'Completed', count: completedCount },
    { id: 'recent', label: 'Recent', count: recentCount },
  ];

  const openSource = async (source: LocalPlaybackSource) => {
    setStatus(`Opening ${source.animeTitle || source.title}...`);
    try {
      const result = await openLocalSourceNow(source);
      setStatus(result?.message || 'Playback request sent.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Playback could not start.');
    }
  };

  const clearAll = () => {
    clearLocalPlaybackHistory();
    setHistory([]);
    setPendingClear(null);
    setStatus('Watch history cleared.');
  };

  const clearCompleted = () => {
    history.filter(isComplete).forEach(removeLocalPlaybackHistoryItem);
    setHistory(loadLocalPlaybackHistory());
    setPendingClear(null);
    setStatus('Completed watch history cleared.');
  };

  const removeOne = (source: LocalPlaybackSource) => {
    removeLocalPlaybackHistoryItem(source);
    setHistory(loadLocalPlaybackHistory());
    setStatus('History item removed.');
  };

  return (
    <div className="sn-page py-6">
      <Seo title="Watch History | StreamNyaa Desktop" description="Local desktop watch history." canonicalPath="/dashboard" robots="noindex, nofollow" />

      <section className="sn-hero-panel p-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">History</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">Watch history</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
              Resume, search, sort, and clean local playback progress from this device.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/search" className="sn-secondary-action h-11 px-4">
              <Search className="h-4 w-4" />
              Explore
            </Link>
            <button
              type="button"
              onClick={() => setPendingClear('all')}
              disabled={!history.length}
              className="sn-primary-action h-11 px-4 disabled:cursor-not-allowed disabled:opacity-45"
              aria-haspopup="dialog"
            >
              <Trash2 className="h-4 w-4" />
              Clear all
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/[0.045] px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Entries</p>
            <p className="mt-1 text-2xl font-black text-white">{history.length}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.045] px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">In progress</p>
            <p className="mt-1 text-2xl font-black text-white">{inProgressCount}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.045] px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Completed</p>
            <p className="mt-1 text-2xl font-black text-white">{completedCount}</p>
          </div>
        </div>
      </section>

      {status ? (
        <div className="sn-glass-card mt-4 px-4 py-3 text-sm font-bold text-white/70">{status}</div>
      ) : null}

      {pendingClear ? (
        <section role="alertdialog" aria-modal="true" aria-labelledby="history-clear-title" className="sn-glass-panel mt-4 flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p id="history-clear-title" className="font-black text-white">
              {pendingClear === 'all' ? 'Clear all watch history?' : 'Clear completed history?'}
            </p>
            <p className="mt-1 text-sm text-white/52">
              {pendingClear === 'all'
                ? 'This removes local history and Continue Watching progress from this device. Favorites are not affected.'
                : `This removes ${completedCount} completed ${completedCount === 1 ? 'entry' : 'entries'}. In-progress history and favorites stay intact.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPendingClear(null)} className="sn-secondary-action h-10 px-4 text-sm">
              Cancel
            </button>
            <button type="button" onClick={pendingClear === 'all' ? clearAll : clearCompleted} className="sn-primary-action h-10 px-4 text-sm">
              {pendingClear === 'all' ? 'Clear all' : 'Clear completed'}
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        {history.length ? (
          <>
            <div className="sn-glass-card mb-4 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative min-w-[260px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/38" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search title, source, or episode..."
                    className="h-11 w-full rounded-xl border border-white/8 bg-black/28 pl-10 pr-10 text-sm font-semibold text-white outline-none transition focus:border-primary/45 focus:bg-black/42"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-white/48 hover:bg-white/10 hover:text-white"
                      aria-label="Clear history search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </label>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as HistorySort)}
                  className="h-11 rounded-xl border border-white/8 bg-black/38 px-3 text-sm font-black text-white outline-none focus:border-primary/45"
                  aria-label="Sort history"
                >
                  <option value="recent">Recently watched</option>
                  <option value="progress">Progress</option>
                  <option value="title">Title</option>
                  <option value="episode">Episode</option>
                </select>
                <div className="flex rounded-xl bg-white/[0.045] p-1">
                  <button
                    type="button"
                    onClick={() => setView('compact')}
                    className={`grid h-9 w-10 place-items-center rounded-lg transition ${view === 'compact' ? 'bg-primary text-white' : 'text-white/52 hover:text-white'}`}
                    aria-label="Compact history view"
                    aria-pressed={view === 'compact'}
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('grid')}
                    className={`grid h-9 w-10 place-items-center rounded-lg transition ${view === 'grid' ? 'bg-primary text-white' : 'text-white/52 hover:text-white'}`}
                    aria-label="Grid history view"
                    aria-pressed={view === 'grid'}
                  >
                    <Grid2X2 className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingClear('completed')}
                  disabled={!completedCount}
                  className="sn-secondary-action h-11 px-4 text-xs disabled:cursor-not-allowed disabled:opacity-45"
                  aria-haspopup="dialog"
                >
                  Clear completed
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                      filter === item.id
                        ? 'bg-primary text-white shadow-lg shadow-primary/15'
                        : 'bg-white/[0.045] text-white/58 hover:bg-white/[0.075] hover:text-white'
                    }`}
                  >
                    {item.label} <span className="ml-1 text-white/45">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {filteredHistory.length ? (
              <div className={view === 'grid' ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
                {filteredHistory.map((source) => {
                  const progress = progressPercent(source);
                  const complete = isComplete(source);
                  const watchPath = watchPathForHistory(source);
                  return view === 'grid' ? (
                    <article key={historyKey(source)} className="sn-card-hover sn-glass-card overflow-hidden">
                      <div className="relative aspect-video bg-black/35">
                        <HistoryImage source={source} />
                        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,8,12,0.82),rgba(7,8,12,0.12)_58%,transparent)]" />
                        <button
                          type="button"
                          onClick={() => void openSource(source)}
                          className="sn-primary-action absolute left-3 top-3 h-10 min-h-0 w-10 min-w-0 rounded-full p-0"
                          aria-label="Resume playback"
                        >
                          <Play className="h-4 w-4 fill-current" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                      <div className="p-4">
                        <h2 className="line-clamp-1 text-base font-black text-white">{source.animeTitle || source.title}</h2>
                        <p className="mt-1 line-clamp-1 text-xs font-semibold text-white/42">{source.title}</p>
                        <div className="mt-3 flex items-center justify-between gap-2 text-xs font-semibold text-white/45">
                          <span>{resumeLabel(source)}</span>
                          <span>{formatLastWatched(source)}</span>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <button type="button" onClick={() => void openSource(source)} className="sn-primary-action min-h-0 flex-1 rounded-xl px-3 py-2 text-xs">
                            <RotateCcw className="h-3.5 w-3.5" />
                            Resume
                          </button>
                          <button type="button" onClick={() => removeOne(source)} className="sn-icon-action h-9 min-h-0 w-9 min-w-0 rounded-lg p-0 hover:text-primary" aria-label="Remove history item">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ) : (
                    <article key={historyKey(source)} className="sn-card-hover sn-glass-card overflow-hidden">
                      <div className="grid gap-4 p-3 sm:grid-cols-[156px_minmax(0,1fr)_auto] sm:items-center">
                        <button
                          type="button"
                          onClick={() => void openSource(source)}
                          className="group relative aspect-video overflow-hidden rounded-2xl bg-black/35 text-left"
                          aria-label={`Resume ${source.animeTitle || source.title}`}
                        >
                          <HistoryImage source={source} />
                          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,8,12,0.72),transparent_60%)]" />
                          <span className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-primary text-white shadow-lg shadow-primary/20 transition group-hover:scale-105">
                            <Play className="h-4 w-4 fill-current" />
                          </span>
                          <span className="absolute bottom-2 left-3 rounded-lg bg-black/62 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/72">
                            {complete ? 'Completed' : 'Resume'}
                          </span>
                        </button>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {source.episode ? <span className="rounded-lg bg-primary/15 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary">Episode {source.episode}</span> : null}
                            <span className="rounded-lg bg-white/[0.055] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{formatLastWatched(source)}</span>
                          </div>
                          <h2 className="mt-2 line-clamp-1 text-base font-black text-white">{source.animeTitle || source.title}</h2>
                          <p className="mt-1 line-clamp-1 text-xs font-semibold text-white/42">{source.title}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-white/48">
                            <span className="inline-flex items-center gap-2">
                              <Clock className="h-4 w-4 text-primary" />
                              {resumeLabel(source)}
                            </span>
                            {source.size ? <span className="rounded-full bg-white/[0.045] px-2.5 py-1">{source.size}</span> : null}
                            {source.seeders ? <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300">{source.seeders} seeders</span> : null}
                          </div>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2 sm:w-[230px] sm:justify-end">
                          <button type="button" onClick={() => void openSource(source)} className="sn-primary-action h-10 px-4 text-xs">
                            <RotateCcw className="h-3.5 w-3.5" />
                            Resume
                          </button>
                          <Link to={watchPath} className="sn-secondary-action h-10 px-3 text-xs">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Watch page
                          </Link>
                          <button type="button" onClick={() => removeOne(source)} className="sn-icon-action h-10 min-h-0 w-10 min-w-0 rounded-xl p-0 hover:text-primary" aria-label="Remove history item">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="sn-empty-state px-6 py-14 text-center">
                <p className="text-lg font-black text-white">No matching history.</p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Adjust the search or filters to find older playback entries.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                  className="sn-secondary-action mt-5 h-11 px-5"
                >
                  Reset filters
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="sn-empty-state px-6 py-16 text-center">
            <p className="text-lg font-black text-white">No watch history yet.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">
              Open a source from any watch page and local history will appear here. No account sign-in is required.
            </p>
            <Link to="/search" className="sn-primary-action mt-5 h-11 px-5">
              <Search className="h-4 w-4" />
              Find anime
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
