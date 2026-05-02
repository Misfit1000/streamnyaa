import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAnimeDetails, fetchAnimeEpisodes } from '../api/jikan';
import { searchNyaa, NyaaItem } from '../api/nyaa';
import { Play, Settings, Maximize, Download, MessageSquare, List, HardDrive, Users, CloudRain, ShieldAlert, Loader2, Link as LinkIcon, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';

declare global {
  interface Window {
    webtor: any;
  }
}

const STREAMING_PROVIDERS = [
  { 
    id: 'webtor', 
    name: 'Auto Player (WebTor)', 
    getUrl: (magnet: string) => '' 
  },
  { 
    id: 'webtor-app', 
    name: 'WebTor Cloud Stream', 
    getUrl: (magnet: string) => `https://webtor.io/show?magnet=${encodeURIComponent(magnet)}&theme=dark` 
  },
  { 
    id: 'magnetplayer', 
    name: 'P2P Embedded Player', 
    getUrl: (magnet: string) => `https://ferrolho.github.io/magnet-player/?magnet=${encodeURIComponent(magnet)}` 
  }
];

export default function Watch() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentEp, setCurrentEp] = useState(searchParams.get('ep') ? parseInt(searchParams.get('ep') as string) : 1);
  const [showEpNames, setShowEpNames] = useState(true);
  const [epPage, setEpPage] = useState(searchParams.get('ep') ? Math.floor((parseInt(searchParams.get('ep') as string) - 1) / 100) : 0);

  useEffect(() => {
    if (searchParams.get('ep')) {
      const ep = parseInt(searchParams.get('ep') as string);
      setCurrentEp(ep);
      setEpPage(Math.floor((ep - 1) / 100));
    }
  }, [searchParams]);

  const changeEp = (epNum: number) => {
    setCurrentEp(epNum);
    setSearchParams({ ep: epNum.toString() });
    setIsPlaying(false);
    setActiveMagnet('');
  };

  // Player state
  const [activeMagnet, setActiveMagnet] = useState<string>('');
  const [provider, setProvider] = useState(STREAMING_PROVIDERS[0].id);
  const [isPlaying, setIsPlaying] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  
  const fallbackTimer = useRef<NodeJS.Timeout | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  const { data: animeData, isLoading: animeLoading } = useQuery({
    queryKey: ['anime', id],
    queryFn: () => fetchAnimeDetails(id!),
    enabled: !!id,
  });

  const anime = animeData?.data;

  // Search Nyaa when anime loads or episode changes
  const { data: torrents, isLoading: torrentsLoading } = useQuery({
    queryKey: ['nyaa', anime?.title, currentEp, searchParams.get('type')],
    queryFn: async () => {
      const romaji = anime?.title_romaji;
      const english = anime?.title_english;
      const native = anime?.title;

      const epStr = currentEp.toString().padStart(2, '0');
      const audioType = searchParams.get('type');

      const cleanTitle = (t: string) => {
        if (!t) return '';
        // Remove seasons like "Season 2", "Part 2", "2nd Season" which Nyaa uploaders often omit 
        // or format differently, but let's just make it alphanumeric for safer matching.
        // Actually, just removing special characters works best.
        let cleaned = t.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        return cleaned;
      };

      const performSearch = async (t: string, ep: string) => {
        if (!t) return [];
        let query = `${cleanTitle(t)} ${ep}`;
        if (audioType === 'dub') {
          query += ' dub';
        }
        return await searchNyaa(query);
      };

      const trySearches = async (epNumStr: string) => {
        let res = await performSearch(romaji, epNumStr);
        if (res.length === 0 && english && english !== romaji) {
          res = await performSearch(english, epNumStr);
        }
        if (res.length === 0 && native && native !== english && native !== romaji) {
          res = await performSearch(native, epNumStr);
        }
        return res;
      };

      let results = await trySearches(epStr);

      // Fallback without padding if still 0
      if (results.length === 0 && epStr !== currentEp.toString()) {
        results = await trySearches(currentEp.toString());
      }
      
      // Secondary fallback: some uploaders don't even put episode numbers if it's a movie or single OVA
      if (results.length === 0 && currentEp === 1) {
        results = await trySearches("");
      }
      
      return results;
    },
    enabled: !!anime?.title,
  });

  const [sortBy, setSortBy] = useState<'best' | 'seeders' | 'size'>('best');

  const { data: episodesData, isLoading: episodesLoading } = useQuery({
    queryKey: ['episodes', id, epPage],
    queryFn: () => fetchAnimeEpisodes(id!, epPage + 1),
    enabled: !!id,
  });

  useEffect(() => {
    if (isPlaying && activeMagnet && provider === 'webtor' && playerRef.current) {
      playerRef.current.innerHTML = '';
      const playerId = `webtor-player-${iframeKey}`;
      playerRef.current.id = playerId;

      const webtorConfig = {
        id: playerId,
        magnet: activeMagnet,
        poster: anime?.images?.jpg?.large_image_url || '',
        width: '100%',
        height: '100%',
        theme: 'dark',
        lang: 'en',
        features: {
          p2pProgress: true,
          download: false,
          settings: true,
          fullscreen: true,
          playpause: true,
          currentTime: true,
          timeline: true,
          duration: true,
          volume: true,
          chromecast: true,
        },
        on: function(e: any) {
          if (e.name === (window as any).webtor?.TORRENT_ERROR) {
            console.error('Torrent error!');
          }
        }
      };

      (window as any).webtor = (window as any).webtor || [];
      (window as any).webtor.push(webtorConfig);
    }
    
    // Cleanup URL listeners or other player state if necessary
    return () => {
    };
  }, [activeMagnet, isPlaying, provider, iframeKey, anime]);

  const clearFallbackTimer = () => {
    if (fallbackTimer.current) {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  };

  const startFallbackTimer = () => {
    clearFallbackTimer();
    setShowFallback(false);
    fallbackTimer.current = setTimeout(() => {
      setShowFallback(true);
    }, 15000);
  };

  useEffect(() => {
    return () => clearFallbackTimer();
  }, []);

  if (animeLoading || episodesLoading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  const episodes = episodesData?.data || [];
  
  const airedCount = anime?.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : 
    (anime?.status === 'RELEASING' || anime?.status === 'NOT_YET_RELEASED' ? (episodes.length > 0 ? Math.max(...episodes.map((e: any) => e.mal_id)) : 0) : (anime?.episodes || (episodes.length > 0 ? Math.max(...episodes.map((e: any) => e.mal_id)) : 12)));
  const maxEpCount = airedCount;

  const displayEpisodes = Array.from({ length: 100 }, (_, i) => {
    const epNum = epPage * 100 + i + 1;
    if (epNum > maxEpCount) return null;
    
    const jikanEp = episodes.find((e: any) => e.mal_id === epNum);
    if (jikanEp) return jikanEp;
    
    let epTitle = `Episode ${epNum}`;
    return {
      mal_id: epNum,
      title: epTitle,
      title_japanese: '',
      image: '',
    };
  }).filter(Boolean);

  const handlePlayTorrent = (magnet: string) => {
    setActiveMagnet(magnet);
    setIsPlaying(true);
    setIframeKey(prev => prev + 1);
    startFallbackTimer();
    // Scroll to player
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const sortedTorrents = [...(torrents || [])].sort((a, b) => {
    if (sortBy === 'best') {
        const trustedGroups = ['[SubsPlease]', '[Erai-raws]', '[Judas]', '[Ember]', '[ASW]', '[Cerberus]', '[Yameii]'];
        const trustedA = trustedGroups.some(g => a.title.includes(g)) ? 1 : 0;
        const trustedB = trustedGroups.some(g => b.title.includes(g)) ? 1 : 0;
        if (trustedA !== trustedB) return trustedB - trustedA;
        if (b.rawSeeders !== a.rawSeeders) return b.rawSeeders - a.rawSeeders;
        return b.rawSize - a.rawSize;
    } else if (sortBy === 'seeders') {
        if (b.rawSeeders !== a.rawSeeders) return b.rawSeeders - a.rawSeeders;
        return b.rawSize - a.rawSize; // fallback to size if seeders are equal
    } else {
        if (b.rawSize !== a.rawSize) return b.rawSize - a.rawSize;
        return b.rawSeeders - a.rawSeeders; // fallback to seeders if size is equal
    }
  });

  const forceReload = () => {
    setIframeKey(prev => prev + 1);
    startFallbackTimer();
  };

  const getEmbedUrl = () => {
    const selectedProvider = STREAMING_PROVIDERS.find(p => p.id === provider) || STREAMING_PROVIDERS[0];
    return selectedProvider.getUrl(activeMagnet);
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Content */}
        <div className="flex-1">
          {/* Breadcrumb */}
          <div className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
            <Link to="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <Link to={`/anime/${id}`} className="hover:text-primary line-clamp-1">{anime?.title}</Link>
            <span>/</span>
            <span className="text-foreground">Episode {currentEp}</span>
          </div>

          {/* Video Player Area */}
          <div className="aspect-video bg-[#050507] rounded-[24px] overflow-hidden relative group border border-[var(--glass-border)] shadow-2xl">
            <div className="w-full h-full bg-black relative">
              {!isPlaying ? (
                <div 
                  className={`absolute inset-0 flex flex-col items-center justify-center text-center z-10 transition-colors ${torrents && torrents.length > 0 ? 'cursor-pointer hover:bg-white/5' : ''}`}
                  onClick={() => {
                    if (torrents && torrents.length > 0) {
                      handlePlayTorrent(torrents[0].magnet);
                    }
                  }}
                >
                  <button 
                    className={`rounded-full p-6 md:p-8 bg-primary/20 text-primary border border-primary/30 transition-all ${torrents && torrents.length > 0 ? 'hover:scale-110 hover:bg-primary shadow-lg shadow-primary/20 hover:text-white hover:shadow-primary/40' : 'opacity-50 cursor-not-allowed'}`}
                    disabled={!torrents || torrents.length === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (torrents && torrents.length > 0) {
                        handlePlayTorrent(torrents[0].magnet);
                      }
                    }}
                  >
                    <Play className="w-12 h-12 md:w-16 md:h-16 fill-current ml-2" />
                  </button>
                  <p className="text-white/60 font-medium mt-6 text-sm md:text-base px-4">
                    {torrentsLoading ? (
                       <span className="flex items-center gap-2">
                         <Loader2 className="w-4 h-4 animate-spin" />
                         Searching for streams...
                       </span>
                    ) : (torrents && torrents.length > 0) ? (
                      'Click to auto-play best source'
                    ) : (
                      'No streams found automatically. Try selecting below.'
                    )}
                  </p>
                  <p className="text-white/30 text-xs mt-3 bg-black/40 px-3 py-1 rounded-full backdrop-blur-md">Powered by WebTorrent</p>
                </div>
              ) : provider === 'webtor' ? (
                <div ref={playerRef} className="webtor absolute inset-0 w-full h-full z-10"></div>
              ) : (
                <iframe
                  key={`${provider}-${activeMagnet}-${iframeKey}`}
                  src={getEmbedUrl()}
                  className="w-full h-full border-none outline-none z-10 relative"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
          </div>

          {showFallback && isPlaying && (
            <div className="mt-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between animate-in fade-in slide-in-from-top-2">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-yellow-500 mb-1">Taking too long to load?</h4>
                  <p className="text-xs text-muted-foreground">The torrent might have low seeders, or the cloud provider is busy.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button 
                  onClick={forceReload}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[var(--glass)] hover:bg-[var(--glass-border)] rounded-lg text-xs font-medium text-foreground transition-colors border border-[var(--glass-border)]"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reload Player
                </button>
                <button 
                  onClick={() => {
                    setProvider('magnetplayer');
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary hover:bg-primary/90 rounded-lg text-xs font-medium text-primary-foreground transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Try P2P Player
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
            <div className="flex items-center gap-3 bg-[var(--glass)] p-2 pr-6 rounded-2xl border border-[var(--glass-border)] shrink-0">
              <img src={anime?.images?.webp?.large_image_url || anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url} alt="" className="w-12 h-16 rounded-xl object-cover" />
              <div>
                <h2 className="font-bold text-foreground text-[14px] line-clamp-1">{anime?.title}</h2>
                <p className="text-[12px] text-primary font-bold">Episode {currentEp}</p>
              </div>
            </div>
            
            {isPlaying && (
              <div className="flex items-center gap-2 bg-[var(--glass)] px-4 py-2 rounded-xl border border-[var(--glass-border)] shrink-0">
                <span className="text-xs font-bold text-muted-foreground mr-2 uppercase tracking-wider">Player</span>
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    if (isPlaying) {
                      setIframeKey(prev => prev + 1);
                      startFallbackTimer();
                    }
                  }}
                  className="bg-transparent border-none text-foreground text-sm font-semibold focus:outline-none cursor-pointer [&>option]:bg-background"
                >
                  {STREAMING_PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Torrents Section */}
          <div className="mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <CloudRain className="w-5 h-5 text-primary" /> Stream Sources & Downloads
              </h3>
              
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort by:</span>
                <select 
                  className="bg-transparent border border-border text-sm text-foreground rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary transition-colors cursor-pointer [&>option]:bg-background"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'best' | 'seeders' | 'size')}
                >
                  <option value="best">Best</option>
                  <option value="seeders">Seeders</option>
                  <option value="size">File Size</option>
                </select>
              </div>
            </div>
            
            <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
                <div>
                  <p className="font-semibold text-yellow-500">Mobile torrent warning</p>
                  <p className="mt-1">
                    Mobile browsers may not open torrent streams directly. Use Copy Magnet, Open in App, or a cloud player if playback does not start.
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
                <p>No browser-compatible video streams found for this episode.</p>
                <p className="text-sm mt-1">Make sure the anime has aired.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedTorrents.map((torrent, idx) => {
                  const isCurrentStream = activeMagnet === torrent.magnet;
                  return (
                    <div key={idx} className={`bg-[var(--glass)] border p-4 rounded-xl flex flex-col xl:flex-row xl:items-center justify-between gap-4 transition-all hover:bg-[rgba(225,29,72,0.05)] ${isCurrentStream ? 'border-primary shadow-[0_0_15px_rgba(225,29,72,0.15)] bg-primary/5' : 'border-[var(--glass-border)] hover:border-primary/30'}`}>
                      <div className="flex-1 min-w-0 pr-4">
                        <h4 className="text-sm font-semibold text-foreground line-clamp-2 md:line-clamp-1 mb-2" title={torrent.title}>{torrent.title}</h4>
                        <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                          <span className="flex items-center gap-1.5 text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md text-[11px] uppercase tracking-wider">
                            <HardDrive className="w-3.5 h-3.5" /> {torrent.size}
                          </span>
                          <span className="flex items-center gap-1.5 text-green-400 bg-green-500/10 px-2 py-1 rounded-md text-[11px] uppercase tracking-wider">
                            <Users className="w-3.5 h-3.5" /> Seeding: {torrent.seeders}
                          </span>
                          {isCurrentStream && (
                            <span className="flex items-center gap-1.5 text-primary bg-primary/10 px-2 py-1 rounded-md text-[11px] uppercase tracking-wider font-bold">
                              <Play className="w-3 h-3 fill-current" /> Now Playing
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0 mt-2 sm:mt-0">
                        <button 
                          onClick={() => {
                            if (navigator.clipboard) {
                              navigator.clipboard.writeText(torrent.magnet);
                              // Could add a toast here
                            }
                          }}
                          className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-105 active:scale-95"
                          title="Copy Magnet Link"
                        >
                          <LinkIcon className="w-4 h-4" />
                          <span className="hidden sm:inline">Copy Magnet</span>
                        </button>
                        <a 
                          href={torrent.magnet}
                          className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-105 active:scale-95"
                          title="Open Torrent directly or use Magnet Client to Download"
                        >
                          <Download className="w-4 h-4" />
                          <span className="hidden sm:inline">Open in App</span>
                        </a>
                        <button 
                          onClick={() => handlePlayTorrent(torrent.magnet)}
                          disabled={!torrent.magnet || isCurrentStream}
                          className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${isCurrentStream ? 'bg-primary/20 text-primary cursor-default' : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95 disabled:opacity-50'}`}
                        >
                          <Play className="w-4 h-4 fill-current" />
                          {isCurrentStream ? 'Playing' : 'Stream'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Episodes Sidebar */}
        <div className="w-full lg:w-80 shrink-0">
          <div className="bg-[var(--glass)] rounded-[24px] border border-[var(--glass-border)] overflow-hidden flex flex-col h-[600px] shadow-lg sticky top-24">
            <div className="p-5 border-b border-[var(--glass-border)] flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2 text-foreground">
                <List className="w-5 h-5 text-primary" /> Episodes
              </h3>
              <button 
                onClick={() => setShowEpNames(!showEpNames)}
                className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                {showEpNames ? 'Hide' : 'Show'} details
              </button>
            </div>
            
            {(() => {
              const airedCount = anime?.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : 
                (anime?.status === 'RELEASING' || anime?.status === 'NOT_YET_RELEASED' ? (episodesData?.data?.length > 0 ? Math.max(...episodesData.data.map((e: any) => e.mal_id)) : 0) : (anime?.episodes || (episodesData?.data?.length > 0 ? Math.max(...episodesData.data.map((e: any) => e.mal_id)) : 12)));
              const lastVisiblePage = Math.ceil(airedCount / 100) || 1;
              
              if (lastVisiblePage > 1) {
                return (
                  <div className="px-3 pt-3 pb-1">
                    <select 
                      className="w-full bg-secondary text-[13px] font-semibold rounded-lg px-3 py-2 border border-border focus:outline-none focus:border-primary cursor-pointer text-foreground"
                      value={epPage}
                      onChange={(e) => setEpPage(parseInt(e.target.value))}
                    >
                      {Array.from({ length: lastVisiblePage }, (_, i) => (
                        <option key={i} value={i} className="bg-background">
                          Episodes {i * 100 + 1} - {i === lastVisiblePage - 1 ? airedCount : (i + 1) * 100}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }
              return null;
            })()}
            
            <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar relative">
              {displayEpisodes.map((ep: any, index: number) => {
                const epNum = ep.mal_id || epPage * 100 + index + 1;
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
                    <span className={`text-[13px] font-black w-8 ${isActive ? 'text-primary-foreground' : ''}`}>
                      {epNum}
                    </span>
                    {showEpNames && (
                      <span className="text-[13px] font-semibold line-clamp-1 flex-1">
                        {ep.title || ep.title_romanji || ep.title_english || `Episode ${epNum}`}
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
