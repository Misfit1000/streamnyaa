import { FormEvent, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Clock,
  Compass,
  Download,
  Heart,
  Home,
  History,
  Library,
  ListMusic,
  Menu,
  MonitorPlay,
  Search,
  ShieldCheck,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/local-player?desktop=1', label: 'Player', icon: MonitorPlay },
  { to: '/search', label: 'Explore', icon: Compass },
  { to: '/schedule', label: 'Calendar', icon: CalendarDays },
  { to: '/my-list', label: 'My Library', icon: Library },
  { to: '/nyaa?desktop=1', label: 'Sources', icon: Download },
  { to: '/dashboard', label: 'History', icon: Clock },
];

const libraryItems = [
  { to: '/my-list', label: 'Favorites', icon: Heart },
  { to: '/dashboard', label: 'History', icon: History },
  { to: '/compare', label: 'Playlists', icon: ListMusic },
];

const quickItems = [
  { to: '/local-player?desktop=1', label: 'Player', icon: MonitorPlay },
  { to: '/schedule', label: 'Latest episodes', icon: CalendarDays },
  { to: '/search?sort=trending&status=airing', label: 'Trending', icon: Sparkles },
  { to: '/nyaa?desktop=1', label: 'Source browser', icon: Download },
  { to: '/my-list', label: 'Library', icon: Library },
];

function routeKey(pathname: string) {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/nyaa')) return 'sources';
  if (pathname.startsWith('/local-player')) return 'player';
  if (pathname.startsWith('/search')) return 'browse';
  if (pathname.startsWith('/schedule')) return 'schedule';
  if (pathname.startsWith('/my-list')) return 'library';
  if (pathname.startsWith('/compare')) return 'compare';
  if (pathname.startsWith('/desktop-settings')) return 'settings';
  if (pathname.startsWith('/dashboard')) return 'account';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/anime') || pathname.startsWith('/manga')) return 'anime';
  if (pathname.startsWith('/blog')) return 'blog';
  return 'default';
}

