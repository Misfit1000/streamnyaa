import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Play, RotateCcw, Search, Trash2 } from 'lucide-react';
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

function historyKey(source: LocalPlaybackSource) {
  return `${source.animeId || source.animeTitle || source.title}:${source.episode || ''}:${source.infoHash || source.magnet || source.title}`;
}

function imageCandidates(source: LocalPlaybackSource) {
  return [source.poster, source.image, source.banner]
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

export default function DesktopHistory() {
  const [history, setHistory] = useState<LocalPlaybackSource[]>(() => loadLocalPlaybackHistory());
  const [status, setStatus] = useState('');

  useEffect(() => subscribeLocalPlaybackHistory(() => {
    setHistory(loadLocalPlaybackHistory());
  }), []);

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
    setStatus('Watch history cleared.');
  };

  const removeOne = (source: LocalPlaybackSource) => {
    removeLocalPlaybackHistoryItem(source);
    setHistory(loadLocalPlaybackHistory());
    setStatus('History item removed.');
  };

  return (
    <div className="px-6 py-6">
      <Seo title="Watch History | StreamNyaa Desktop" description="Local desktop watch history." canonicalPath="/dashboard" robots="noindex, nofollow" />

      <section className="desktop-premium-surface rounded-2xl p-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">History</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">Continue from this device.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
              Resume recent local playback entries. This history is stored locally and can be cleared anytime.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/search"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm font-black text-white/66 transition-colors hover:border-white/18 hover:text-white"
            >
              <Search className="h-4 w-4" />
              Explore
            </Link>
            <button
              type="button"
              onClick={clearAll}
              disabled={!history.length}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 text-sm font-black text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Trash2 className="h-4 w-4" />
              Clear all
            </button>
          </div>
        </div>
      </section>

      {status ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-bold text-white/70">{status}</div>
      ) : null}

      <section className="mt-6">
        {history.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {history.map((source) => {
              const progress = progressPercent(source);
              return (
                <article key={historyKey(source)} className="overflow-hidden rounded-2xl border border-white/8 bg-[#111217]/82 shadow-xl shadow-black/18">
                  <div className="relative aspect-video overflow-hidden bg-black/35">
                    <HistoryImage source={source} />
                    <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,8,12,0.82),rgba(7,8,12,0.12)_58%,transparent)]" />
                    <button
                      type="button"
                      onClick={() => void openSource(source)}
                      className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-primary text-white shadow-lg shadow-primary/20 transition-transform hover:scale-105"
                      aria-label="Resume playback"
                    >
                      <Play className="h-4 w-4 fill-current" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
                      <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="line-clamp-1 text-base font-black text-white">{source.animeTitle || source.title}</h2>
                        <p className="mt-1 line-clamp-1 text-xs font-semibold text-white/42">{source.title}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeOne(source)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.045] text-white/55 transition-colors hover:border-primary/30 hover:text-primary"
                        aria-label="Remove history item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-white/48">
                      {source.episode ? <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1">Episode {source.episode}</span> : null}
                      {source.size ? <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1">{source.size}</span> : null}
                      {source.seeders ? <span className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">{source.seeders} seeders</span> : null}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold text-white/45">
                      <span className="inline-flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {source.resumeSeconds ? `Resume ${formatPlaybackTime(source.resumeSeconds)}` : `${Math.round(progress)}% watched`}
                      </span>
                      <button
                        type="button"
                        onClick={() => void openSource(source)}
                        className="inline-flex items-center gap-2 rounded-lg bg-white/[0.07] px-3 py-2 text-xs font-black text-white/72 transition-colors hover:bg-primary hover:text-white"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Resume
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.06] bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025)_52%,rgba(244,63,94,0.045))] px-6 py-16 text-center shadow-xl shadow-black/18">
            <p className="text-lg font-black text-white">No watch history yet.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">
              Open a source from any watch page and local history will appear here. No account sign-in is required.
            </p>
            <Link
              to="/search"
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-white shadow-lg shadow-primary/18 transition-colors hover:bg-primary/90"
            >
              <Search className="h-4 w-4" />
              Find anime
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
