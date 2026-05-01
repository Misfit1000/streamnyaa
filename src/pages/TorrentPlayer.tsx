import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Play, ArrowLeft, ExternalLink, Download, AlertTriangle, RefreshCw } from 'lucide-react';

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
    name: 'Embedded Player (P2P)', 
    getUrl: (magnet: string) => `https://ferrolho.github.io/magnet-player/?magnet=${encodeURIComponent(magnet)}` 
  }
];

export default function TorrentPlayer() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const initialMagnet = location.state?.magnetUrl || searchParams.get('magnet') || '';
  const initialPoster = location.state?.poster || '';

  const [magnetUrl, setMagnetUrl] = useState(initialMagnet);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeUrl, setActiveUrl] = useState('');
  const [provider, setProvider] = useState(STREAMING_PROVIDERS[0].id);
  const [showFallback, setShowFallback] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const fallbackTimer = useRef<NodeJS.Timeout | null>(null);
  const webtorBootTimer = useRef<NodeJS.Timeout | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPlaying && activeUrl && provider === 'webtor' && playerRef.current) {
      playerRef.current.innerHTML = '';
      const playerId = `webtor-player-${iframeKey}`;
      playerRef.current.id = playerId;

      const webtorConfig = {
        id: playerId,
        magnet: activeUrl,
        poster: initialPoster || 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1200&auto=format&fit=crop',
        width: '100%',
        height: '100%',
        theme: 'dark',
        lang: 'en',
        premium: true,
        vip: true,
        hasAds: false,
        adblock: true,
        features: {
          ads: false,
          adBlock: true,
          p2pProgress: true,
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
    
    return () => {
      if (webtorBootTimer.current) clearTimeout(webtorBootTimer.current);
    };
  }, [activeUrl, isPlaying, provider, iframeKey]);

  const clearFallbackTimer = () => {
    if (fallbackTimer.current) {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  };

  useEffect(() => {
    if (initialMagnet) {
      setActiveUrl(initialMagnet);
      setIsPlaying(true);
      startFallbackTimer();
    }
    return () => clearFallbackTimer();
  }, [initialMagnet]);

  const startFallbackTimer = () => {
    clearFallbackTimer();
    setShowFallback(false);
    fallbackTimer.current = setTimeout(() => {
      setShowFallback(true);
    }, 15000);
  };

  const handlePlay = (e: React.FormEvent) => {
    e.preventDefault();
    if (magnetUrl.trim()) {
      setActiveUrl(magnetUrl.trim());
      setIsPlaying(true);
      setIframeKey(prev => prev + 1);
      startFallbackTimer();
    }
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value;
    setProvider(newProvider);
    if (isPlaying) {
      setIframeKey(prev => prev + 1);
      startFallbackTimer();
    }
  };

  const forceReload = () => {
    setIframeKey(prev => prev + 1);
    startFallbackTimer();
  };

  const getEmbedUrl = () => {
    const selectedProvider = STREAMING_PROVIDERS.find(p => p.id === provider) || STREAMING_PROVIDERS[0];
    return selectedProvider.getUrl(activeUrl);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
             <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
            <h1 className="text-3xl font-black text-foreground">Torrent Stream</h1>
            {isPlaying && (
              <a 
                href={activeUrl}
                className="flex items-center gap-2 bg-primary/20 text-primary hover:bg-primary/30 px-4 py-2 rounded-xl font-medium text-sm transition-colors border border-primary/30 w-fit"
              >
                <Download className="w-4 h-4" />
                Open Local Client
              </a>
            )}
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Stream directly from a Magnet URI in your browser.<br/>
            <span className="text-yellow-500 font-medium">Note:</span> Connection speed depends entirely on the torrent's seeder count.
          </p>
        </div>

        <form onSubmit={handlePlay} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={magnetUrl}
              onChange={(e) => setMagnetUrl(e.target.value)}
              placeholder="Paste your magnet link here..."
              className="flex-1 bg-[var(--glass)] border border-[var(--glass-border)] px-4 py-3 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={provider}
              onChange={handleProviderChange}
              className="bg-[var(--glass)] border border-[var(--glass-border)] px-4 py-3 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary/50 transition-colors cursor-pointer"
            >
              {STREAMING_PROVIDERS.map(p => (
                <option key={p.id} value={p.id} className="bg-background text-foreground">{p.name}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!magnetUrl.trim()}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 fill-current" />
              Stream
            </button>
          </div>
        </form>

        {showFallback && isPlaying && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between animate-in fade-in slide-in-from-top-2">
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

        <div className="bg-secondary rounded-[24px] border border-[var(--glass-border)] overflow-hidden">
          <div className="aspect-video bg-black relative flex w-full items-center justify-center shadow-2xl">
            {!isPlaying ? (
              <div className="text-center z-0">
                <Play className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <p className="text-white/40 font-medium">Ready to play</p>
              </div>
            ) : provider === 'webtor' ? (
              <div ref={playerRef} className="webtor w-full h-full absolute inset-0"></div>
            ) : (
              <iframe
                key={`${provider}-${activeUrl}-${iframeKey}`}
                src={getEmbedUrl()}
                className="w-full h-full border-none outline-none absolute top-0 left-0"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
