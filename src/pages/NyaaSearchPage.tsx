import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchNyaa } from '../api/nyaa';
import { Search, Loader2, Download, Tv, HardDrive, AlertTriangle } from 'lucide-react';

export default function NyaaSearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('1_0');
  const [filter, setFilter] = useState('0');

  const { data: torrents, isLoading } = useQuery({
    queryKey: ['nyaaSearch', query, category, filter],
    queryFn: () => searchNyaa(query, category, filter),
    enabled: true, // we fetch default category even without query
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(searchInput);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col items-center mb-8">
        <h1 className="text-3xl font-black mb-4 flex items-center gap-2">
            <HardDrive className="w-8 h-8 text-primary" />
            Anime Torrents Search
        </h1>
        <p className="text-muted-foreground mb-8 text-center max-w-xl">
          Search public anime torrent metadata, open magnet links in your preferred client, or try browser-compatible streaming providers.
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
            Search Nyaa
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-4 w-full max-w-3xl">
          <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded-lg">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
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
              onChange={(e) => setFilter(e.target.value)}
              className="bg-transparent text-sm text-foreground focus:outline-none p-2 rounded-md font-medium [&>option]:bg-background"
            >
              <option value="0">No Filter</option>
              <option value="1">No Remakes</option>
              <option value="2">Trusted Only</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mx-auto mb-6 max-w-5xl rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-muted-foreground">
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

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      ) : torrents?.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground text-lg">No torrents found. Try different filters or terms.</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-5xl mx-auto">
          {torrents?.map((torrent, idx) => (
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
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0 mt-4 md:mt-0">
                  <a
                    href={torrent.magnet}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
                    title="Open magnet in torrent app"
                  >
                    <Download className="w-4 h-4" />
                    Open Magnet
                  </a>
                  <button
                    onClick={() => navigate(`/torrent?magnet=${encodeURIComponent(torrent.magnet)}`)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-primary/25"
                  >
                    <Tv className="w-4 h-4" />
                    Stream
                  </button>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
