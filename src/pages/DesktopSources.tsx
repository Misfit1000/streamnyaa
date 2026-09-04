import { FormEvent, memo, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Loader2, Play, Search, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { searchNyaa, type NyaaItem } from '../api/nyaa';
import Seo from '../components/Seo';
import DesktopLoadingProgress from '../components/DesktopLoadingProgress';
import { getTorrentBadges, torrentBadgeClassName, torrentMatchesSourceFilter, type TorrentSourceFilter } from '../lib/torrentBadges';
import {
  loadDesktopAudioPreference,
  openLocalSourceNow,
  saveDesktopAudioPreference,
  subscribeDesktopAudioPreference,
} from '../lib/desktop';
import { sourceFreshnessLabel, sourceQualityLabel, sourceQualityScore } from '../lib/sourceQuality';

const RECENT_SOURCE_SEARCHES_KEY = 'streamnyaa.desktop.recentSourceSearches';

function isBatchSource(title = '') {
  return /\b(batch|complete|season pack|complete season|collection)\b/i.test(title);
}

function sourceEpisode(title = '') {
  const match = title.match(/\b(?:S\d{1,2})?E?(\d{1,3})\b(?!\s*p)/i);
  return match?.[1] || '';
}

function loadRecentSourceSearches() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_SOURCE_SEARCHES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecentSourceSearches(values: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_SOURCE_SEARCHES_KEY, JSON.stringify(values.slice(0, 6)));
  } catch {
    // Best-effort only.
  }
}

