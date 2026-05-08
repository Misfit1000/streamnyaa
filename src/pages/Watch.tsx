import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactPlayer from 'react-player'; // <-- NEW IMPORT
import { fetchAnimeDetails, fetchAnimeEpisodes } from '../api/jikan';
import { searchNyaa, NyaaItem } from '../api/nyaa';
import { fetchEpisodeStream } from '../api/stream'; // <-- NEW IMPORT
import { Play, Download, List, HardDrive, Users, CloudRain, Loader2, Link as LinkIcon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { animePath, watchPath } from '../lib/slug';
import Seo from '../components/Seo';
import { getTorrentBadges, torrentBadgeClassName } from '../lib/torrentBadges';

function sourceHealth(source?: NyaaItem) {
  if (!source) return 'Waiting for source';
  if (source.rawSeeders >= 100) return 'Fast source';
  if (source.rawSeeders >= 50) return 'Healthy source';
  if (source.rawSeeders >= 15) return 'Usable source';
  return 'Low-seed source';
}

export default function Watch() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentEp, setCurrentEp] = useState(searchParams.get('ep') ? parseInt(searchParams.get('ep') as string) : 1);
  const [showEpNames, setShowEpNames] = useState(true);
  const [epPage, setEpPage] = useState(searchParams.get('ep') ? Math.floor((parseInt(searchParams.get('ep') as string) - 1) / 100) : 0);
  const [activeMagnet, setActiveMagnet] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [sortBy, setSortBy] = useState<'best' | 'seeders' | 'size'>('best');

  // --- NEW: DIRECT STREAM STATES ---
  const [streamMethod, setStreamMethod] = useState<'direct' | 'torrent'>('direct');
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('ep')) {
      const ep = parseInt(searchParams.get('ep') as string);
      setCurrentEp(ep);
      setEpPage(Math.floor((ep - 1) / 100));
    }
  }, [searchParams]);

  const { data: animeData, isLoading: animeLoading } = useQuery({
    queryKey: ['anime', id],
    queryFn: () => fetchAnimeDetails(id!),
    enabled: !!id,
  });

  const anime = animeData?.data;

  // --- NEW: DIRECT STREAM FETCHER ---
  useEffect(() => {
    if (streamMethod !== 'direct' || !anime) return;

    // Use English title if available, otherwise Romaji
    const titleToUse = anime.title_english || anime.title_romaji || anime.title;
    if (!titleToUse) return;

    let isMounted = true;
    const getStream = async () => {
      setStreamLoading(true);
      setStreamError(null);
      try {
        const sources = await fetchEpisodeStream(titleToUse, currentEp);
        if (isMounted && sources && sources.length > 0) {
          // Grab highest quality link
          const bestLink = sources.find((s: any) => s.quality === '1080p')?.url 
                        || sources.find((s: any) => s.quality === 'auto')?.url 
                        || sources[0].url;
          setStreamUrl(bestLink);
        } else if (isMounted) {
          setStreamError("No video sources found for this episode.");
        }
      } catch (err: any) {
        if (isMounted) setStreamError(err.message);
      } finally {
        if (isMounted) setStreamLoading(false);
      }
    };

    getStream();
    return () => { isMounted = false; };
  }, [anime, currentEp, streamMethod]);

  const { data: torrents, isLoading: torrentsLoading } = useQuery({
    queryKey: ['nyaa', anime?.title, currentEp, searchParams.get('type')],
    queryFn: async () => {
      const romaji = anime?.title_romaji;
      const english = anime?.title_english;
      const native = anime?.title;
      const epStr = currentEp.toString().padStart(2, '0');
      const audioType = searchParams.get('type');

      const cleanTitle = (title: string) => (
        title ? title.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() : ''
      );

      const performSearch = async (title: string, ep: string) => {
        if (!title) return [];
        let query = `${cleanTitle(title)} ${ep}`;
        if (audioType === 'dub') query += ' dub';
        return await searchNyaa(query);
      };

      const trySearches = async (epNumStr: string) => {
        let res = await performSearch(romaji, epNumStr);
        if (res.length === 0 && english && english !== romaji) res = await performSearch(english, epNumStr);
        if (res.length === 0 && native && native !== english && native !== romaji) res = await performSearch(native, epNumStr);
        return res;
      };

      let results = await trySearches(epStr);
      if (results.length === 0 && epStr !== currentEp.toString()) results = await trySearches(currentEp.toString());
      if (results.length === 0 && currentEp === 1) results = await trySearches('');
      return results;
    },
    enabled: !!anime?.title,
  });

  const { data: episodesData, isLoading: episodesLoading } = useQuery({
    queryKey: ['episodes', id, epPage],
    queryFn: () => fetchAnimeEpisodes(id!, epPage + 1),
    enabled: !!id,
  });

  if (animeLoading || episodesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!anime) return <div className="text-center py-20">Anime not found</div>;

  const changeEp = (epNum: number) => {
    setCurrentEp(epNum);
    setSearchParams({ ep: epNum.toString() });
    setIsPlaying(false);
    setActiveMagnet('');
    setStreamUrl(null); // Reset direct stream
  };

  const episodes = episodesData?.data || [];
  const airedCount = anime?.nextAiringEpisode
    ? anime.nextAiringEpisode.episode - 1
    : (anime?.status === 'RELEASING' || anime?.status === 'NOT_YET_RELEASED'
        ? (episodes.length > 0 ? Math.max(...episodes.map((episode: any) => episode.mal_id)) : 0)
        : (anime?.episodes || (episodes.length > 0 ? Math.max(...episodes.map((episode: any) => episode.mal_id)) : 12)));

  const displayEpisodes = Array.from({ length: 100 }, (_, index) => {
    const epNum = epPage * 100 + index + 1;
    if (epNum > airedCount) return null;
    const jikanEp = episodes.find((episode: any) => episode.mal_id === epNum);
    return jikanEp || { mal_id: epNum, title: `Episode ${epNum}`, title_japanese: '', image: '' };
  }).filter(Boolean);

  const sortedTorrents = [...(torrents || [])].sort((a, b) => {
    if (sortBy === 'best') {
      const trustedGroups = ['[SubsPlease]', '[Erai-raws]', '[Judas]', '[Ember]', '[ASW]', '[Cerberus]', '[Yameii]'];
      const trustedA = trustedGroups.some((group) => a.title.includes(group)) ? 1 : 0;
      const trustedB = trustedGroups.some((group) => b.title.includes(group)) ? 1 : 0;
      if (trustedA !== trustedB) return trustedB - trustedA;
      if (b.rawSeeders !== a.rawSeeders) return b.rawSeeders - a.rawSeeders;
      return b.rawSize - a.rawSize;
    }
    if (sortBy === 'seeders') {
      if (b.rawSeeders !== a.rawSeeders) return b.rawSeeders - a.rawSeeders;
      return b.rawSize - a.rawSize;
    }
    if (b.rawSize !== a.rawSize) return b.rawSize - a.rawSize;
    return b.rawSeeders - a.rawSeeders;
  });

  const primarySource = sortedTorrents[0];
  const activeSource = sortedTorrents.find((torrent) => torrent.magnet === activeMagnet) || primarySource;
  const highSeederCount = sortedTorrents.filter((torrent) => torrent.rawSeeders >= 50).length;

  const selectSource = (magnet: string) => {
    setActiveMagnet(magnet);
    setIsPlaying(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const copySource = (magnet?: string) => {
    if (magnet && navigator.clipboard) navigator.clipboard.writeText(magnet);
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <Seo
        title={`Watch ${anime.title} Episode ${currentEp} | StreamNyaa`}
        description={`View ${anime.title} episode ${currentEp}, source metadata, download options, and anime episode information on StreamNyaa.`}
        canonicalPath={watchPath(anime)}
      />
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <div className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
            <Link to="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <Link to={anime ? animePath(anime) : `/anime/${id}`} className="hover:text-primary line-clamp-1">{anime?.title}</Link>
            <span>/</span>
            <span className="text-foreground">Episode {currentEp}</span>
          </div>

          {/* --- NEW: THE METHOD TOGGLE BUTTONS --- */}
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setStreamMethod('direct')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${streamMethod === 'direct' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-[var(--glass)] text-muted-foreground border border-[var(--glass-border)] hover:text-foreground'}`}
            >
              Direct Stream (Fast)
            </button>
            <button
              onClick={() => setStreamMethod('torrent')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${streamMethod === 'torrent' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-[var(--glass)] text-muted-foreground border border-[var(--glass-border)] hover:text-foreground'}`}
            >
              Torrent / Magnet
            </button>
          </div>

          <div className="aspect-video bg-[#050507] rounded-[24px] overflow-hidden relative group border border-[var(--glass-border)] shadow-2xl">
            {streamMethod === 'direct' ? (
              // --- NEW DIRECT HLS PLAYER ---
              streamLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-primary gap-4">
                  <Loader2 className="w-10 h-10 animate-spin" />
                  <p className="font-bold text-sm">Decrypting Secure Stream...</p>
                </div>
              ) : streamError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 gap-4">
                  <AlertTriangle className="w-10 h-10" />
                  <p className="font-bold text-sm">{streamError}</p>
                </div>
              ) : streamUrl ? (
                <ReactPlayer 
                  url={streamUrl}
                  controls={true}
                  width="100%"
                  height="100%"
                  playing={true}
                  config={{ file: { forceHLS: true } }}
                />
              ) : null
            ) : (
              // --- YOUR EXISTING TORRENT / MAGNET UI ---
              <>
                <div className="pointer-events-none absolute left-4 top-4 z-30 flex flex-wrap gap-2">
                  <span className="rounded-full border border-primary/25 bg-black/55 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-primary backdrop-blur">
                    Source player
                  </span>
                  {activeSource ? (
                    <span className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[11px] font-bold text-white/80 backdrop-blur">
                      {sourceHealth(activeSource)} &bull; {activeSource.seeders} seeders
                    </span>
                  ) : null}
                </div>

                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,29,72,0.18),transparent_38%),#050507]" />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-4">
                  {!isPlaying ? (
                    <>
                      <button
                        className={`rounded-full p-6 md:p-8 bg-primary/20 text-primary border border-primary/30 transition-all ${sortedTorrents.length > 0 ? 'hover:scale-110 hover:bg-primary shadow-lg shadow-primary/20 hover:text-white hover:shadow-primary/40' : 'opacity-50 cursor-not-allowed'}`}
                        disabled={!sortedTorrents.length}
                        onClick={() => primarySource && selectSource(primarySource.magnet)}
                      >
                        <Play className="w-12 h-12 md:w-16 md:h-16 fill-current ml-2" />
                      </button>
                      <p className="text-white/70 font-medium mt-6 text-sm md:text-base">
                        {torrentsLoading ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Searching sources...
                          </span>
                        ) : sortedTorrents.length ? (
                          'Select the best source below or use the quick action here.'
                        ) : (
                          'No sources found automatically. Try selecting another episode.'
                        )}
                      </p>
                      {primarySource ? (
                        <div className="mt-4 flex max-w-[min(92%,560px)] flex-wrap items-center justify-center gap-2 text-xs">
                          <span className="rounded-full bg-white/10 px-3 py-1 font-bold text-white/75 backdrop-blur">Best source ready</span>
                          <span className="rounded-full bg-white/10 px-3 py-1 font-bold text-white/75 backdrop-blur">{sortedTorrents.length} sources</span>
                          {highSeederCount ? <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-bold text-emerald-300 backdrop-blur">{highSeederCount} high-seed sources</span> : null}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="max-w-2xl rounded-2xl border border-white/10 bg-black/45 p-5 backdrop-blur">
                      <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
                      <h2 className="mt-4 text-xl font-black text-white">Source selected</h2>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/70">{activeSource?.title}</p>
                      <div className="mt-5 flex flex-wrap justify-center gap-3">
                        <button onClick={() => copySource(activeSource?.magnet)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-white/15">
                          <LinkIcon className="h-4 w-4" />
                          Copy Link
                        </button>
                        {activeSource?.magnet ? (
                          <a href={activeSource.magnet} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90">
                            <Download className="h-4 w-4" />
                            Open in App
                          </a>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {isPlaying && activeSource && streamMethod === 'torrent' ? (
            <div className="mt-4 rounded-2xl border border-border bg-[var(--glass)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-primary">
                      Selected source
                    </span>
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-emerald-400">
                      {sourceHealth(activeSource)}
                    </span>
                  </div>
                  <p className="line-clamp-1 text-sm font-bold text-foreground">{activeSource.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{activeSource.size} &bull; {activeSource.seeders} seeders &bull; {activeSource.leechers} leechers</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button onClick={() => copySource(activeSource.magnet)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/55 px-3 py-2 text-xs font-black text-foreground transition-colors hover:border-primary/40">
                    <LinkIcon className="h-3.5 w-3.5" />
                    Copy
                  </button>
                  <a href={activeSource.magnet} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground transition-colors hover:bg-primary/90">
                    <Download className="h-3.5 w-3.5" />
                    Open Link
                  </a>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
            <div className="flex items-center gap-3 bg-[var(--glass)] p-2 pr-6 rounded-2xl border border-[var(--glass-border)] shrink-0">
              <img src={anime?.images?.webp?.large_image_url || anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url} alt="" className="w-12 h-16 rounded-xl object-cover" />
              <div>
                <h2 className="font-bold text-foreground text-[14px] line-clamp-1">{anime?.title}</h2>
                <p className="text-[12px] text-primary font-bold">Episode {currentEp}</p>
              </div>
            </div>
          </div>

          {/* ... The rest of your Torrents Table remains exactly the same below this point! ... */}
          <div className="mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <CloudRain className="w-5 h-5 text-primary" /> Sources & Downloads
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort by:</span>
                <select
                  className="bg-transparent border border-border text-sm text-foreground rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary transition-colors cursor-pointer [&>option]:bg-background"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as 'best' | 'seeders' | 'size')}
                >
                  <option value="best">Best</option>
                  <option value="seeders">Seeders</option>
                  <option value="size">File Size</option>
                </select>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-muted-foreground md:hidden">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
                <div>
                  <p className="font-semibold text-yellow-500">Mobile download note</p>
                  <p className="mt-1">
                    Mobile browsers may not open every download source directly. Use Copy Link or Open in App if the link does not open.
                  </p>
                </div>
              </div>
            </div>

            {torrentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : sortedTorrents.length === 0 ? (
              <div className="bg-secondary/30 border border-border p-8 rounded-2xl text-center text-muted-foreground">
                <p>No source results found for this episode.</p>
                <p className="text-sm mt-1">Make sure the anime has aired.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedTorrents.map((torrent, index) => {
                  const isCurrentSource = activeMagnet === torrent.magnet;
                  const badges = getTorrentBadges(torrent);
                  return (
                    <div key={torrent.infoHash || index} className={`bg-[var(--glass)] border p-4 rounded-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-4 transition-all hover:bg-[rgba(225,29,72,0.05)] ${isCurrentSource ? 'border-primary shadow-[0_0_15px_rgba(225,29,72,0.15)] bg-primary/5' : index === 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[var(--glass-border)] hover:border-primary/30'}`}>
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {index === 0 ? (
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-emerald-400">
                              Recommended
                            </span>
                          ) : null}
                          {badges.map((badge) => (
                            <span key={`${torrent.infoHash}-${badge.label}`} className={torrentBadgeClassName(badge.tone)}>
                              {badge.label}
                            </span>
                          ))}
                        </div>
                        <h4 className="text-sm font-semibold text-foreground line-clamp-2 md:line-clamp-1 mb-2" title={torrent.title}>{torrent.title}</h4>
                        <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                          <span className="flex items-center gap-1.5 text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md text-[11px] uppercase tracking-wider">
                            <HardDrive className="w-3.5 h-3.5" /> {torrent.size}
                          </span>
                          <span className="flex items-center gap-1.5 text-green-400 bg-green-500/10 px-2 py-1 rounded-md text-[11px] uppercase tracking-wider">
                            <Users className="w-3.5 h-3.5" /> Seeding: {torrent.seeders}
                          </span>
                          {isCurrentSource && (
                            <span className="flex items-center gap-1.5 text-primary bg-primary/10 px-2 py-1 rounded-md text-[11px] uppercase tracking-wider font-bold">
                              <CheckCircle2 className="w-3 h-3" /> Selected
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0 mt-2 sm:mt-0">
                        <button onClick={() => copySource(torrent.magnet)} className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-105 active:scale-95" title="Copy source link">
                          <LinkIcon className="w-4 h-4" />
                          <span className="hidden sm:inline">Copy Link</span>
                        </button>
                        <a href={torrent.magnet} className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-105 active:scale-95" title="Open source link in a compatible app">
                          <Download className="w-4 h-4" />
                          <span className="hidden sm:inline">Open in App</span>
                        </a>
                        <button onClick={() => selectSource(torrent.magnet)} disabled={!torrent.magnet || isCurrentSource} className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${isCurrentSource ? 'bg-primary/20 text-primary cursor-default' : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95 disabled:opacity-50'}`}>
                          <CheckCircle2 className="w-4 h-4" />
                          {isCurrentSource ? 'Selected' : 'Select'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-80 shrink-0">
          <div className="bg-[var(--glass)] rounded-[24px] border border-[var(--glass-border)] overflow-hidden flex flex-col h-[600px] shadow-lg sticky top-24">
            <div className="p-5 border-b border-[var(--glass-border)] flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2 text-foreground">
                <List className="w-5 h-5 text-primary" /> Episodes
              </h3>
              <button onClick={() => setShowEpNames(!showEpNames)} className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground hover:text-foreground transition-colors">
                {showEpNames ? 'Hide' : 'Show'} details
              </button>
            </div>

            {(() => {
              const lastVisiblePage = Math.ceil(airedCount / 100) || 1;
              if (lastVisiblePage <= 1) return null;
              return (
                <div className="px-3 pt-3 pb-1">
                  <select className="w-full bg-secondary text-[13px] font-semibold rounded-lg px-3 py-2 border border-border focus:outline-none focus:border-primary cursor-pointer text-foreground" value={epPage} onChange={(event) => setEpPage(parseInt(event.target.value))}>
                    {Array.from({ length: lastVisiblePage }, (_, index) => (
                      <option key={index} value={index} className="bg-background">
                        Episodes {index * 100 + 1} - {index === lastVisiblePage - 1 ? airedCount : (index + 1) * 100}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar relative">
              {displayEpisodes.map((episode: any, index: number) => {
                const epNum = episode.mal_id || epPage * 100 + index + 1;
                const isActive = currentEp === epNum;
                return (
                  <button
                    key={epNum}
                    onClick={() => changeEp(epNum)}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${
                      isActive
                        ? 'bg-primary border border-primary/30 text-primary-foreground'
                        : 'hover:bg-[var(--glass)] border border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className={`text-[13px] font-black w-8 ${isActive ? 'text-primary-foreground' : ''}`}>{epNum}</span>
                    {showEpNames && (
                      <span className="text-[13px] font-semibold line-clamp-1 flex-1">
                        {episode.title || episode.title_romanji || episode.title_english || `Episode ${epNum}`}
                      </span>
                    )}
                    {isActive && <Play className="w-4 h-4 text-primary fill-current shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}