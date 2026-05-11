import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchNyaa } from '../api/nyaa';
import { fetchAnimeDetails, fetchAnimeEpisodes, searchAnime } from '../api/jikan';
import { Search, Loader2, Download, HardDrive, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import Seo from '../components/Seo';
import { getTorrentBadges, torrentBadgeClassName, torrentMatchesSourceFilter } from '../lib/torrentBadges';
import type { TorrentSourceFilter } from '../lib/torrentBadges';
import { useAuth } from '../context/AuthContext';
import { saveDownloadHistory } from '../lib/activity';
import { SOURCE_PRESETS, sourceFreshnessLabel, sourceQualityLabel, sourceQualityScore } from '../lib/sourceQuality';

function releaseTrackerText(anime: any, selectedEpisode?: string) {
  const nextEpisode = anime?.nextAiringEpisode?.episode;
  const nextAiringAt = anime?.nextAiringEpisode?.airingAt;
  if (selectedEpisode && selectedEpisode !== 'batch') return `Episode ${selectedEpisode} selected`;
  if (!nextEpisode || !nextAiringAt) return anime?.status ? `${anime.status.replace(/_/g, ' ')} status` : 'Release timing updates when available';
  const diffMs = nextAiringAt * 1000 - Date.now();
  const hours = Math.round(Math.abs(diffMs) / 36e5);
  if (diffMs >= 0) return `Episode ${nextEpisode} expected ${hours <= 24 ? 'today' : `in ${Math.ceil(hours / 24)} days`}`;
  return `Episode ${nextEpisode} aired ${hours || 1} hours ago`;
}

export default function NyaaSearchPage() {
  const { session, user } = useAuth();
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('1_0');
  const [filter, setFilter] = useState('0');
  const [sourceFilter, setSourceFilter] = useState<TorrentSourceFilter>('');
  const [sortBy, setSortBy] = useState<'best' | 'seeders' | 'size' | 'date'>('best');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [showAllSources, setShowAllSources] = useState(false);
  const [animeLookupQuery, setAnimeLookupQuery] = useState('');
  const [selectedEpisode, setSelectedEpisode] = useState('batch');

  const { data: torrents, isLoading } = useQuery({
    queryKey: ['nyaaSearch', query, category, filter, showAllSources],
    queryFn: () => searchNyaa(query, category, filter, '1', { pages: showAllSources ? 3 : 1, wide: showAllSources }),
    enabled: true, // we fetch default category even without query
  });

  const { data: animeMatchData } = useQuery({
    queryKey: ['downloadSearchAnimeMatch', animeLookupQuery],
    queryFn: () => searchAnime(animeLookupQuery, 1),
    enabled: animeLookupQuery.trim().length >= 2 && category.startsWith('1_'),
  });
  const matchedAnime = animeMatchData?.data?.[0];
  const { data: matchedAnimeDetails } = useQuery({
    queryKey: ['anime', matchedAnime?.mal_id ? String(matchedAnime.mal_id) : ''],
    queryFn: () => fetchAnimeDetails(String(matchedAnime!.mal_id)),
    enabled: Boolean(matchedAnime?.mal_id),
  });
  const matchedAnimeFull = matchedAnimeDetails?.data || matchedAnime;
  const availableEpisodeCount = matchedAnimeFull?.nextAiringEpisode?.episode
    ? Math.max(matchedAnimeFull.nextAiringEpisode.episode - 1, 0)
    : (matchedAnimeFull?.episodes || 0);
  const selectedEpisodeNumber = selectedEpisode !== 'batch' ? parseInt(selectedEpisode, 10) : null;
  const episodePage = selectedEpisodeNumber ? Math.max(1, Math.ceil(selectedEpisodeNumber / 100)) : 1;
  const { data: matchedEpisodeData } = useQuery({
    queryKey: ['download-search-episodes', matchedAnimeFull?.mal_id, episodePage],
    queryFn: () => fetchAnimeEpisodes(String(matchedAnimeFull!.mal_id), episodePage),
    enabled: Boolean(matchedAnimeFull?.mal_id && selectedEpisodeNumber),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowAllSources(false);
    setSelectedEpisode('batch');
    setAnimeLookupQuery(searchInput.trim());
    setQuery(searchInput);
  };

  const handleEpisodeChange = (value: string) => {
    setShowAllSources(false);
    setSelectedEpisode(value);
    const baseTitle = matchedAnimeFull?.title_english || matchedAnimeFull?.title_romaji || matchedAnimeFull?.title || animeLookupQuery || searchInput;
    setQuery(value === 'batch' ? baseTitle : `${baseTitle} ${value.padStart(2, '0')}`);
  };

  const applyPreset = (preset: typeof SOURCE_PRESETS[number]) => {
    const baseTitle = matchedAnimeFull?.title_english || matchedAnimeFull?.title_romaji || matchedAnimeFull?.title || animeLookupQuery || searchInput;
    const episodePart = selectedEpisode !== 'batch' ? ` ${selectedEpisode.padStart(2, '0')}` : '';
    const nextQuery = `${baseTitle}${episodePart} ${preset.query}`.trim();
    setSearchInput(nextQuery);
    setQuery(nextQuery);
    setFilter('0');
    setCategory('1_2');
    setSourceFilter((preset.sourceFilter || '') as TorrentSourceFilter);
    setShowAllSources(false);
  };

  const recordDownloadAction = (torrent: any, action: 'copy' | 'open') => {
    saveDownloadHistory({
      title: torrent.title,
      magnet: torrent.magnet,
      animeTitle: matchedAnimeFull?.title || animeLookupQuery || searchInput || undefined,
      animeId: matchedAnimeFull?.mal_id,
      episode: selectedEpisode === 'batch' ? 'batch' : selectedEpisode,
      action,
      size: torrent.size,
      seeders: torrent.seeders,
    }, session);
  };

  const filteredTorrents = [...(torrents || [])].filter((torrent) => torrentMatchesSourceFilter(torrent, sourceFilter)).sort((a, b) => {
    if (sortBy === 'best') {
      if (Number(b.sourceScore || 0) !== Number(a.sourceScore || 0)) return Number(b.sourceScore || 0) - Number(a.sourceScore || 0);
      if (b.rawSeeders !== a.rawSeeders) return b.rawSeeders - a.rawSeeders;
      return b.rawSize - a.rawSize;
    }
    if (sortBy === 'seeders') {
      if (b.rawSeeders !== a.rawSeeders) return sortDirection === 'asc' ? a.rawSeeders - b.rawSeeders : b.rawSeeders - a.rawSeeders;
      return sortDirection === 'asc' ? a.rawSize - b.rawSize : b.rawSize - a.rawSize;
    }
    if (sortBy === 'size') {
      if (b.rawSize !== a.rawSize) return sortDirection === 'asc' ? a.rawSize - b.rawSize : b.rawSize - a.rawSize;
      return sortDirection === 'asc' ? a.rawSeeders - b.rawSeeders : b.rawSeeders - a.rawSeeders;
    }
    const aTime = Date.parse(a.pubDate || '0') || 0;
    const bTime = Date.parse(b.pubDate || '0') || 0;
    return sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
  });
  const visibleTorrents = showAllSources ? filteredTorrents : filteredTorrents.slice(0, 5);
  const hiddenSourceCount = Math.max(filteredTorrents.length - visibleTorrents.length, 0);
  const faqItems = [
    {
      question: 'What do the source badges mean?',
      answer: 'Badges summarize visible source details such as trusted release groups, high seed counts, HEVC/x265 encodes, dual audio, batch packs, and individual episodes.',
    },
    {
      question: 'How should I pick a source?',
      answer: 'Start with trusted groups and high seeders when available, then choose the quality, codec, audio, and batch or episode format that matches what you need.',
    },
    {
      question: 'Does StreamNyaa host these files?',
      answer: 'No. This page displays source metadata and compatible source links from third-party services; StreamNyaa does not host anime files.',
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <Seo
        title="Anime Download Source Search | StreamNyaa"
        description="Search anime download source metadata, compare quality badges, filter by trusted releases, high seed counts, HEVC, dual audio, batch, or episode results."
        canonicalPath="/nyaa"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
        }}
      />
      <div className="flex flex-col items-center mb-8">
        <h1 className="text-3xl font-black mb-4 flex items-center gap-2">
            <HardDrive className="w-8 h-8 text-primary" />
            Anime Download Search
        </h1>
        <p className="text-muted-foreground mb-8 text-center max-w-xl">
          Search anime source metadata, open compatible source links in your preferred client, or copy source links for later.
        </p>

        <form onSubmit={handleSearch} className="w-full max-w-3xl flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search anime, episodes, movies, or batches..."
              className="w-full bg-secondary/50 border border-border px-6 py-4 pl-12 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          </div>
          <button
            type="submit"
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 rounded-xl font-bold transition-transform hover:scale-105 shrink-0"
          >
            Search Sources
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-4 w-full max-w-3xl">
          <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded-lg">
            <select
              value={category}
              onChange={(e) => {
                setShowAllSources(false);
                setCategory(e.target.value);
              }}
              className="bg-transparent text-sm text-foreground focus:outline-none p-2 rounded-md font-medium [&>option]:bg-background"
            >
              <option value="0_0">All Categories</option>
              <option value="1_0">Anime (All)</option>
              <option value="1_1">Anime - AMV</option>
              <option value="1_2">Anime - English-translated</option>
              <option value="1_3">Anime - Non-English-translated</option>
              <option value="1_4">Anime - Raw</option>
              <option value="2_0">Audio (All)</option>
              <option value="3_0">Literature (All)</option>
              <option value="4_0">Live Action (All)</option>
              <option value="5_0">Pictures (All)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded-lg">
            <select
              value={filter}
              onChange={(e) => {
                setShowAllSources(false);
                setFilter(e.target.value);
              }}
              className="bg-transparent text-sm text-foreground focus:outline-none p-2 rounded-md font-medium [&>option]:bg-background"
            >
              <option value="0">No Filter</option>
              <option value="1">No Remakes</option>
              <option value="2">Trusted Only</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mx-auto mb-6 max-w-5xl rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-muted-foreground md:hidden">
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

      <div className="mx-auto mb-6 max-w-5xl rounded-2xl border border-border bg-secondary/20 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Smart presets</span>
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
        {matchedAnimeFull ? (
          <div className="mb-4 grid gap-4 rounded-2xl border border-border/70 bg-background/45 p-4 sm:grid-cols-[82px_1fr]">
            <img
              src={matchedAnimeFull.images?.jpg?.image_url || matchedAnimeFull.images?.jpg?.large_image_url}
              alt={matchedAnimeFull.title}
              className="h-28 w-20 rounded-xl object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-primary">Matched anime</p>
              <h2 className="mt-1 line-clamp-1 text-xl font-black text-foreground">{matchedAnimeFull.title}</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-muted-foreground">
                <span className="rounded-full bg-secondary px-2.5 py-1">Score {matchedAnimeFull.score || 'N/A'}</span>
                <span className="rounded-full bg-secondary px-2.5 py-1">{matchedAnimeFull.status || 'Unknown status'}</span>
                <span className="rounded-full bg-secondary px-2.5 py-1">{availableEpisodeCount || matchedAnimeFull.episodes || 'TBA'} episodes</span>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{releaseTrackerText(matchedAnimeFull, selectedEpisode)}</span>
              </div>
              {availableEpisodeCount > 0 ? (
                <label className="mt-3 block max-w-xl">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-muted-foreground">Episode selector</span>
                  <select
                    value={selectedEpisode}
                    onChange={(e) => handleEpisodeChange(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm font-bold text-foreground outline-none focus:border-primary [&>option]:bg-background"
                  >
                    <option value="batch">Batch / all available episodes</option>
                    {Array.from({ length: availableEpisodeCount }, (_, index) => {
                      const episodeNumber = index + 1;
                      const episodeInfo = matchedEpisodeData?.data?.find((episode: any) => episode.mal_id === episodeNumber);
                      const label = episodeInfo?.title ? `Episode ${episodeNumber} - ${episodeInfo.title}` : `Episode ${episodeNumber}`;
                      return (
                        <option key={episodeNumber} value={episodeNumber}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Source filters</span>
            {sourceFilter ? <button onClick={() => { setShowAllSources(false); setSourceFilter(''); }} className="text-xs font-bold text-primary hover:underline">Clear</button> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'best' | 'seeders' | 'size' | 'date')}
              className="rounded-lg border border-border bg-background/70 px-3 py-1.5 text-sm font-bold text-foreground outline-none focus:border-primary [&>option]:bg-background"
            >
              <option value="best">Best</option>
              <option value="seeders">Seeders</option>
              <option value="size">File Size</option>
              <option value="date">Date</option>
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
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'quality-1080p', label: '1080p' },
            { value: 'quality-720p', label: '720p' },
            { value: 'raw', label: 'Raw' },
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

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      ) : filteredTorrents.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground text-lg">No sources found. Try different filters or terms.</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-5xl mx-auto">
          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-foreground">
                {showAllSources ? 'All source files are visible' : 'Showing the best source files first'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {showAllSources
                  ? `${filteredTorrents.length} matching files are listed below.`
                  : hiddenSourceCount
                    ? `${hiddenSourceCount} more matching files are hidden to keep the page clean.`
                    : 'These are all the matching files found for this search.'}
              </p>
            </div>
            {filteredTorrents.length > 0 ? (
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
            <div key={idx} className="bg-secondary/20 hover:bg-secondary/40 border border-border/50 hover:border-primary/50 transition-all p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 group">
                <div className="flex-1 min-w-0">
                  <div className="mb-2 flex flex-wrap gap-2">
                    {(() => {
                      const score = sourceQualityScore(torrent);
                      return (
                        <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary">
                          Source score {score} - {sourceQualityLabel(score)}
                        </span>
                      );
                    })()}
                    <span className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                      {sourceFreshnessLabel(torrent)}
                    </span>
                  </div>
                  <h4 className="text-[15px] font-bold text-foreground break-all leading-tight mb-3 group-hover:text-primary transition-colors">
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
                
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0 mt-4 md:mt-0">
                  <a
                    href={torrent.magnet}
                    onClick={() => recordDownloadAction(torrent, 'open')}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
                    title="Open source link"
                  >
                    <Download className="w-4 h-4" />
                    Open Link
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(torrent.magnet);
                      recordDownloadAction(torrent, 'copy');
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-primary/25"
                  >
                    <LinkIcon className="w-4 h-4" />
                    Copy Link
                  </button>
                </div>
            </div>
          ))}
          {!user ? (
            <p className="rounded-2xl border border-border bg-background/45 p-4 text-sm text-muted-foreground">
              Your download history is saved on this device. Sign in to keep future activity connected to your account.
            </p>
          ) : null}
        </div>
      )}

      <section className="mx-auto mt-12 max-w-5xl border-t border-border pt-8">
        <h2 className="text-2xl font-black text-foreground">Anime download search FAQ</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {faqItems.map((item) => (
            <div key={item.question} className="rounded-2xl border border-border bg-secondary/20 p-4">
              <h3 className="font-bold text-foreground">{item.question}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