const SourceCard = memo(function SourceCard({
  item,
  animeTitle,
  animeId,
  episode: routeEpisode,
  onStatus,
}: {
  item: NyaaItem;
  animeTitle: string;
  animeId?: string;
  episode?: string;
  onStatus: (value: string) => void;
}) {
  const score = sourceQualityScore(item);
  const episode = routeEpisode || sourceEpisode(item.title);

  const play = async () => {
    onStatus(`Opening ${item.title}`);
    try {
      const result = await openLocalSourceNow({
        magnet: item.magnet,
        torrentUrl: item.link,
        infoHash: item.infoHash,
        title: item.title,
        animeTitle: animeTitle || item.title,
        animeId: animeId || undefined,
        episode: episode || null,
        size: item.size,
        seeders: item.seeders,
      });
      onStatus(result?.message || 'Playback request sent.');
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Playback could not start.');
    }
  };

  return (
    <article className="sn-card-hover sn-glass-card group p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white/70">
              {sourceQualityLabel(score)} {score}
            </span>
            <span className="rounded-full border border-white/10 bg-black/28 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white/46">
              {sourceFreshnessLabel(item)}
            </span>
            {episode ? (
              <span className="rounded-full border border-white/10 bg-black/28 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white/56">
                Episode {episode}
              </span>
            ) : null}
          </div>
          <h2 className="break-words text-[15px] font-black leading-6 text-white transition-colors group-hover:text-white/92">{item.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-white/48">
            <span>{item.size}</span>
            <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-green-400">{item.seeders} seeders</span>
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-400">{item.leechers} leechers</span>
            <span>{item.category}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {getTorrentBadges(item).map((badge) => (
              <span key={`${item.infoHash}-${badge.label}`} className={torrentBadgeClassName(badge.tone)}>{badge.label}</span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(item.magnet);
              onStatus('Source link copied.');
            }}
            className="sn-icon-action h-11 min-h-0 w-11 min-w-0 rounded-xl p-0"
            title="Copy source link"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={play}
            className="sn-primary-action h-11 px-5"
          >
            <Play className="h-4 w-4 fill-current" />
            Play
          </button>
        </div>
      </div>
    </article>
  );
});

export default function DesktopSources() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const routeAnimeId = searchParams.get('animeId') || '';
  const routeEpisode = searchParams.get('ep') || '';
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [audioMode, setAudioMode] = useState<'sub' | 'dual'>(() => (
    loadDesktopAudioPreference() === 'sub-preferred' ? 'sub' : 'dual'
  ));
  const [sourceFilter, setSourceFilter] = useState<TorrentSourceFilter>('');
  const [sort, setSort] = useState<'best' | 'seeders' | 'size'>('best');
  const [status, setStatus] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSourceSearches());
  const examples = ['Witch Hat Atelier 07', 'ONE PIECE 1161', 'Jujutsu Kaisen 01'];
  const applyPreset = (preset: 'quality' | 'fastest' | 'small' | 'dual') => {
    if (preset === 'quality') {
      setSourceFilter('quality-1080p');
      setSort('best');
      return;
    }
    if (preset === 'fastest') {
      setSourceFilter('high-seeders');
      setSort('seeders');
      return;
    }
    if (preset === 'small') {
      setSourceFilter('episode');
      setSort('size');
      return;
    }
    setAudioMode('dual');
    setSourceFilter('dual-audio');
    setSort('best');
    saveDesktopAudioPreference('dual-preferred');
  };
  const clearSourceControls = () => {
    setSourceFilter('');
    setSort('best');
    setAudioMode(loadDesktopAudioPreference() === 'sub-preferred' ? 'sub' : 'dual');
    setStatus('Source filters reset.');
  };

  useEffect(() => subscribeDesktopAudioPreference(() => {
    setAudioMode(loadDesktopAudioPreference() === 'sub-preferred' ? 'sub' : 'dual');
  }), []);

  useEffect(() => {
    const routeQuery = searchParams.get('q') || '';
    if (!routeQuery || routeQuery === query) return;
    setInput(routeQuery);
    setQuery(routeQuery);
    setStatus('');
  }, [query, searchParams]);

  const contextualEpisode = query === initialQuery ? routeEpisode : '';
  const contextualAnimeId = query === initialQuery ? routeAnimeId : '';
  const sourceSearchQuery = contextualEpisode
    ? `${query} episode ${String(contextualEpisode).padStart(2, '0')}`
    : query;
  const searchQuery = useQuery({
    queryKey: ['desktop-sources', sourceSearchQuery, audioMode],
    queryFn: ({ signal }) => {
      const audioHint = audioMode === 'dual' ? ' dual audio' : '';
      return searchNyaa(`${sourceSearchQuery}${audioHint}`.trim(), '1_2', '0', '1', {
        deep: true,
        pages: 2,
        wide: audioMode === 'dual',
        signal,
      });
    },
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 3,
    retry: false,
  });

  const results = useMemo(() => {
    const withoutBatches = (searchQuery.data || []).filter((item) => !isBatchSource(item.title));
    const filtered = sourceFilter ? withoutBatches.filter((item) => torrentMatchesSourceFilter(item, sourceFilter)) : withoutBatches;
    return [...filtered].sort((a, b) => {
      if (sort === 'seeders') return b.rawSeeders - a.rawSeeders;
      if (sort === 'size') return a.rawSize - b.rawSize;
      const score = Number(b.sourceScore || 0) - Number(a.sourceScore || 0);
      return score || b.rawSeeders - a.rawSeeders;
    });
  }, [searchQuery.data, sort, sourceFilter]);

  const runSearch = (value: string) => {
    const nextQuery = value.trim();
    setInput(nextQuery);
    setQuery(nextQuery);
    setStatus('');
    if (nextQuery.length >= 2) {
      const nextRecent = [nextQuery, ...recentSearches.filter((item) => item.toLowerCase() !== nextQuery.toLowerCase())].slice(0, 6);
      setRecentSearches(nextRecent);
      saveRecentSourceSearches(nextRecent);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    runSearch(input);
  };

  return (
    <div className="sn-page py-6">
      <Seo title="Source Browser | StreamNyaa Desktop" description="Desktop source search." canonicalPath="/nyaa" robots="noindex, nofollow" />

      <section className="sn-hero-panel p-6">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Sources</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">Search episode sources without batch clutter.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
          Desktop source results are episode-focused by default. Batch and season-pack torrents are hidden here.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-wrap gap-3">
          <label className="relative min-w-[360px] flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/36" />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Search anime title and episode..."
              className="sn-input h-12 w-full pl-12 pr-4"
            />
          </label>
          <button className="sn-primary-action h-12 px-6">
            Search Sources
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-white/46">
          <span className="text-white/34">Examples</span>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                runSearch(example);
              }}
              className="sn-category-chip px-3 py-1.5"
            >
              {example}
            </button>
          ))}
        </div>

        {recentSearches.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-white/46">
            <span className="text-white/34">Recent</span>
            {recentSearches.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => runSearch(item)}
                className="sn-category-chip px-3 py-1.5"
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['quality', 'Best Quality', '1080p exact releases first'],
            ['fastest', 'Fastest Start', 'High-seed individual sources'],
            ['small', 'Small File', 'Smaller episode files first'],
            ['dual', 'Dual Audio', 'Prioritize dual-audio releases'],
          ].map(([preset, label, detail]) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPreset(preset as 'quality' | 'fastest' | 'small' | 'dual')}
              className="sn-card-hover sn-glass-card group p-4 text-left"
            >
              <span className="text-sm font-black text-white">{label}</span>
              <span className="mt-1 block text-xs font-semibold leading-5 text-white/42 group-hover:text-white/55">{detail}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          {(['sub', 'dual'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setAudioMode(item);
                saveDesktopAudioPreference(item === 'sub' ? 'sub-preferred' : 'dual-preferred');
              }}
              className={`sn-category-chip px-4 py-2 text-sm ${audioMode === item ? 'sn-category-chip-active' : ''}`}
            >
              {item === 'dual' ? 'Dual Audio' : 'Sub'}
            </button>
          ))}
          {[
            ['quality-2160p', '4K / 2160p'],
            ['quality-1440p', '2K / 1440p'],
            ['quality-1080p', '1080p'],
            ['quality-720p', '720p'],
            ['trusted', 'Trusted'],
            ['high-seeders', 'High seeders'],
            ['hevc', 'HEVC'],
            ['episode', 'Episode'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSourceFilter(sourceFilter === value ? '' : value as TorrentSourceFilter)}
              className={`sn-category-chip px-3 py-1.5 text-xs ${sourceFilter === value ? 'sn-category-chip-active' : ''}`}
            >
              {label}
            </button>
          ))}
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="sn-select ml-auto h-10 px-3"
          >
            <option value="best">Best Match</option>
            <option value="seeders">Seeders</option>
            <option value="size">Smallest Size</option>
          </select>
          <button
            type="button"
            onClick={clearSourceControls}
            className="sn-secondary-action h-10 px-4 text-sm"
          >
            Clear
          </button>
        </div>
      </section>

      {status ? (
        <div className="sn-glass-card mt-4 px-4 py-3 text-sm font-bold text-white/70">{status}</div>
      ) : null}

      <section className="mt-6">
        {!query || query.trim().length < 2 ? (
          <div className="sn-empty-state px-6 py-16 text-center text-white/56">
            Search by title plus episode, for example: <span className="font-black text-white">Witch Hat Atelier 07</span>
          </div>
        ) : searchQuery.isLoading && !searchQuery.data ? (
          <DesktopLoadingProgress variant="screen" label="Searching verified sources" percent={46} detail="Exact episode matches are checked before broader title aliases." />
        ) : searchQuery.isError && !searchQuery.data ? (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-6 py-10 text-center" role="status">
            <p className="text-lg font-semibold text-white">Search couldn’t finish.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Your search is preserved. Retry when the connection is ready.</p>
            <button type="button" onClick={() => void searchQuery.refetch()} className="sn-primary-action mt-5 h-11 px-5">
              <Loader2 className={`h-4 w-4 ${searchQuery.isFetching ? 'animate-spin' : ''}`} />
              Retry search
            </button>
          </div>
        ) : results.length ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-white/46">
              <span>{results.length} individual sources found</span>
              <span>Batch sources hidden</span>
            </div>
            <div className="sn-glass-panel p-4">
              <p className="mb-3 text-[11px] font-black uppercase tracking-[0.22em] text-primary">Recommended Source</p>
              <SourceCard item={results[0]} animeTitle={query} animeId={contextualAnimeId} episode={contextualEpisode} onStatus={setStatus} />
            </div>
            {results.length > 1 ? (
              <div className="pt-2">
                <div className="mb-3 flex items-center justify-between border-t border-white/8 pt-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/38">More Sources</p>
                  <p className="text-xs font-bold text-white/36">{results.length - 1} alternatives</p>
                </div>
                <div className="space-y-3">
                  {results.slice(1).map((item) => (
                    <SourceCard key={item.infoHash || item.link || item.title} item={item} animeTitle={query} animeId={contextualAnimeId} episode={contextualEpisode} onStatus={setStatus} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : searchQuery.isSuccess ? (
          <div className="sn-empty-state px-6 py-16 text-center">
            <p className="text-lg font-black text-white">No individual episode sources found.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Try the romanized title, remove the episode number, or search a different release spelling.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
