import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Download,
  Gauge,
  HardDrive,
  Home,
  Library,
  ListVideo,
  MonitorPlay,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getDesktopRuntimeStatus, loadDesktopPlaybackSettings, type DesktopRuntimeStatus } from '../lib/desktop';

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/nyaa', label: 'Sources', icon: Download },
  { to: '/local-player', label: 'Player', icon: MonitorPlay },
  { to: '/search', label: 'Browse', icon: Search },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/my-list', label: 'Library', icon: Library },
  { to: '/compare', label: 'Compare', icon: BarChart3 },
];

function pageTitle(pathname: string) {
  if (pathname === '/') return 'Desktop Home';
  if (pathname.startsWith('/nyaa')) return 'Source Finder';
  if (pathname.startsWith('/local-player')) return 'Local Player';
  if (pathname.startsWith('/search')) return 'Anime Browser';
  if (pathname.startsWith('/schedule')) return 'Release Schedule';
  if (pathname.startsWith('/my-list')) return 'My Library';
  if (pathname.startsWith('/compare')) return 'Anime Compare';
  if (pathname.startsWith('/dashboard')) return 'Account';
  if (pathname.startsWith('/admin')) return 'Admin Console';
  return 'StreamNyaa Desktop';
}

function pageHint(pathname: string) {
  if (pathname.startsWith('/nyaa')) return 'Search, filter, score, and send sources to the local player.';
  if (pathname.startsWith('/local-player')) return 'Pick a recent source, start rqbit, and play through MPV.';
  if (pathname.startsWith('/search')) return 'Find title pages, episode context, schedules, and download actions.';
  if (pathname.startsWith('/schedule')) return 'Track airing windows and jump into title pages faster.';
  return 'Desktop-first anime discovery and local playback tools.';
}

export default function DesktopShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [query, setQuery] = useState('');
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDesktopRuntimeStatus(loadDesktopPlaybackSettings()).then((status) => {
      if (!cancelled && status) setRuntime(status);
    }).catch(() => {
      if (!cancelled) setRuntime(null);
    });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const title = pageTitle(location.pathname);
  const hint = pageHint(location.pathname);
  const readyLabel = useMemo(() => {
    if (!runtime) return 'Checking runtime';
    if (runtime.ready) return 'Local playback ready';
    if (!runtime.torrent_engine_configured) return 'rqbit setup needed';
    if (!runtime.player_configured) return 'MPV setup needed';
    return 'Runtime setup needed';
  }, [runtime]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) {
      navigate('/search');
      return;
    }
    navigate(`/search?q=${encodeURIComponent(value)}`);
  };

  const submitSourceSearch = () => {
    const value = query.trim();
    navigate(value ? `/nyaa?desktop=1&q=${encodeURIComponent(value)}` : '/nyaa?desktop=1');
  };

  return (
    <div className="desktop-shell min-h-screen overflow-hidden bg-[#050507] text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(225,29,72,0.18),transparent_32%),radial-gradient(circle_at_92%_10%,rgba(14,165,233,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_38%)]" />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] border-r border-white/10 bg-black/38 px-3 py-4 shadow-2xl shadow-black/30 backdrop-blur-2xl lg:flex lg:flex-col">
        <Link to="/" className="mb-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
            <HardDrive className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-black uppercase tracking-[0.22em] text-primary">Stream</span>
            <span className="-mt-1 block text-xl font-black tracking-tight text-white">Nyaa</span>
          </span>
        </Link>

        <div className="space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-black transition-all ${
                isActive
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-white/62 hover:bg-white/[0.075] hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-70" />
            </NavLink>
          ))}
        </div>

        <div className="mt-auto space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${runtime?.ready ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <p className="text-xs font-black uppercase tracking-wider text-white/78">{readyLabel}</p>
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-white/48">
              {runtime?.message || 'Checking rqbit and MPV before local playback.'}
            </p>
          </div>
          <Link
            to={user ? '/dashboard' : '/login'}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 text-sm font-bold text-white/72 transition-colors hover:border-primary/35 hover:text-white"
          >
            <UserCircle className="h-4 w-4 text-primary" />
            {user ? 'Dashboard' : 'Sign in'}
          </Link>
          {isAdmin ? (
            <Link
              to="/admin"
              className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-3 text-sm font-black text-primary transition-colors hover:bg-primary hover:text-white"
            >
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          ) : null}
        </div>
      </aside>

      <div className="relative z-10 flex min-h-screen flex-col lg:pl-[236px]">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#050507]/72 px-4 py-3 backdrop-blur-2xl lg:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Desktop workspace
              </div>
              <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-white">{title}</h1>
              <p className="mt-1 line-clamp-1 text-sm text-white/52">{hint}</p>
            </div>

            <form onSubmit={submitSearch} className="flex w-full max-w-3xl flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search anime title or paste a source query..."
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.055] pl-11 pr-4 text-sm font-semibold text-white outline-none transition-colors placeholder:text-white/35 focus:border-primary/60"
                />
              </div>
              <button
                type="submit"
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.07] px-5 text-sm font-black text-white transition-colors hover:border-primary/40"
              >
                Browse
              </button>
              <button
                type="button"
                onClick={submitSourceSearch}
                className="h-12 rounded-2xl bg-primary px-5 text-sm font-black text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90"
              >
                Sources
              </button>
            </form>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-black ${
                  isActive
                    ? 'border-primary bg-primary text-white'
                    : 'border-white/10 bg-white/[0.055] text-white/62'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1fr)_280px]">
          <main className="min-w-0 px-0 py-0">
            <Outlet />
          </main>

          <aside className="hidden border-l border-white/10 bg-black/20 p-4 backdrop-blur-xl xl:block">
            <div className="sticky top-24 space-y-4">
              <Link to="/nyaa?desktop=1" className="block rounded-3xl border border-primary/25 bg-primary/12 p-4 transition-colors hover:bg-primary/18">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white">
                    <Download className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black text-white">Find sources</p>
                    <p className="text-xs text-white/52">Fast metadata search</p>
                  </div>
                </div>
              </Link>

              <Link to="/local-player?desktop=1" className="block rounded-3xl border border-white/10 bg-white/[0.045] p-4 transition-colors hover:border-primary/30">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-primary">
                    <MonitorPlay className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black text-white">Local player</p>
                    <p className="text-xs text-white/52">Recent source selector</p>
                  </div>
                </div>
              </Link>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" />
                  <p className="text-xs font-black uppercase tracking-wider text-white/78">Desktop status</p>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between rounded-2xl bg-black/22 px-3 py-2">
                    <span className="text-xs font-bold text-white/52">rqbit</span>
                    <span className={runtime?.torrent_engine_configured ? 'text-xs font-black text-emerald-300' : 'text-xs font-black text-amber-300'}>
                      {runtime?.torrent_engine_configured ? 'Ready' : 'Needed'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-black/22 px-3 py-2">
                    <span className="text-xs font-bold text-white/52">MPV</span>
                    <span className={runtime?.player_configured ? 'text-xs font-black text-emerald-300' : 'text-xs font-black text-amber-300'}>
                      {runtime?.player_configured ? 'Ready' : 'Needed'}
                    </span>
                  </div>
                </div>
              </div>

              <Link to="/local-player?desktop=1" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white/72 transition-colors hover:text-white">
                <Settings className="h-4 w-4 text-primary" />
                Playback settings
              </Link>
              <Link to="/local-player?desktop=1" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white/72 transition-colors hover:text-white">
                <ListVideo className="h-4 w-4 text-primary" />
                Recent sources
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