export default function DesktopShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [query, setQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const currentRouteKey = routeKey(location.pathname);

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

      <aside className={`desktop-cinema-sidebar fixed inset-y-0 left-0 z-40 hidden border-r border-white/10 bg-[#111114]/72 shadow-2xl shadow-black/50 backdrop-blur-2xl transition-[width] duration-300 lg:flex lg:flex-col ${sidebarCollapsed ? 'w-[86px]' : 'w-[236px]'}`}>
        <div className="px-8 pb-5 pt-4">
          <Link to="/" className="block">
            <span className={`block text-[24px] font-black leading-tight tracking-[-0.04em] text-white ${sidebarCollapsed ? 'sr-only' : ''}`}>StreamNyaa</span>
            <span className={`mt-2 block text-[15px] font-semibold uppercase tracking-[0.28em] text-white/52 ${sidebarCollapsed ? 'sr-only' : ''}`}>Desktop</span>
            <span className={`mt-1 block text-[15px] font-semibold uppercase tracking-[0.28em] text-white/52 ${sidebarCollapsed ? 'sr-only' : ''}`}>Cinema</span>
            <span className={`hidden h-11 w-11 items-center justify-center rounded-xl bg-primary text-white ${sidebarCollapsed ? 'flex' : ''}`}>
              <Home className="h-5 w-5" />
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-2">
          <div className="space-y-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `group flex h-11 items-center rounded-md text-[15px] font-medium transition-all ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} ${
                  isActive
                    ? 'bg-primary/20 text-white shadow-[inset_0_0_0_1px_rgba(244,63,94,0.28)]'
                    : 'text-white/68 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Icon className={`h-5 w-5 ${location.pathname === to.split('?')[0] || (to !== '/' && location.pathname.startsWith(to.split('?')[0])) ? 'text-primary' : 'text-white/58 group-hover:text-white'}`} />
                <span className={sidebarCollapsed ? 'sr-only' : ''}>{label}</span>
              </NavLink>
            ))}
          </div>

          <div className="mt-8">
            <p className={`mb-3 px-3 text-[12px] font-medium uppercase tracking-[0.14em] text-white/42 ${sidebarCollapsed ? 'sr-only' : ''}`}>Library</p>
            <div className="space-y-2">
              {libraryItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `group flex h-11 items-center rounded-md text-[15px] font-medium transition-all ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} ${
                    isActive ? 'bg-white/10 text-white' : 'text-white/68 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Icon className="h-5 w-5 text-white/58 group-hover:text-white" />
                  <span className={sidebarCollapsed ? 'sr-only' : ''}>{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </nav>

        <div className="border-t border-white/8 p-3">
          <Link
            to={user ? '/dashboard' : '/login'}
            className="flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-xs font-medium text-white/56 hover:bg-white/[0.055] hover:text-white"
          >
            <UserCircle className="h-4 w-4" />
            <span className={sidebarCollapsed ? 'sr-only' : ''}>{user ? 'Account' : 'Sign in'}</span>
          </Link>
          {isAdmin ? (
            <Link
              to="/admin"
              className="mt-2 flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-xs font-medium text-white/56 hover:bg-white/[0.055] hover:text-white"
            >
              <ShieldCheck className="h-4 w-4" />
              <span className={sidebarCollapsed ? 'sr-only' : ''}>Admin</span>
            </Link>
          ) : null}
        </div>
      </aside>

      <div className={`relative min-h-screen transition-[padding-left] duration-300 ${sidebarCollapsed ? 'lg:pl-[86px]' : 'lg:pl-[236px]'}`}>
        <header className="sticky top-0 z-30 bg-[#101014]/78 backdrop-blur-2xl">
          <div className="flex h-[70px] items-center gap-4 px-6">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              className="hidden h-11 w-11 items-center justify-center rounded-md border border-white/9 bg-white/[0.045] text-white/75 hover:bg-white/[0.07] lg:flex"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Menu className="h-6 w-6" />
            </button>

            <form onSubmit={submitBrowse} className="relative w-full max-w-[520px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/50" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search anime..."
                className="h-11 w-full rounded-md border border-white/9 bg-white/[0.035] pl-12 pr-16 text-[15px] font-normal text-white outline-none placeholder:text-white/50 focus:border-primary/55 focus:bg-white/[0.055]"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded bg-white/[0.06] px-2 py-1 text-[12px] font-medium text-white/44">Ctrl K</span>
            </form>

            <button
              type="button"
              onClick={submitSources}
              className="hidden h-11 rounded-md border border-white/9 bg-white/[0.045] px-4 text-sm font-medium text-white/72 hover:bg-white/[0.07] xl:inline-flex xl:items-center"
            >
              Find source
            </button>

            <div className="ml-auto flex items-center gap-5">
              <button className="relative text-white/72 hover:text-white" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />
              </button>
              <Link to={user ? '/dashboard' : '/login'} className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-white/12 bg-[linear-gradient(135deg,#233,#6366f1)]">
                  <UserCircle className="h-6 w-6 text-white/86" />
                </span>
                <ChevronDown className="h-4 w-4 text-white/58" />
              </Link>
            </div>
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

          {location.pathname !== '/' ? (
            <div className="hidden gap-2 overflow-x-auto border-t border-white/10 px-7 py-2 lg:flex">
              {quickItems.map(({ to, label, icon: Icon }) => (
                <Link
                  key={label}
                  to={to}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[11px] font-black text-white/55 hover:border-primary/40 hover:bg-primary/10 hover:text-white"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {label}
                </Link>
              ))}
            </div>
          ) : null}
        </header>

        <main className={`desktop-route-main desktop-page-${currentRouteKey} min-w-0 pb-10`}>
          <div className="desktop-outlet-wrap">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
