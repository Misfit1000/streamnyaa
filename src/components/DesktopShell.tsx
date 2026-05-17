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
  Sparkles,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getDesktopRuntimeStatus, loadDesktopPlaybackSettings, type DesktopRuntimeStatus } from '../lib/desktop';

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/nyaa?desktop=1', label: 'Sources', icon: Download },
  { to: '/local-player?desktop=1', label: 'Player', icon: MonitorPlay },
  { to: '/search', label: 'Browse', icon: Search },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/my-list', label: 'Library', icon: Library },
  { to: '/compare', label: 'Compare', icon: BarChart3 },
  { to: '/desktop-settings', label: 'Settings', icon: Settings },
];

function pageTitle(pathname: string) {
  if (pathname === '/') return 'Home';
  if (pathname.startsWith('/nyaa')) return 'Sources';
  if (pathname.startsWith('/local-player')) return 'Player';
  if (pathname.startsWith('/search')) return 'Browse';
  if (pathname.startsWith('/schedule')) return 'Schedule';
  if (pathname.startsWith('/my-list')) return 'Library';
  if (pathname.startsWith('/compare')) return 'Compare';
  if (pathname.startsWith('/desktop-settings')) return 'Settings';
  if (pathname.startsWith('/dashboard')) return 'Account';
  if (pathname.startsWith('/admin')) return 'Admin';
  return 'StreamNyaa';
}

function runtimeText(runtime: DesktopRuntimeStatus | null) {
  if (!runtime) return 'Checking';
  if (runtime.ready) return 'Local playback ready';
  if (!runtime.torrent_engine_configured) return 'Playback setup needed';
  if (!runtime.player_configured) return 'Player setup needed';
  return 'Setup needed';
}

function friendlyRuntimeMessage(message = '') {
  return message
    .replace(/rqbit/gi, 'the local engine')
    .replace(/MPV/gi, 'the local player')
    .replace(/command or full executable path/gi, 'setup path')
    .replace(/commands are configured/gi, 'is ready');
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
    <div className="desktop-shell min-h-screen overflow-hidden bg-[#030305] text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.20),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_32%)]" />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] border-r border-white/10 bg-black/50 shadow-2xl shadow-black/40 backdrop-blur-2xl lg:flex lg:flex-col">
        <Link to="/" className="group flex h-20 items-center gap-3 px-5">
          <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
            <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.45),transparent_45%)]" />
            <HardDrive className="relative h-5 w-5" />
          </span>
          <span>
            <span className="block text-lg font-black tracking-tight text-white">StreamNyaa</span>
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">Desktop</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold transition-all ${
                isActive
                  ? 'bg-white text-black shadow-lg shadow-black/25'
                  : 'text-white/58 hover:bg-white/[0.075] hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-4">
          <Link
            to="/local-player?desktop=1"
            className="block rounded-3xl border border-white/10 bg-white/[0.055] p-4 transition-colors hover:border-primary/45 hover:bg-primary/10"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/42">
                <span className={`h-2.5 w-2.5 rounded-full ${runtimeReady ? 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]' : 'bg-amber-400'}`} />
                Playback
              </span>
              <MonitorPlay className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 text-sm font-black text-white">{statusLabel}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/42">
              {friendlyRuntimeMessage(runtime?.message || 'Checking local playback.')}
            </p>
          </Link>

          <div className="grid grid-cols-2 gap-2">
            <Link
              to={user ? '/dashboard' : '/login'}
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5 text-xs font-black text-white/70 hover:border-primary/35 hover:text-white"
            >
              <UserCircle className="h-4 w-4" />
              {user ? 'Account' : 'Sign in'}
            </Link>
            {isAdmin ? (
              <Link
                to="/admin"
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5 text-xs font-black text-white/70 hover:border-primary/35 hover:text-white"
              >
                <ShieldCheck className="h-4 w-4" />
                Admin
              </Link>
            ) : (
              <Link
                to="/desktop-settings"
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5 text-xs font-black text-white/70 hover:border-primary/35 hover:text-white"
              >
                <Settings className="h-4 w-4" />
                Setup
              </Link>
            )}
          </div>
        </div>
      </aside>

      <div className="relative min-h-screen lg:pl-[252px]">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#050507]/72 backdrop-blur-2xl">
          <div className="flex h-auto flex-col gap-3 px-4 py-3 lg:h-20 lg:flex-row lg:items-center lg:justify-between lg:px-7 lg:py-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] text-primary lg:flex">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h1 className="truncate text-xl font-black text-white">{title}</h1>
                <p className="hidden text-xs font-semibold text-white/38 lg:block">Local-first anime source discovery and playback</p>
              </div>
            </div>

            <form onSubmit={submitBrowse} className="flex w-full max-w-3xl gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search anime, episode, source..."
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.065] pl-11 pr-3 text-sm font-semibold text-white outline-none placeholder:text-white/32 focus:border-primary/70 focus:bg-white/[0.09]"
                />
              </div>
              <button
                type="submit"
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.07] px-5 text-sm font-black text-white hover:bg-white/12"
              >
                Browse
              </button>
              <button
                type="button"
                onClick={submitSources}
                className="h-12 rounded-2xl bg-primary px-5 text-sm font-black text-white shadow-lg shadow-primary/20 hover:bg-primary/90"
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
                className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${
                  isActive ? 'bg-white text-black' : 'text-white/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </div>
        </header>

        <main className="min-w-0 pb-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
