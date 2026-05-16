import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  Download,
  HardDrive,
  Home,
  Library,
  MonitorPlay,
  Search,
  Settings,
  ShieldCheck,
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
  if (pathname === '/') return 'Home';
  if (pathname.startsWith('/nyaa')) return 'Sources';
  if (pathname.startsWith('/local-player')) return 'Player';
  if (pathname.startsWith('/search')) return 'Browse';
  if (pathname.startsWith('/schedule')) return 'Schedule';
  if (pathname.startsWith('/my-list')) return 'Library';
  if (pathname.startsWith('/compare')) return 'Compare';
  if (pathname.startsWith('/dashboard')) return 'Account';
  if (pathname.startsWith('/admin')) return 'Admin';
  return 'StreamNyaa';
}

function runtimeText(runtime: DesktopRuntimeStatus | null) {
  if (!runtime) return 'Checking';
  if (runtime.ready) return 'Ready';
  if (!runtime.torrent_engine_configured) return 'rqbit missing';
  if (!runtime.player_configured) return 'MPV missing';
  return 'Setup needed';
}

export default function DesktopShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [query, setQuery] = useState('');
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDesktopRuntimeStatus(loadDesktopPlaybackSettings())
      .then((status) => {
        if (!cancelled && status) setRuntime(status);
      })
      .catch(() => {
        if (!cancelled) setRuntime(null);
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const runtimeReady = Boolean(runtime?.ready);
  const title = pageTitle(location.pathname);
  const statusLabel = useMemo(() => runtimeText(runtime), [runtime]);

  const submitBrowse = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/search?q=${encodeURIComponent(value)}` : '/search');
  };

  const submitSources = () => {
    const value = query.trim();
    navigate(value ? `/nyaa?desktop=1&q=${encodeURIComponent(value)}` : '/nyaa?desktop=1');
  };

  return (
    <div className="desktop-shell min-h-screen bg-[#07080a] text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] border-r border-white/10 bg-[#0b0c0f] lg:flex lg:flex-col">
        <Link to="/" className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
            <HardDrive className="h-4 w-4" />
          </span>
          <span className="text-base font-black tracking-tight text-white">StreamNyaa</span>
        </Link>

        <nav className="flex-1 space-y-1 px-2 py-3">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-white text-black'
                  : 'text-white/62 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <Link
            to="/local-player?desktop=1"
            className="mb-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5 text-xs font-semibold text-white/70 hover:border-white/20 hover:text-white"
          >
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${runtimeReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              Playback
            </span>
            <span>{statusLabel}</span>
          </Link>

          <Link
            to={user ? '/dashboard' : '/login'}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white/62 hover:bg-white/8 hover:text-white"
          >
            <UserCircle className="h-4 w-4" />
            {user ? 'Account' : 'Sign in'}
          </Link>
          {isAdmin ? (
            <Link
              to="/admin"
              className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white/62 hover:bg-white/8 hover:text-white"
            >
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          ) : null}
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[220px]">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080a]/95 backdrop-blur">
          <div className="flex h-auto flex-col gap-3 px-4 py-3 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:px-5 lg:py-0">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="truncate text-lg font-black text-white">{title}</h1>
              <span className="hidden rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/45 lg:inline">
                Desktop
              </span>
            </div>

            <form onSubmit={submitBrowse} className="flex w-full max-w-2xl gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title or source..."
                  className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.045] pl-9 pr-3 text-sm font-medium text-white outline-none placeholder:text-white/30 focus:border-primary/70"
                />
              </div>
              <button
                type="submit"
                className="h-10 rounded-lg border border-white/10 bg-white/[0.06] px-4 text-sm font-bold text-white hover:bg-white/10"
              >
                Browse
              </button>
              <button
                type="button"
                onClick={submitSources}
                className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90"
              >
                Sources
              </button>
            </form>
          </div>

          <div className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-2 lg:hidden">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${
                  isActive ? 'bg-white text-black' : 'text-white/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </div>
        </header>

        <main className="min-w-0">
          <Outlet />
        </main>

        <div className="fixed bottom-4 right-4 z-30 hidden gap-2 lg:flex">
          <Link
            to="/nyaa?desktop=1"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#111217]/95 px-3 text-sm font-bold text-white shadow-lg shadow-black/25 backdrop-blur hover:border-primary/50"
          >
            <Download className="h-4 w-4 text-primary" />
            Sources
          </Link>
          <Link
            to="/local-player?desktop=1"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#111217]/95 px-3 text-sm font-bold text-white shadow-lg shadow-black/25 backdrop-blur hover:border-primary/50"
          >
            <Settings className="h-4 w-4 text-primary" />
            Player
          </Link>
        </div>
      </div>
    </div>
  );
}
