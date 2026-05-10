import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchNyaa } from '../api/nyaa';
import { Search, Loader2, Download, HardDrive, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import Seo from '../components/Seo';
import { getTorrentBadges, torrentBadgeClassName, torrentMatchesSourceFilter } from '../lib/torrentBadges';
import type { TorrentSourceFilter } from '../lib/torrentBadges';

export default function NyaaSearchPage() {
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('1_0');
  const [filter, setFilter] = useState('0');
  const [sourceFilter, setSourceFilter] = useState<TorrentSourceFilter>('');
  const [showAllSources, setShowAllSources] = useState(false);

  const { data: torrents, isLoading } = useQuery({
    queryKey: ['nyaaSearch', query, category, filter],
    queryFn: () => searchNyaa(query, category, filter),
    enabled: true, // we fetch default category even without query
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowAllSources(false);
    setQuery(searchInput);
  };

  const filteredTorrents = (torrents || []).filter((torrent) => torrentMatchesSourceFilter(torrent, sourceFilter));
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
              Mobile browsers may not open every download source directly. Use Open Link with a compatible app, or copy the source link into a cloud player.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto mb-6 max-w-5xl rounded-2xl border border-border bg-secondary/20 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Source filters</span>
          {sourceFilter ? <button onClick={() => { setShowAllSources(false); setSourceFilter(''); }} className="text-xs font-bold text-primary hover:underline">Clear</button> : null}
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
            {filteredTorrents.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAllSources((value) => !value)}
                className="inline-flex items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-black text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                {showAllSources ? 'Show fewer files' : `Show all source files (${filteredTorrents.length})`}
              </button>
            ) : null}
          </div>

          {visibleTorrents.map((torrent, idx) => (
            <div key={idx} className="bg-secondary/20 hover:bg-secondary/40 border border-border/50 hover:border-primary/50 transition-all p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 group">
                <div className="flex-1 min-w-0">
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
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
                    title="Open source link"
                  >
                    <Download className="w-4 h-4" />
                    Open Link
                  </a>
                  <button
                    onClick={() => navigator.clipboard?.writeText(torrent.magnet)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-primary/25"
                  >
                    <LinkIcon className="w-4 h-4" />
                    Copy Link
                  </button>
                </div>
            </div>
          ))}
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
