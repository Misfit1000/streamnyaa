import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { buildSourceIdentity } from '../lib/desktopSourceIdentity';
import { useWebSources } from '../lib/useWebSources';
import { webAudioMatches } from '../lib/webSources';
import WebSourceProgress from '../components/WebSourceProgress';
import WebBatchDownloads from '../components/WebBatchDownloads';
import { fetchAnimeDetails, fetchAnimeEpisodes, searchAnime } from '../api/jikan';
import { Search, Loader2, Download, HardDrive, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import Seo from '../components/Seo';
import DataStatus from '../components/DataStatus';
import { getTorrentBadges, torrentBadgeClassName, torrentMatchesSourceFilter } from '../lib/torrentBadges';
import type { TorrentSourceFilter } from '../lib/torrentBadges';
import { useAuth } from '../context/AuthContext';
import { saveDownloadHistory } from '../lib/activity';
import { SOURCE_PRESETS, sourceFreshnessLabel, sourceQualityLabel, sourceQualityScore } from '../lib/sourceQuality';
import { isDesktopApp } from '../lib/desktop';
import {useStore} from '../store/useStore';
import {isHentaiTitle} from '../lib/webSourceProvider';

const DESKTOP_SOURCE_PRESETS = SOURCE_PRESETS.filter((preset) => preset.sourceFilter !== 'batch');

function releaseTrackerText(anime: any, selectedEpisode?: string) {
  const nextEpisode = anime?.nextAiringEpisode?.episode;
  const nextAiringAt = anime?.nextAiringEpisode?.airingAt;
  if (selectedEpisode) return `Episode ${selectedEpisode} selected`;
  if (!nextEpisode || !nextAiringAt) return anime?.status ? `${anime.status.replace(/_/g, ' ')} status` : 'Release timing updates when available';
  const diffMs = nextAiringAt * 1000 - Date.now();
  const hours = Math.round(Math.abs(diffMs) / 36e5);
  if (diffMs >= 0) return `Episode ${nextEpisode} expected ${hours <= 24 ? 'today' : `in ${Math.ceil(hours / 24)} days`}`;
  return `Episode ${nextEpisode} aired ${hours || 1} hours ago`;
}

export default function NyaaSearchPage() {
  const { session, user } = useAuth();
  const desktop = isDesktopApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const nsfwMode=useStore(state=>state.nsfwMode);
  const hentai=!desktop&&nsfwMode&&searchParams.get('content')==='hentai';
  const provider=hentai?'sukebei' as const:'nyaa' as const;
  const changeContent=(adult:boolean)=>{const next=new URLSearchParams(searchParams);if(adult)next.set('content','hentai');else next.delete('content');next.delete('match');next.delete('ep');setSearchParams(next);setShowAllSources(false);setIncludeUncertain(false);};
  useEffect(()=>{if(!nsfwMode&&searchParams.has('content')){const next=new URLSearchParams(searchParams);next.delete('content');next.delete('match');setSearchParams(next,{replace:true});}},[nsfwMode,searchParams,setSearchParams]);
  const query = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(query);
  // Route error boundaries remount on URL changes. Keep explicit confirmation
  // in the URL; it is still checked against the retrieved canonical metadata.
  const confirmedMatch = searchParams.get('match') || '';
  const confirmedAnimeId = /^mal:[1-9]\d*$/.test(confirmedMatch) ? Number(confirmedMatch.slice(4)) : null;
  const setConfirmedAnimeId = (id:number | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('match', `mal:${id}`); else next.delete('match');
    setSearchParams(next);
  };
  const [includeUncertain, setIncludeUncertain] = useState(false);
  const [audio, setAudio] = useState<'sub' | 'dub' | 'all'>('all');
  const [notice, setNotice] = useState('');
  useEffect(() => { setSearchInput(query); setShowAllSources(false); }, [query]);
  const [category, setCategory] = useState('1_0');
  const [filter, setFilter] = useState('0');
  const [sourceFilter, setSourceFilter] = useState<TorrentSourceFilter>('');
  const [sortBy, setSortBy] = useState<'best' | 'seeders' | 'size' | 'date'>('best');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [showAllSources, setShowAllSources] = useState(false);
  const animeLookupQuery = query;
  const selectedEpisode = /^[1-9]\d{0,3}$/.test(searchParams.get('ep') || '') ? searchParams.get('ep')! : '';

  const { data: animeMatchData } = useQuery({
    queryKey: ['downloadSearchAnimeMatch', animeLookupQuery,hentai,nsfwMode],
    queryFn: ({signal}) => searchAnime(animeLookupQuery, 1, '', '', '', '', '', {signal}),
    enabled: animeLookupQuery.trim().length >= 2 && category.startsWith('1_'),
  });
  const matchedAnime = animeMatchData?.data?.find((anime:any)=>isHentaiTitle(anime)===hentai);
  const { data: matchedAnimeDetails } = useQuery({
    queryKey: ['anime', matchedAnime?.mal_id ? String(matchedAnime.mal_id) : ''],
    queryFn: ({signal}) => fetchAnimeDetails(String(matchedAnime!.mal_id), {signal}),
    enabled: Boolean(confirmedAnimeId && matchedAnime?.mal_id === confirmedAnimeId),
  });
  const matchedAnimeFull = matchedAnimeDetails?.data || matchedAnime;
  const availableEpisodeCount = matchedAnimeFull?.nextAiringEpisode?.episode
    ? Math.max(matchedAnimeFull.nextAiringEpisode.episode - 1, 0)
    : (matchedAnimeFull?.episodes || 0);
  const selectedEpisodeNumber = selectedEpisode ? parseInt(selectedEpisode, 10) : null;
  const episodePage = selectedEpisodeNumber ? Math.max(1, Math.ceil(selectedEpisodeNumber / 100)) : 1;
  const { data: matchedEpisodeData } = useQuery({
    queryKey: ['download-search-episodes', matchedAnimeFull?.mal_id, episodePage],
    queryFn: ({signal}) => fetchAnimeEpisodes(String(matchedAnimeFull!.mal_id), episodePage, {signal}),
    enabled: Boolean(matchedAnimeFull?.mal_id && selectedEpisodeNumber),
  });

  const confirmed = Boolean(confirmedAnimeId && matchedAnimeFull?.mal_id === confirmedAnimeId && category.startsWith('1_'));
  const identity = useMemo(() => confirmed ? buildSourceIdentity(matchedAnimeFull) : undefined, [confirmed, matchedAnimeFull]);
  const sourceQuery = useWebSources({ identity, query, category:hentai?'1_1':category, filter, episode: selectedEpisodeNumber,provider,adultAllowed:nsfwMode });
  const { isLoading } = sourceQuery;
  const torrents = sourceQuery.data?.items;
  const hasBatchSources = torrents?.some(item=>item.matchTier==='batch'&&webAudioMatches(item.title,audio));
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault(); setShowAllSources(false);
    setSearchParams({...searchInput.trim()?{q:searchInput.trim()}:{},...hentai?{content:'hentai'}:{}});
  };
  const handleEpisodeChange = (value: string) => {
    setShowAllSources(false);
    const next = new URLSearchParams(searchParams);
    if(value) next.set('ep',value); else next.delete('ep');
    if(matchedAnimeFull?.mal_id) next.set('match', `mal:${matchedAnimeFull.mal_id}`);
    setSearchParams(next);
  };
  const applyPreset = (preset: typeof SOURCE_PRESETS[number]) => {
    setSourceFilter((preset.sourceFilter || '') as TorrentSourceFilter); setAudio(preset.type); setShowAllSources(false);
  };

  const recordDownloadAction = (torrent: any, action: 'copy' | 'open', episode: string | null = selectedEpisode || null) => {
    saveDownloadHistory({
      title: torrent.title,
      magnet: torrent.magnet,
      animeTitle: confirmed ? matchedAnimeFull?.title : query || undefined,
      animeId: confirmed&&torrent.matchTier!=='conflict' ? matchedAnimeFull?.mal_id : undefined,
      episode:torrent.matchTier==='conflict'?null:episode,
      action,
      size: torrent.size,
      seeders: torrent.seeders,
    }, session);
  };

  const filteredTorrents = useMemo(() => [...(torrents || [])].filter(torrent => (!category.startsWith('1_') || torrent.matchTier !== 'batch') && (includeUncertain || !['uncertain','conflict'].includes(torrent.matchTier)) && webAudioMatches(torrent.title, audio)).filter((torrent) => torrentMatchesSourceFilter(torrent, sourceFilter)).sort((a, b) => {
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
  }), [sortBy, sortDirection, sourceFilter, torrents, includeUncertain, audio, category]);
  const visibleTorrents = useMemo(() => showAllSources ? filteredTorrents : filteredTorrents.slice(0, 5), [filteredTorrents, showAllSources]);
  const hiddenSourceCount = Math.max(filteredTorrents.length - visibleTorrents.length, 0);
  const faqItems = [
    {
      question: 'What do the source badges mean?',
      answer: 'Badges summarize visible source details such as trusted release groups, high seed counts, HEVC/x265 encodes, dual audio, and individual episode releases.',
    },
    {
      question: 'How should I pick a source?',
      answer: 'Start with trusted groups and high seeders when available, then choose the quality, codec, audio, and episode release that matches what you need.',
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
        description="Search anime download source metadata, compare quality badges, and filter by trusted releases, high seed counts, HEVC, dual audio, or episode results."
        canonicalPath="/nyaa"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
        }}
      />
      <div className="flex flex-col items-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-black mb-4 flex items-center gap-2">
            <HardDrive className="w-8 h-8 shrink-0 text-primary" />
            {hentai?'Hentai Download Search':'Anime Download Search'}
        </h1>
        <p className={`${desktop ? 'text-white/56' : 'text-muted-foreground'} mb-8 text-center max-w-xl`}>
          Search anime source metadata, open compatible source links in your preferred client, or copy source links for later.
        </p>

        {!desktop&&<div className="mb-5 w-full max-w-3xl"><div role="group" aria-label="Download content category" className="flex flex-wrap gap-2"><button type="button" aria-pressed={!hentai} onClick={()=>changeContent(false)} className={`min-h-11 rounded-lg border px-5 text-sm font-bold ${!hentai?'border-primary bg-primary/10 text-primary':'border-border'}`}>Anime</button><button type="button" aria-pressed={hentai} disabled={!nsfwMode} onClick={()=>changeContent(true)} className={`min-h-11 rounded-lg border px-5 text-sm font-bold disabled:opacity-40 ${hentai?'border-primary bg-primary/10 text-primary':'border-border'}`}>Hentai · 18+</button></div><p role="status" className="mt-2 text-sm text-muted-foreground">{hentai?'Hentai only · Sukebei Anime sources. No catalogue match or artwork is required to download.':`Anime sources · Nyaa.${!nsfwMode?' Enable NSFW in the header to use the separate Hentai category.':''}`}</p></div>}
        <form onSubmit={handleSearch} className="w-full max-w-3xl flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search anime, episodes, or movies..."
              className={`w-full px-6 py-4 pl-12 rounded-xl transition-colors focus:outline-none ${
                desktop
                  ? 'border border-white/12 bg-black/35 text-white placeholder:text-white/34 focus:border-primary/60'
                  : 'bg-secondary/50 border border-border text-foreground focus:border-primary'
              }`}
            />
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${desktop ? 'text-white/34' : 'text-muted-foreground'}`} />
          </div>
          <button
            type="submit"
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 rounded-xl font-bold transition-transform hover:scale-105 shrink-0"
          >
            Search Sources
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-4 w-full max-w-3xl">
          <div className={`flex items-center gap-2 p-1 rounded-lg ${desktop ? 'border border-white/10 bg-white/[0.04]' : 'bg-secondary/30'}`}>
            {hentai?<span className="p-2 text-sm font-bold">Hentai animation only</span>:<select
              value={category}
              onChange={(e) => {
                setShowAllSources(false);
                setCategory(e.target.value);
              }}
              className={`bg-transparent text-sm focus:outline-none p-2 rounded-md font-medium [&>option]:bg-background ${desktop ? 'text-white/72' : 'text-foreground'}`}
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
            </select>}
          </div>

          <div className={`flex items-center gap-2 p-1 rounded-lg ${desktop ? 'border border-white/10 bg-white/[0.04]' : 'bg-secondary/30'}`}>
            <select
              value={filter}
              onChange={(e) => {
                setShowAllSources(false);
                setFilter(e.target.value);
              }}
              className={`bg-transparent text-sm focus:outline-none p-2 rounded-md font-medium [&>option]:bg-background ${desktop ? 'text-white/72' : 'text-foreground'}`}
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

      <div className={`mx-auto mb-6 max-w-5xl rounded-2xl p-4 ${desktop ? 'border border-white/8 bg-white/[0.045] backdrop-blur-xl' : 'border border-border bg-secondary/20'}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`text-xs font-black uppercase tracking-wider ${desktop ? 'text-white/36' : 'text-muted-foreground'}`}>Smart presets</span>
          {DESKTOP_SOURCE_PRESETS.map((preset) => (
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
          <div className={`mb-4 grid gap-4 rounded-2xl p-4 sm:grid-cols-[82px_1fr] ${desktop ? 'border border-white/8 bg-black/30' : 'border border-border/70 bg-background/45'}`}>
            <img
              src={matchedAnimeFull.images?.jpg?.image_url || matchedAnimeFull.images?.jpg?.large_image_url}
              alt={matchedAnimeFull.title}
              className="h-28 w-20 rounded-xl object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-primary">{confirmed ? 'Selected anime' : 'Suggested anime — confirm before matching'}</p>
              <button type="button" onClick={() => setConfirmedAnimeId(confirmed ? null : matchedAnimeFull.mal_id)} className="mt-2 rounded-lg border border-primary/30 px-3 py-2 text-sm font-bold text-primary">{confirmed ? 'Return to free-text search' : 'Match this anime'}</button>
              <h2 className="mt-1 line-clamp-1 text-xl font-black text-foreground">{matchedAnimeFull.title}</h2>
              <div className={`mt-2 flex flex-wrap gap-2 text-xs font-bold ${desktop ? 'text-white/52' : 'text-muted-foreground'}`}>
                <span className={`rounded-full px-2.5 py-1 ${desktop ? 'border border-white/10 bg-white/[0.05]' : 'bg-secondary'}`}>Score {matchedAnimeFull.score || 'N/A'}</span>
                <span className={`rounded-full px-2.5 py-1 ${desktop ? 'border border-white/10 bg-white/[0.05]' : 'bg-secondary'}`}>{matchedAnimeFull.status || 'Unknown status'}</span>
                <span className={`rounded-full px-2.5 py-1 ${desktop ? 'border border-white/10 bg-white/[0.05]' : 'bg-secondary'}`}>{availableEpisodeCount || matchedAnimeFull.episodes || 'TBA'} episodes</span>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{releaseTrackerText(matchedAnimeFull, selectedEpisode)}</span>
              </div>
              {availableEpisodeCount > 0 ? (
                <label className="mt-3 block max-w-xl">
                  <span className={`mb-1 block text-[11px] font-black uppercase tracking-wider ${desktop ? 'text-white/36' : 'text-muted-foreground'}`}>Episode selector</span>
                  <select
                    value={selectedEpisode}
                    onChange={(e) => handleEpisodeChange(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-primary [&>option]:bg-background ${
                      desktop
                        ? 'border border-white/10 bg-black/35 text-white'
                        : 'border border-border bg-background/70 text-foreground'
                    }`}
                  >
                    <option value="">All episodes / title search</option>
                    {Array.from({ length: Math.min(availableEpisodeCount, 9999) }, (_, index) => {
                      const episodeNumber = index + 1;
                      const episodeInfo = matchedEpisodeData?.data?.find((episode: any) => episode.mal_id === episodeNumber);
                      const label = episodeInfo?.title ? `Episode ${episodeNumber} - ${episodeInfo.title}` : `Episode ${episodeNumber}`;
                      return (
                        <option key={episodeNumber} value={episodeNumber}>
                          {label}
                        </option>
                      );
                    })}
                    {selectedEpisodeNumber && selectedEpisodeNumber > availableEpisodeCount ? <option value={selectedEpisode}>Episode {selectedEpisode} — metadata pending</option> : null}
                  </select>
                </label>
              ) : null}
              <form className="mt-3 flex items-end gap-2" onSubmit={event => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get('episode') || ''); if (/^[1-9]\d{0,3}$/.test(value)) handleEpisodeChange(value); }}><label className="text-xs font-bold">Jump to episode<input key={selectedEpisode || 'all'} type="number" name="episode" min="1" max="9999" required defaultValue={selectedEpisode} className="mt-1 block w-28 rounded-lg border border-border bg-background p-2"/></label><button className="rounded-lg border border-border px-3 py-2 text-sm font-bold">Go</button></form>
            </div>
          </div>
        ) : null}
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black uppercase tracking-wider ${desktop ? 'text-white/36' : 'text-muted-foreground'}`}>Source filters</span>
            {sourceFilter ? <button onClick={() => { setShowAllSources(false); setSourceFilter(''); }} className="text-xs font-bold text-primary hover:underline">Clear</button> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-black uppercase tracking-wider ${desktop ? 'text-white/36' : 'text-muted-foreground'}`}>Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'best' | 'seeders' | 'size' | 'date')}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:border-primary [&>option]:bg-background ${
                desktop
                  ? 'border border-white/10 bg-black/35 text-white'
                  : 'border border-border bg-background/70 text-foreground'
              }`}
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
                className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                  desktop
                    ? 'border border-white/10 bg-black/35 text-white hover:border-primary/50 hover:text-primary'
                    : 'border border-border bg-background/60 text-foreground hover:border-primary/50 hover:text-primary'
                }`}
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
                  : desktop
                    ? 'border-white/10 bg-black/35 text-white/78 hover:border-primary/40 hover:text-white'
                    : 'border-border bg-background/60 text-foreground hover:border-primary/40 hover:text-primary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-3 text-sm">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={includeUncertain} onChange={event => setIncludeUncertain(event.target.checked)}/>Include uncertain matches</label>
        <label>Audio <select aria-label="Audio" value={audio} onChange={event => setAudio(event.target.value as typeof audio)} className="rounded-lg border border-border bg-background p-2"><option value="all">All audio</option><option value="sub">Sub</option><option value="dub">Dub / dual audio</option></select></label>
      </div>
      {notice && <p role="status" className="mx-auto mb-4 max-w-5xl text-sm text-muted-foreground">{notice}</p>}
      <div className="mx-auto max-w-5xl"><WebSourceProgress data={sourceQuery.data} fetching={sourceQuery.isFetching} retry={() => void sourceQuery.refetch()}/></div>
      <DataStatus label="Source results" error={sourceQuery.isError} retry={() => void sourceQuery.refetch()}/>
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      ) : sourceQuery.isError && !torrents?.length ? null : query.trim().length < 2 ? (
        <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-[#111318] px-6 py-14 text-center">
          <Search className="mx-auto mb-4 h-14 w-14 text-white/28" />
          <p className="text-xl font-black text-white">Search sources by anime title</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">
            Enter an anime title or episode number to search source metadata. Source lookup starts when you submit a search.
          </p>
        </div>
      ) : filteredTorrents.length === 0 ? (
          <div className={`mx-auto max-w-3xl rounded-3xl px-6 py-14 text-center ${desktop ? 'border border-white/8 bg-white/[0.04]' : 'border border-border bg-secondary/25'}`}>
          <HardDrive className={`mx-auto mb-4 h-14 w-14 ${desktop ? 'text-white/30' : 'text-muted-foreground'}`} />
          <p className={`text-xl font-black ${desktop ? 'text-white' : 'text-foreground'}`}>{hasBatchSources ? 'Batch releases found' : sourceQuery.data?.complete ? 'No matching individual sources found' : 'No matching sources in the pages checked yet'}</p>
          <p className={`mx-auto mt-2 max-w-xl text-sm leading-6 ${desktop ? 'text-white/52' : 'text-muted-foreground'}`}>
            {hasBatchSources ? 'Episodes are bundled in the matching packs. Open Batch downloads below to choose a release and inspect its episode files in your torrent client.' : 'Try the romanized or English title, remove strict quality filters, or search the episode number without a leading zero.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {sourceFilter ? (
              <button
                type="button"
                onClick={() => setSourceFilter('')}
                className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary hover:bg-primary hover:text-primary-foreground"
              >
                Clear source filter
              </button>
            ) : null}
            {selectedEpisode ? (
              <button
                type="button"
                onClick={() => handleEpisodeChange(String(parseInt(selectedEpisode, 10)))}
                className={`rounded-full px-3 py-1.5 text-xs font-black ${
                  desktop
                    ? 'border border-white/10 bg-black/35 text-white/78 hover:border-primary/40 hover:text-white'
                    : 'border border-border bg-background/60 text-foreground hover:border-primary/40 hover:text-primary'
                }`}
              >
                Try episode without leading zero
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setIncludeUncertain(true)}
              className={`rounded-full px-3 py-1.5 text-xs font-black ${
                desktop
                  ? 'border border-white/10 bg-black/35 text-white/78 hover:border-primary/40 hover:text-white'
                  : 'border border-border bg-background/60 text-foreground hover:border-primary/40 hover:text-primary'
              }`}
            >
              Show uncertain matches
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 max-w-5xl mx-auto">
          <div className={`flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between ${
            desktop ? 'border border-white/8 bg-white/[0.04]' : 'border border-border/60 bg-secondary/20'
          }`}>
            <div>
              <p className={`text-sm font-black ${desktop ? 'text-white' : 'text-foreground'}`}>
                {showAllSources ? 'All found source files are visible' : 'Showing the best source files first'}
              </p>
              <p className={`mt-1 text-xs ${desktop ? 'text-white/48' : 'text-muted-foreground'}`}>
                {showAllSources
                  ? `${filteredTorrents.length} matching files are listed below.`
                  : hiddenSourceCount
                    ? `${hiddenSourceCount} more matching files are hidden to keep the page clean.`
                    : 'These are the matching files found so far for this search.'}
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
            <div key={idx} className={`transition-all p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 group ${
              desktop
                ? 'border border-white/8 bg-white/[0.04] hover:border-primary/40 hover:bg-white/[0.06]'
                : 'bg-secondary/20 hover:bg-secondary/40 border border-border/50 hover:border-primary/50'
            }`}>
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
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${
                      desktop ? 'border border-white/10 bg-black/35 text-white/44' : 'border border-border bg-background/60 text-muted-foreground'
                    }`}>
                      {sourceFreshnessLabel(torrent)}
                    </span>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">{torrent.matchTier === 'uncertain' ? 'Uncertain match — ' : ''}{torrent.matchReason}</p>
                  <h4 className={`text-[15px] font-bold break-all leading-tight mb-3 transition-colors ${
                    desktop ? 'text-white group-hover:text-primary' : 'text-foreground group-hover:text-primary'
                  }`}>
                    {hentai&&<span className="mr-2 inline-block rounded border border-primary/40 px-2 py-0.5 text-xs font-black text-primary">Hentai · 18+</span>}{torrent.title}
                  </h4>
                  <div className={`flex flex-wrap items-center gap-4 text-xs font-semibold ${desktop ? 'text-white/48' : 'text-muted-foreground'}`}>
                    <span className={desktop ? 'text-white/72' : 'text-secondary-foreground'}>{torrent.size}</span>
                    <span className="flex items-center gap-1.5 text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {torrent.seeders} SE
                    </span>
                    <span className="flex items-center gap-1.5 text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      {torrent.leechers} LE
                    </span>
                    <span className={`px-2 py-0.5 rounded-full ${desktop ? 'border border-white/10 bg-black/35 text-white/52' : 'bg-background border border-border'}`}>{torrent.category}</span>
                    <span className="opacity-70">{Number.isFinite(Date.parse(torrent.pubDate)) ? new Date(torrent.pubDate).toLocaleDateString() : 'Date unavailable'}</span>
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
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${
                      desktop ? 'border border-white/10 bg-black/35 text-white hover:border-primary/40 hover:text-primary' : 'bg-secondary hover:bg-secondary/80 text-foreground'
                    }`}
                    title="Open source link"
                  >
                    <Download className="w-4 h-4" />
                    Open Link
                  </a>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(torrent.magnet).then(() => { recordDownloadAction(torrent, 'copy'); setNotice('Magnet link copied.'); }).catch(() => setNotice('Copy failed. Open the release in your torrent client instead.'));
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
            <p className={`rounded-2xl p-4 text-sm ${desktop ? 'border border-white/8 bg-black/25 text-white/52' : 'border border-border bg-background/45 text-muted-foreground'}`}>
              Your download history is saved on this device. Sign in to keep future activity connected to your account.
            </p>
          ) : null}
        </div>
      )}

      {query.trim().length >= 2 && (hentai||category.startsWith('1_')) && <div className="mx-auto max-w-5xl"><WebBatchDownloads key={provider+query + (identity?.animeId || '')} provider={provider} adultAllowed={nsfwMode} identity={identity} query={query} initial={torrents} audio={audio} onAction={(item, action) => recordDownloadAction(item, action, null)}/></div>}
      <section className={`mx-auto mt-12 max-w-5xl pt-8 ${desktop ? 'border-t border-white/8' : 'border-t border-border'}`}>
        <h2 className={`text-2xl font-black ${desktop ? 'text-white' : 'text-foreground'}`}>Anime download search FAQ</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {faqItems.map((item) => (
            <div key={item.question} className={`rounded-2xl p-4 ${desktop ? 'border border-white/8 bg-white/[0.045]' : 'border border-border bg-secondary/20'}`}>
              <h3 className={`font-bold ${desktop ? 'text-white' : 'text-foreground'}`}>{item.question}</h3>
              <p className={`mt-2 text-sm leading-relaxed ${desktop ? 'text-white/56' : 'text-muted-foreground'}`}>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
