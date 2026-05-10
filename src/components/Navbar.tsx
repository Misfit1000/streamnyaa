import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Menu, X, Moon, Sun, Bookmark, Cat, UserCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { theme, toggleTheme, nsfwMode, toggleNsfwMode } = useStore();
  const { user, isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRating, setFilterRating] = useState('');
  
  const filterRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilters(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [searchParams]);

  useEffect(() => {
    setSearchQuery(searchParams.get('q') || '');
    setFilterType(searchParams.get('type') || '');
    setFilterStatus(searchParams.get('status') || '');
    setFilterRating(searchParams.get('rating') || '');
  }, [searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.append('q', searchQuery);
    if (filterType) params.append('type', filterType);
    if (filterStatus) params.append('status', filterStatus);
    if (filterRating) params.append('rating', filterRating);
    
    if (params.toString()) {
      setShowFilters(false);
      navigate(`/search?${params.toString()}`);
    } else {
      navigate('/search');
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--glass-border)] bg-background/78 shadow-lg shadow-black/5 backdrop-blur-2xl">
      <div className="container mx-auto px-4 md:px-10 h-16 flex items-center justify-between gap-4 md:gap-8">
        <div className="flex items-center gap-4 md:gap-8">
          <Link to="/" className="text-xl sm:text-2xl font-black text-primary flex items-center gap-2 tracking-tighter shrink-0">
            <Cat className="w-6 h-6 sm:w-8 sm:h-8" />
            <span className="hidden sm:inline">STREAMNYAA</span>
          </Link>
          
          <div className="hidden lg:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/search" className="hover:text-foreground transition-colors">Browse</Link>
            <Link to="/my-list" className="hover:text-foreground transition-colors">My List</Link>
            <Link to="/schedule" className="hover:text-foreground transition-colors">Schedule</Link>
            <Link to="/compare" className="hover:text-foreground transition-colors">Compare</Link>
            <Link to="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <Link to="/nyaa" className="hover:text-foreground transition-colors text-primary font-bold">Downloads</Link>
          </div>
        </div>

        <div className="flex-1 max-w-[400px] hidden md:block relative" ref={filterRef}>
          <form onSubmit={handleSearch} className="relative flex items-center">
            <input
              type="text"
              placeholder="Search your favorite anime..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--glass)] border border-[var(--glass-border)] py-2 pl-10 pr-24 rounded-full text-foreground placeholder:text-muted-foreground text-[13px] focus:outline-none focus:border-primary/50 transition-colors"
            />
            <Search className="absolute left-4 w-4 h-4 text-muted-foreground" />
            <button 
              type="button" 
              onClick={() => setShowFilters(!showFilters)}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest flex items-center gap-1 font-bold transition-all ${showFilters || filterType || filterStatus || filterRating ? 'bg-primary/20 text-primary' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'}`}
            >
              Filters <span className="text-[8px] opacity-70">{showFilters ? '▲' : '▼'}</span>
            </button>
          </form>
          
          {showFilters && (
            <div className="absolute top-full z-50 mt-2 flex w-full flex-col gap-4 overflow-hidden rounded-xl border border-[var(--glass-border)] bg-background/88 p-4 shadow-xl shadow-black/20 backdrop-blur-2xl">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">Type</label>
                  <select 
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full bg-secondary/50 border border-border rounded-lg text-sm p-2 focus:outline-none focus:border-primary transition-colors text-foreground"
                  >
                    <option value="">Any Type</option>
                    <option value="tv">TV</option>
                    <option value="movie">Movie</option>
                    <option value="ova">OVA</option>
                    <option value="special">Special</option>
                    <option value="ona">ONA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full bg-secondary/50 border border-border rounded-lg text-sm p-2 focus:outline-none focus:border-primary transition-colors text-foreground"
                  >
                    <option value="">Any Status</option>
                    <option value="airing">Airing</option>
                    <option value="complete">Complete</option>
                    <option value="upcoming">Upcoming</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">Rating</label>
                <select
                  value={filterRating}
                  onChange={(e) => setFilterRating(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-lg text-sm p-2 focus:outline-none focus:border-primary transition-colors text-foreground"
                >
                  <option value="">Any Rating</option>
                  <option value="g">G - All Ages</option>
                  <option value="pg">PG - Children</option>
                  <option value="pg13">PG-13 - Teens 13 or older</option>
                  <option value="r17">R - 17+ (violence & profanity)</option>
                  <option value="r">R+ - Mild Nudity</option>
                  <option value="rx">Rx - Hentai</option>
                </select>
              </div>
              
              <button 
                onClick={handleSearch}
                className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-bold mt-2 hover:bg-primary/90 transition-colors"
              >
                Apply Filters & Search
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => {
              toggleNsfwMode();
              queryClient.invalidateQueries();
            }}
            className={`text-xs px-3 py-1.5 rounded-full font-bold uppercase transition-colors ${nsfwMode ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'bg-green-500/10 text-green-500 border border-transparent hover:bg-green-500/20'}`}
          >
            {nsfwMode ? 'NSFW' : 'SFW'}
          </button>
          <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-secondary/80 transition-colors text-foreground">
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <Link to="/my-list" className="p-2 rounded-full hover:bg-secondary/80 transition-colors text-foreground hidden sm:block">
            <Bookmark className="w-5 h-5" />
          </Link>
          <Link to={user ? '/dashboard' : '/login'} className="p-2 rounded-full hover:bg-secondary/80 transition-colors text-foreground" title={user ? 'Dashboard' : 'Login'}>
            <UserCircle className="w-5 h-5" />
          </Link>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="lg:hidden p-2 rounded-full hover:bg-secondary/80 transition-colors text-foreground"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="absolute left-0 top-full z-50 w-full border-b border-[var(--glass-border)] bg-background/90 shadow-xl shadow-black/20 backdrop-blur-2xl lg:hidden">
          <div className="container mx-auto px-6 py-4 flex flex-col gap-4">
            <form onSubmit={handleSearch} className="md:hidden relative flex items-center mb-2">
              <input
                type="text"
                placeholder="Search anime..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--glass)] border border-[var(--glass-border)] py-2.5 pl-10 pr-20 rounded-xl text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary/50 transition-colors"
              />
              <Search className="absolute left-3 w-4 h-4 text-muted-foreground" />
              <button 
                type="button" 
                onClick={() => setShowFilters(!showFilters)}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-widest flex items-center gap-1 font-bold transition-all ${showFilters || filterType || filterStatus || filterRating ? 'bg-primary/20 text-primary' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'}`}
              >
                Filters <span className="text-[8px] opacity-70">{showFilters ? '▲' : '▼'}</span>
              </button>
            </form>
            
            {showFilters && (
              <div className="bg-secondary/30 border border-border rounded-xl p-4 flex flex-col gap-3 mb-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Type</label>
                    <select 
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg text-sm p-2"
                    >
                      <option value="">Any</option>
                      <option value="tv">TV</option>
                      <option value="movie">Movie</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Status</label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg text-sm p-2"
                    >
                      <option value="">Any</option>
                      <option value="airing">Airing</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex flex-col gap-3 text-sm font-medium">
              <Link to="/" className="hover:text-primary transition-colors py-2 border-b border-border/50">Home</Link>
              <Link to="/search" className="hover:text-primary transition-colors py-2 border-b border-border/50">Browse</Link>
              <Link to="/my-list" className="hover:text-primary transition-colors py-2 border-b border-border/50">My List</Link>
              <Link to="/schedule" className="hover:text-primary transition-colors py-2 border-b border-border/50">Schedule</Link>
              <Link to="/compare" className="hover:text-primary transition-colors py-2 border-b border-border/50">Compare</Link>
              <Link to="/blog" className="hover:text-primary transition-colors py-2 border-b border-border/50">Blog</Link>
              <Link to={user ? '/dashboard' : '/login'} className="hover:text-primary transition-colors py-2 border-b border-border/50">{user ? 'Dashboard' : 'Login'}</Link>
              {isAdmin ? <Link to="/admin" className="hover:text-primary transition-colors py-2 border-b border-border/50">Admin</Link> : null}
              <Link to="/nyaa" className="hover:text-primary transition-colors py-2 border-b border-border/50 text-primary font-bold">Downloads</Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
