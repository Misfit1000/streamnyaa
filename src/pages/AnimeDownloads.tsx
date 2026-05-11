import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAnimeDetails, fetchAnimeEpisodes } from '../api/jikan';
import { dedupeNyaaItems, searchNyaa } from '../api/nyaa';
import { Download, HardDrive, ArrowLeft, Loader2, AlertTriangle, Languages, Volume2, ListVideo, Link as LinkIcon } from 'lucide-react';
import { useState } from 'react';
import { animePath } from '../lib/slug';
import Seo from '../components/Seo';
import { getTorrentBadges, torrentBadgeClassName, torrentMatchesSourceFilter } from '../lib/torrentBadges';
import type { TorrentSourceFilter } from '../lib/torrentBadges';
import { useAuth } from '../context/AuthContext';
import { saveDownloadHistory } from '../lib/activity';
import { SOURCE_PRESETS, sourceFreshnessLabel, sourceQualityLabel, sourceQualityScore } from '../lib/sourceQuality';

type AudioFilter = 'sub' | 'dub';

function sourceHealth(seedCount: number) {
  if (seedCount >= 100) return 'Fast';
  if (seedCount >= 50) return 'Healthy';
  if (seedCount >= 15) return 'Usable';
  return 'Low seed';
}

function releaseTrackerText(anime: any, selectedEpisodeNumber?: number | null) {
  const nextEpisode = anime?.nextAiringEpisode?.episode;
  const nextAiringAt = anime?.nextAiringEpisode?.airingAt;
  if (selectedEpisodeNumber) return `Episode ${selectedEpisodeNumber} selected`;
  if (!nextEpisode || !nextAiringAt) return anime?.status === 'RELEASING' ? 'Currently airing' : 'Release timing unavailable';
  const diffMs = nextAiringAt * 1000 - Date.now();
  const hours = Math.round(Math.abs(diffMs) / 36e5);
  if (diffMs >= 0) return `Episode ${nextEpisode} expected ${hours <= 24 ? 'today' : `in ${Math.ceil(hours / 24)} days`}`;
  return `Episode ${nextEpisode} aired ${hours || 1} hours ago`;
}

