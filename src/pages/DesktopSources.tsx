import { FormEvent, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Loader2, Play, Search, SlidersHorizontal } from 'lucide-react';
import { searchNyaa, type NyaaItem } from '../api/nyaa';
import Seo from '../components/Seo';
import { getTorrentBadges, torrentBadgeClassName, torrentMatchesSourceFilter, type TorrentSourceFilter } from '../lib/torrentBadges';
import { openLocalSourceNow } from '../lib/desktop';
import { sourceFreshnessLabel, sourceQualityLabel, sourceQualityScore } from '../lib/sourceQuality';

function isBatchSource(title = '') {
  return /\b(batch|complete|season pack|complete season|collection)\b/i.test(title);
}

function sourceEpisode(title = '') {
  const match = title.match(/\b(?:S\d{1,2})?E?(\d{1,3})\b(?!\s*p)/i);
  return match?.[1] || '';
}

function SourceCard({ item, animeTitle, onStatus }: { item: NyaaItem; animeTitle: string; onStatus: (value: string) => void }) {
  const score = sourceQualityScore(item);
  const episode = sourceEpisode(item.title);

  const play = async () => {
    onStatus(`Opening ${item.title}`);
    try {
      const result = await openLocalSourceNow({
        magnet: item.magnet,
        torrentUrl: item.link,
        infoHash: item.infoHash,
        title: item.title,
        animeTitle: animeTitle || item.title,
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
    <article className="group rounded-xl border border-white/8 bg-white/[0.045] p-4 shadow-xl shadow-black/18 transition-colors hover:border-primary/45 hover:bg-white/[0.065]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/30 bg-primary/12 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary">
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
          <h2 className="break-words text-[15px] font-black leading-6 text-white group-hover:text-primary">{item.title}</h2>
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
            className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-black/30 text-white/72 hover:border-primary/50 hover:text-white"
            title="Copy source link"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={play}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-black text-white shadow-lg shadow-primary/20 hover:bg-primary/90"
          >
            <Play className="h-4 w-4 fill-current" />
            Play
          </button>
        </div>
      </div>
    </article>
  );
}

export default function DesktopSources() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [audioMode, setAudioMode] = useState<'sub' | 'dual'>('sub');
  const [sourceFilter, setSourceFilter] = useState<TorrentSourceFilter>('');
  const [sort, setSort] = useState<'best' | 'seeders' | 'size'>('best');
  const [status, setStatus] = useState('');

  const searchQuery = useQuery({
    queryKey: ['desktop-sources', query, audioMode],
    queryFn: () => {
      const audioHint = audioMode === 'dual' ? ' dual audio' : '';
      return searchNyaa(`${query}${audioHint}`.trim(), '1_2', '0', '1', { deep: true, pages: 2, wide: audioMode === 'dual' });
    },
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 3,
    retry: 1,
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setQuery(input.trim());
    setStatus('');
  };

  return (
    <div className="px-6 py-6">
      <Seo title="Source Browser | StreamNyaa Desktop" description="Desktop source search." canonicalPath="/nyaa" robots="noindex, nofollow" />

      <section className="rounded-lg border border-white/8 bg-[linear-gradient(135deg,rgba(225,29,72,0.13),rgba(255,255,255,0.035)_44%,rgba(0,0,0,0.16))] p-6 shadow-2xl shadow-black/25">
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
              className="h-12 w-full rounded-lg border border-white/10 bg-black/32 pl-12 pr-4 text-sm text-white outline-none placeholder:text-white/36 focus:border-primary/65"
            />
          </label>
          <button className="h-12 rounded-lg bg-primary px-6 text-sm font-black text-white shadow-lg shadow-primary/20 hover:bg-primary/90">
            Search Sources
          </button>
        </form>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          {(['sub', 'dual'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setAudioMode(item)}
              className={`rounded-full border px-4 py-2 text-sm font-black ${audioMode === item ? 'border-primary bg-primary text-white' : 'border-white/10 bg-white/[0.045] text-white/64 hover:border-primary/50 hover:text-white'}`}
            >
              {item === 'dual' ? 'Dual Audio' : 'Sub'}
            </button>
          ))}
          {[
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
              className={`rounded-full border px-3 py-1.5 text-xs font-black ${sourceFilter === value ? 'border-primary bg-primary text-white' : 'border-white/10 bg-white/[0.045] text-white/58 hover:border-primary/50 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="ml-auto h-10 rounded-lg border border-white/10 bg-black/35 px-3 text-sm font-black text-white outline-none"
          >
            <option value="best">Best Match</option>
            <option value="seeders">Seeders</option>
            <option value="size">Smallest Size</option>
          </select>
        </div>
      </section>

      {status ? (
        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{status}</div>
      ) : null}

      <section className="mt-6">
        {!query ? (
          <div className="rounded-3xl border border-white/8 bg-white/[0.04] px-6 py-16 text-center text-white/56">
            Search by title plus episode, for example: <span className="font-black text-white">Witch Hat Atelier 07</span>
          </div>
        ) : searchQuery.isLoading ? (
          <div className="flex items-center justify-center rounded-3xl border border-white/8 bg-white/[0.04] py-20 text-white/60">
            <Loader2 className="mr-3 h-6 w-6 animate-spin text-primary" />
            Searching sources...
          </div>
        ) : results.length ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-white/46">
              <span>{results.length} individual sources found</span>
              <span>Batch sources hidden</span>
            </div>
            {results.map((item) => (
              <SourceCard key={item.infoHash || item.link || item.title} item={item} animeTitle={query} onStatus={setStatus} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/8 bg-white/[0.04] px-6 py-16 text-center text-white/56">
            No individual episode sources found. Try the romanized title or a different episode number.
          </div>
        )}
      </section>
    </div>
  );
}
