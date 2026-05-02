import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAnimeDetails } from '../api/jikan';
import { searchNyaa } from '../api/nyaa';
import { Download, Tv, HardDrive, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { animePath } from '../lib/slug';
import Seo from '../components/Seo';

export default function AnimeDownloads() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const epParam = searchParams.get('ep');
  const typeParam = searchParams.get('type');
  
  // If epParam is present, default filter to empty or "1080p" instead of "[Batch]"
  const [downloadFilter, setDownloadFilter] = useState(epParam ? '1080p' : '[Batch]');
  const [sortBy, setSortBy] = useState<'best' | 'seeders' | 'size'>('best');

  const { data, isLoading: animeLoading } = useQuery({
    queryKey: ['anime', id],
    queryFn: () => fetchAnimeDetails(id!),
    enabled: !!id,
  });

  const anime = data?.data;

  const { data: torrents, isLoading: torrentsLoading } = useQuery({
    queryKey: ['nyaa-download', anime?.title, epParam, downloadFilter, typeParam],
    queryFn: async () => {
      const romaji = anime?.title_romaji;
      const english = anime?.title_english;
      const native = anime?.title;

      const epStr = epParam ? epParam.padStart(2, '0') : '';
      const isDub = typeParam === 'dub';

      const cleanTitle = (t: string) => {
        if (!t) return '';
        return t.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      };

      const performSearch = async (t: string, ep: string) => {
        if (!t) return [];
        let query = `${cleanTitle(t)}`;
        if (ep) query += ` ${ep}`;
        if (downloadFilter) query += ` ${downloadFilter}`;
        if (isDub) query += ' dub';
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
      if (results.length === 0 && epParam && epStr !== epParam) {
        results = await trySearches(epParam);
      }
      
      // Secondary fallback without episode number at all (useful for movies or single OVAs)
      if (results.length === 0 && epParam === '1') {
        results = await trySearches("");
      }
      
      return results;
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
        return b.rawSize - a.rawSize;
    } else {
        if (b.rawSize !== a.rawSize) return b.rawSize - a.rawSize;
        return b.rawSeeders - a.rawSeeders;
    }
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Seo
        title={`${anime.title} Episode Downloads and Torrent Search | StreamNyaa`}
        description={`Find ${anime.title} episode search results, torrent metadata, file sizes, seeders, and download options on StreamNyaa.`}
        canonicalPath={animePath(anime, '/downloads')}
      />
      <Link to={data?.data ? animePath(data.data) : `/anime/${id}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Back to Anime Details
      </Link>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4 bg-secondary/20 p-6 rounded-2xl border border-border">
        <div className="flex items-center gap-4">
          <img src={anime.images.jpg.image_url} alt={anime.title} className="w-16 h-24 object-cover rounded shadow-md" />
          <div>
            <h1 className="text-2xl font-black text-foreground mb-1">{anime.title}</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              Download Options
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {['[Batch]', '1080p', '720p', 'RAW'].map(filter => (
              <button
                key={filter}
                onClick={() => setDownloadFilter(filter === downloadFilter ? '' : filter)}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                  downloadFilter === filter
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary hover:bg-secondary/80 text-foreground'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
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
      </div>

      <div className="mb-6 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
          <div>
            <p className="font-semibold text-yellow-500">Mobile torrent warning</p>
            <p className="mt-1">
              Mobile browsers may not stream or download torrents directly. Use Open Magnet with a torrent app, or copy the magnet into a cloud player.
            </p>
          </div>
        </div>
      </div>

      {torrentsLoading ? (
        <div className="py-20 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-muted-foreground font-medium">Searching Nyaa for {downloadFilter ? downloadFilter : 'torrents'}...</p>
        </div>
      ) : torrents?.length === 0 ? (
        <div className="bg-secondary/30 border border-border p-12 rounded-3xl text-center flex flex-col items-center">
          <HardDrive className="w-16 h-16 text-muted-foreground mb-4" />
          <p className="text-xl font-bold text-foreground mb-2">No Torrents Found</p>
          <p className="text-muted-foreground">
            No torrents were found for "{anime.title}" with the selected filter. Try a different filter or search.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedTorrents.map((torrent, idx) => (
            <div key={idx} className="bg-secondary/20 hover:bg-secondary/40 border border-border/50 hover:border-primary/50 transition-all p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 group">
                <div className="flex-1 min-w-0">
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
                    <span className="opacity-70">{new Date(torrent.pubDate).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0 mt-2 md:mt-0">
                  <a
                    href={torrent.magnet}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
                    title="Open magnet in torrent app"
                  >
                    <Download className="w-4 h-4" />
                    Open Magnet
                  </a>
                  <Link
                    to={`/torrent?magnet=${encodeURIComponent(torrent.magnet)}`}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-primary/25"
                  >
                    <Tv className="w-4 h-4" />
                    Stream
                  </Link>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