export default function AnimeDownloads() {
  const { session, user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const epParam = searchParams.get('ep');
  const typeParam = searchParams.get('type');
  const selectedEpisodeNumber = epParam && /^\d+$/.test(epParam) ? parseInt(epParam, 10) : null;
  const episodePage = selectedEpisodeNumber ? Math.max(1, Math.ceil(selectedEpisodeNumber / 100)) : 1;
  
  // If epParam is present, default filter to empty or "1080p" instead of "[Batch]"
  const [downloadFilter, setDownloadFilter] = useState(epParam ? '1080p' : '[Batch]');
  const [audioFilter, setAudioFilter] = useState<AudioFilter>(typeParam === 'dub' ? 'dub' : 'sub');
  const [sortBy, setSortBy] = useState<'best' | 'seeders' | 'size'>('best');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [sourceFilter, setSourceFilter] = useState<TorrentSourceFilter>('');
  const [showAllSources, setShowAllSources] = useState(false);

  const { data, isLoading: animeLoading } = useQuery({
    queryKey: ['anime', id],
    queryFn: () => fetchAnimeDetails(id!),
    enabled: !!id,
  });

  const anime = data?.data;
  const isBatchView = !epParam && downloadFilter === '[Batch]';
  const isCurrentlyAiring = anime?.status === 'RELEASING';
  const showAiringEpisodeResults = Boolean(isCurrentlyAiring && isBatchView);

  const { data: episodeData } = useQuery({
    queryKey: ['anime-download-episodes', id, episodePage],
    queryFn: () => fetchAnimeEpisodes(id!, episodePage),
    enabled: !!id && !!anime,
  });

  const { data: torrents, isLoading: torrentsLoading } = useQuery({
    queryKey: ['nyaa-download', anime?.title, epParam, downloadFilter, typeParam, audioFilter, showAiringEpisodeResults, showAllSources],
    queryFn: async () => {
      const romaji = anime?.title_romaji;
      const english = anime?.title_english;
      const native = anime?.title;

      const epStr = epParam ? epParam.padStart(2, '0') : '';
      const isDub = audioFilter === 'dub';
      const effectiveDownloadFilter = showAiringEpisodeResults ? '1080p' : downloadFilter;

      const cleanTitle = (t: string) => {
        if (!t) return '';
        return t.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      };

      const performSearch = async (t: string, ep: string) => {
        if (!t) return [];
        let query = `${cleanTitle(t)}`;
        if (ep) query += ` ${ep}`;
        if (effectiveDownloadFilter) query += ` ${effectiveDownloadFilter}`;
        if (isDub) query += ' dub';
        return await searchNyaa(query, '1_2', '0', '1', { pages: showAllSources ? 2 : 1, wide: showAllSources });
      };

      const trySearches = async (epNumStr: string) => {
        const titles = [romaji, english, native].filter((title, index, list): title is string => Boolean(title) && list.indexOf(title) === index);
        if (showAllSources) {
          const searches = await Promise.all(titles.map((title) => performSearch(title, epNumStr)));
          return dedupeNyaaItems(searches.flat());
        }

        for (const title of titles) {
          const items = await performSearch(title, epNumStr);
          if (items.length > 0) return items;
        }
        return [];
      };

      const prefersDub = (title = '') => /\b(dub|dubbed|dual[\s-]?audio|multi[\s-]?audio|english[\s-]?audio|eng[\s-]?dub)\b/i.test(title);
      const applyAudioFilter = (items: Awaited<ReturnType<typeof searchNyaa>>) => {
        const filtered = isDub
          ? items.filter((item) => prefersDub(item.title))
          : items.filter((item) => !prefersDub(item.title));
        return filtered.length ? filtered : items;
      };
      const removeBatchResults = (items: Awaited<ReturnType<typeof searchNyaa>>) => (
        showAiringEpisodeResults
          ? items.filter((item) => !/\b(batch|complete|season pack|complete season)\b/i.test(item.title))
          : items
      );

      let results = await trySearches(epStr);

      // Fallback without padding if still 0
      if (results.length === 0 && epParam && epStr !== epParam) {
        results = await trySearches(epParam);
      }
      
      // Secondary fallback without episode number at all (useful for movies or single OVAs)
      if (results.length === 0 && epParam === '1') {
        results = await trySearches("");
      }
      
      const filteredResults = removeBatchResults(applyAudioFilter(results));
      return filteredResults.length ? filteredResults : applyAudioFilter(results);
    },
    enabled: !!anime?.title,
  });

  if (animeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!anime) return <div className="text-center py-20">Anime not found</div>;

  const sortedTorrents = [...(torrents || [])].filter((torrent) => torrentMatchesSourceFilter(torrent, sourceFilter)).sort((a, b) => {
    if (sortBy === 'best') {
        if (Number(b.sourceScore || 0) !== Number(a.sourceScore || 0)) return Number(b.sourceScore || 0) - Number(a.sourceScore || 0);
        const trustedGroups = ['[SubsPlease]', '[Erai-raws]', '[Judas]', '[Ember]', '[ASW]', '[Cerberus]', '[Yameii]'];
        const trustedA = trustedGroups.some(g => a.title.includes(g)) ? 1 : 0;
        const trustedB = trustedGroups.some(g => b.title.includes(g)) ? 1 : 0;
        if (trustedA !== trustedB) return trustedB - trustedA;
        if (b.rawSeeders !== a.rawSeeders) return b.rawSeeders - a.rawSeeders;
        return b.rawSize - a.rawSize;
    } else if (sortBy === 'seeders') {
        if (b.rawSeeders !== a.rawSeeders) return sortDirection === 'asc' ? a.rawSeeders - b.rawSeeders : b.rawSeeders - a.rawSeeders;
        return sortDirection === 'asc' ? a.rawSize - b.rawSize : b.rawSize - a.rawSize;
    } else {
        if (b.rawSize !== a.rawSize) return sortDirection === 'asc' ? a.rawSize - b.rawSize : b.rawSize - a.rawSize;
        return sortDirection === 'asc' ? a.rawSeeders - b.rawSeeders : b.rawSeeders - a.rawSeeders;
    }
  });
  const topSource = sortedTorrents[0];
  const visibleTorrents = showAllSources ? sortedTorrents : sortedTorrents.slice(0, 5);
  const hiddenSourceCount = Math.max(sortedTorrents.length - visibleTorrents.length, 0);
  const totalSeeders = sortedTorrents.reduce((sum, torrent) => sum + torrent.rawSeeders, 0);
  const highSeederCount = sortedTorrents.filter((torrent) => torrent.rawSeeders >= 50).length;
  const airedEpisodeCount = anime.nextAiringEpisode?.episode
    ? Math.max(anime.nextAiringEpisode.episode - 1, 0)
    : (anime.episodes || 0);
  const currentEpisodePageItems = episodeData?.data || [];
  const updateEpisodeSelection = (value: string) => {
    setShowAllSources(false);
    const nextParams = new URLSearchParams(searchParams);
    if (value === 'batch') {
      nextParams.delete('ep');
      setDownloadFilter('[Batch]');
    } else {
      nextParams.set('ep', value);
      setDownloadFilter('1080p');
    }
    nextParams.set('type', audioFilter);
    setSearchParams(nextParams);
  };
  const applyPreset = (preset: typeof SOURCE_PRESETS[number]) => {
    setShowAllSources(false);
    setDownloadFilter(preset.query);
    setAudioFilter(preset.type);
    setSourceFilter((preset.sourceFilter || '') as TorrentSourceFilter);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('type', preset.type);
    if (preset.sourceFilter === 'batch') nextParams.delete('ep');
    setSearchParams(nextParams);
  };
  const recordDownloadAction = (torrent: any, action: 'copy' | 'open') => {
    saveDownloadHistory({
      title: torrent.title,
      magnet: torrent.magnet,
      animeTitle: anime.title,
      animeId: anime.mal_id,
      episode: selectedEpisodeNumber || (downloadFilter === '[Batch]' ? 'batch' : null),
      action,
      size: torrent.size,
      seeders: torrent.seeders,
    }, session);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Seo
        title={`${anime.title} Episode Downloads and Source Search | StreamNyaa`}
        description={`Find ${anime.title} episode search results, source metadata, file sizes, seed counts, and download options on StreamNyaa.`}
        canonicalPath={animePath(anime, '/downloads')}
        image={anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}
      />
      <Link to={data?.data ? animePath(data.data) : `/anime/${id}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Back to Anime Details
      </Link>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-5 gap-4 bg-[linear-gradient(135deg,rgba(225,29,72,0.12),rgba(14,165,233,0.06)),var(--glass)] p-6 rounded-2xl border border-border">
        <div className="flex items-center gap-4">
          <img src={anime.images.jpg.image_url} alt={anime.title} className="w-16 h-24 object-cover rounded shadow-md" />
          <div>
            <h1 className="text-2xl font-black text-foreground mb-1">{anime.title}</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              Download Options
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Last updated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
            <p className="mt-1 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
              {releaseTrackerText(anime, selectedEpisodeNumber)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-stretch md:items-end gap-3 w-full md:w-auto">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] md:grid-cols-1">
            <label className="flex flex-col gap-1.5 text-left">
              <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Episode</span>
              <select
                value={selectedEpisodeNumber ? String(selectedEpisodeNumber) : 'batch'}
                onChange={(event) => updateEpisodeSelection(event.target.value)}
                className="min-w-[220px] rounded-xl border border-border bg-background/70 px-3 py-2 text-sm font-bold text-foreground outline-none transition-colors focus:border-primary [&>option]:bg-background"
              >
                <option value="batch">Batch / all available episodes</option>
                {airedEpisodeCount > 0
                  ? Array.from({ length: airedEpisodeCount }, (_, index) => {
                    const episodeNumber = index + 1;
                    const episodeInfo = currentEpisodePageItems.find((episode: any) => episode.mal_id === episodeNumber);
                    const label = episodeInfo?.title ? `Episode ${episodeNumber} - ${episodeInfo.title}` : `Episode ${episodeNumber}`;
                    return (
                      <option key={episodeNumber} value={episodeNumber}>
                        {label}
                      </option>
                    );
                  })
                  : null}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {['[Batch]', '1080p', '720p', 'RAW'].map(filter => (
                <button
                  key={filter}
                  onClick={() => {
                    setShowAllSources(false);
                    setDownloadFilter(filter === downloadFilter ? '' : filter);
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                    downloadFilter === filter
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary hover:bg-secondary/80 text-foreground'
                  }`}
                >
                  {filter === '[Batch]' ? 'Batch' : filter}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {SOURCE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-full border border-border bg-background/70 p-1 shadow-sm w-fit">
              {[
                { value: 'sub' as const, label: 'Sub', icon: Languages },
                { value: 'dub' as const, label: 'Dub', icon: Volume2 },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => {
                    setShowAllSources(false);
                    setAudioFilter(value);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-black transition-all ${
                    audioFilter === value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                  }`}
                  aria-pressed={audioFilter === value}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort by:</span>
            <select 
              className="bg-transparent border border-border text-sm text-foreground rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary transition-colors cursor-pointer [&>option]:bg-background"
              value={sortBy}
              onChange={(e) => {
                setShowAllSources(false);
                setSortBy(e.target.value as 'best' | 'seeders' | 'size');
              }}
            >
              <option value="best">Best</option>
              <option value="seeders">Seeders</option>
              <option value="size">File Size</option>
            </select>
            {sortBy !== 'best' ? (
              <button
                type="button"
                onClick={() => setSortDirection((value) => value === 'desc' ? 'asc' : 'desc')}
                className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-sm font-bold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {sortDirection === 'desc' ? 'High to low' : 'Low to high'}
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground text-left md:text-right">
            {showAiringEpisodeResults ? 'Airing episode' : downloadFilter === '[Batch]' ? 'Batch' : 'Episode'} results are filtered for {audioFilter === 'dub' ? 'dubbed or dual-audio releases' : 'subbed releases'}.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Sources found', value: torrentsLoading ? '...' : sortedTorrents.length, detail: sourceFilter ? 'After selected filter' : 'Matching this title' },
          { label: 'Total seeders', value: torrentsLoading ? '...' : totalSeeders, detail: 'Across visible sources' },
          { label: 'Best source', value: torrentsLoading ? '...' : topSource ? sourceHealth(topSource.rawSeeders) : 'None', detail: topSource ? `${topSource.seeders} seeders` : 'Try another filter' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-[var(--glass)] p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-black text-foreground">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-2xl border border-border bg-secondary/20 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Source filters</span>
          {!torrentsLoading && highSeederCount ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-500">{highSeederCount} high-seed sources</span>
          ) : null}
          {sourceFilter ? (
            <button onClick={() => { setShowAllSources(false); setSourceFilter(''); }} className="text-xs font-bold text-primary hover:underline">Clear</button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'trusted', label: 'Trusted' },
            { value: 'high-seeders', label: 'High seeders' },
            { value: 'hevc', label: 'HEVC' },
            { value: 'dual-audio', label: 'Dual Audio' },
            { value: 'batch', label: 'Batch' },
            { value: 'episode', label: 'Episode' },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => {
                setShowAllSources(false);
                setSourceFilter(sourceFilter === item.value ? '' : item.value as TorrentSourceFilter);
              }}
              className={`rounded-full border px-3 py-1.5 text-sm font-bold transition-colors ${
                sourceFilter === item.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background/60 text-foreground hover:border-primary/40 hover:text-primary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {showAiringEpisodeResults ? (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <ListVideo className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-primary">Currently airing</p>
              <p className="mt-1">
                Full batch releases usually appear after a season finishes, so this section is showing available individual episode releases for now.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-6 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-muted-foreground md:hidden">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
          <div>
            <p className="font-semibold text-yellow-500">Mobile download note</p>
            <p className="mt-1">
              Mobile browsers may not open every download source directly. Use Open Link with a compatible app, or copy the source link for later.
            </p>
          </div>
        </div>
      </div>

      {torrentsLoading ? (
        <div className="py-20 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-muted-foreground font-medium">Searching sources for {audioFilter === 'dub' ? 'dubbed' : 'subbed'} {showAiringEpisodeResults ? 'episode releases' : downloadFilter ? downloadFilter.replace('[Batch]', 'batch') : 'releases'}...</p>
        </div>
      ) : sortedTorrents.length === 0 ? (
        <div className="bg-secondary/30 border border-border p-12 rounded-3xl text-center flex flex-col items-center">
          <HardDrive className="w-16 h-16 text-muted-foreground mb-4" />
          <p className="text-xl font-bold text-foreground mb-2">No Sources Found</p>
          <p className="text-muted-foreground">
            No source results were found for "{anime.title}" with the selected filters. Try a different filter or search.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-foreground">
                {showAllSources ? 'All source files are visible' : 'Showing the best source files first'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {showAllSources
                  ? `${sortedTorrents.length} matching files are listed below.`
                  : hiddenSourceCount
                    ? `${hiddenSourceCount} more matching files are hidden to keep the page clean.`
                    : 'These are all the matching files found for this filter.'}
              </p>
            </div>
            {sortedTorrents.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowAllSources((value) => !value)}
                className="inline-flex items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-black text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                {showAllSources ? 'Show fewer files' : 'Show all source files'}
              </button>
            ) : null}
          </div>

          {visibleTorrents.map((torrent, idx) => (
            <div key={idx} className={`transition-all p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 group ${
              idx === 0
                ? 'bg-emerald-500/5 border border-emerald-500/30 shadow-[0_16px_40px_rgba(16,185,129,0.08)]'
                : 'bg-secondary/20 hover:bg-secondary/40 border border-border/50 hover:border-primary/50'
            }`}>
                <div className="flex-1 min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {idx === 0 ? (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-emerald-500">
                        Best match
                      </span>
                    ) : null}
                    <span className="rounded-full border border-border bg-background/55 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                      {sourceHealth(torrent.rawSeeders)}
                    </span>
                    {(() => {
                      const score = sourceQualityScore(torrent);
                      return (
                        <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-primary">
                          Source score {score} - {sourceQualityLabel(score)}
                        </span>
                      );
                    })()}
                    <span className="rounded-full border border-border bg-background/55 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                      {sourceFreshnessLabel(torrent)}
                    </span>
                  </div>
                  <h4 className="font-bold text-foreground break-all leading-tight mb-3 group-hover:text-primary transition-colors text-[15px]">
                    {torrent.title}
                  </h4>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-muted-foreground">
                    <span className="text-secondary-foreground">{torrent.size}</span>
                    <span className="flex items-center gap-1.5 text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {torrent.seeders} SE
                    </span>
                    <span className="flex items-center gap-1.5 text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      {torrent.leechers} LE
                    </span>
                    <span className="bg-background px-2 py-0.5 rounded-full border border-border">{torrent.category}</span>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
                      /\b(dub|dubbed|dual[\s-]?audio|multi[\s-]?audio|english[\s-]?audio|eng[\s-]?dub)\b/i.test(torrent.title)
                        ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                        : 'bg-primary/10 text-primary border-primary/20'
                    }`}>
                      {/\b(dub|dubbed|dual[\s-]?audio|multi[\s-]?audio|english[\s-]?audio|eng[\s-]?dub)\b/i.test(torrent.title) ? 'Dub' : 'Sub'}
                    </span>
                    <span className="opacity-70">{new Date(torrent.pubDate).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getTorrentBadges(torrent).map((badge) => (
                      <span key={`${torrent.infoHash}-${badge.label}`} className={torrentBadgeClassName(badge.tone)}>
                        {badge.label}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0 mt-2 md:mt-0">
                  <a
                    href={torrent.magnet}
                    onClick={() => recordDownloadAction(torrent, 'open')}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
                    title="Open source link"
                  >
                    <Download className="w-4 h-4" />
                    Open Link
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(torrent.magnet);
                      recordDownloadAction(torrent, 'copy');
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-primary/25"
                  >
                    <LinkIcon className="w-4 h-4" />
                    Copy Link
                  </button>
                </div>
            </div>
          ))}
          {!user ? (
            <p className="rounded-2xl border border-border bg-background/45 p-4 text-sm text-muted-foreground">
              Download actions are saved locally in this browser. Sign in to sync future history to your account when database storage is available.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
