import { memo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, CalendarDays, Compass, Download, Heart, History, Home, Library, Menu, Search, Settings, UserCircle } from 'lucide-react';
import desktopLogo from '../assets/desktop-logo.png';

const desktopNav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/search', label: 'Explore', icon: Compass },
  { to: '/schedule', label: 'Calendar', icon: CalendarDays },
  { to: '/nyaa', label: 'Sources', icon: Download },
  { to: '/my-list', label: 'Library', icon: Library },
];

const desktopLibrary = [
  { to: '/my-list', label: 'Favorites', icon: Heart },
  { to: '/dashboard', label: 'History', icon: History },
  { to: '/desktop-settings', label: 'Settings', icon: Settings },
];

const SIDEBAR_STORAGE_KEY = 'streamnyaa.desktop.sidebarCollapsed';

const DesktopNavItem = memo(function DesktopNavItem({
  to,
  label,
  icon: Icon,
  collapsed,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={collapsed ? label : undefined}
      className={({ isActive }) => [
        'group flex h-11 items-center rounded-lg text-[15px] font-medium transition-all duration-200',
        collapsed ? 'justify-center px-0' : 'gap-3 px-4',
        isActive
          ? 'bg-primary/18 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_12px_30px_rgba(244,63,94,0.10)]'
          : 'text-white/62 hover:bg-white/[0.06] hover:text-white',
      ].join(' ')}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed ? <span>{label}</span> : null}
    </NavLink>
  );
});

export default function DesktopShell() {
  const location = useLocation();
  const isWatch = location.pathname.startsWith('/watch/');
  const [logoFailed, setLogoFailed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (isWatch) {
    return (
      <div className="custom-scrollbar h-screen overflow-y-auto overflow-x-hidden bg-[#0A0A0C] text-white">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="desktop-app-shell min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_62%_10%,rgba(244,63,94,0.14),transparent_28%),radial-gradient(circle_at_18%_0%,rgba(99,102,241,0.10),transparent_26%)]" />
      <div className={`relative grid min-h-screen w-screen overflow-hidden bg-black/20 shadow-2xl shadow-black/40 ${sidebarCollapsed ? 'grid-cols-[88px_minmax(0,1fr)]' : 'grid-cols-[250px_minmax(0,1fr)]'}`}>
        <aside className={`desktop-glass-panel border-r py-5 ${sidebarCollapsed ? 'px-3' : 'px-5'}`}>
          <Link to="/" className={`flex items-center ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'}`}>
            {logoFailed ? (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-[22px] font-black text-white">S</span>
            ) : (
              <img
                src={desktopLogo}
                alt="StreamNyaa"
                className="h-11 w-11 shrink-0 rounded-xl object-contain"
                loading="eager"
                decoding="async"
                onError={() => setLogoFailed(true)}
              />
            )}
            {!sidebarCollapsed ? <span className="min-w-0">
              <span className="block text-[23px] font-black tracking-[-0.04em] text-white">StreamNyaa</span>
              <span className="mt-1 block text-[12px] font-semibold uppercase tracking-[0.34em] text-white/48">Desktop Cinema</span>
            </span> : null}
          </Link>

          <nav className="mt-8 space-y-2">
            {desktopNav.map((item) => <DesktopNavItem key={item.to} {...item} collapsed={sidebarCollapsed} />)}
          </nav>

          <div className="mt-8 border-t border-white/[0.06] pt-5">
            {!sidebarCollapsed ? <p className="mb-3 px-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/38">Library</p> : null}
            <nav className="space-y-2">
              {desktopLibrary.map((item) => <DesktopNavItem key={`${item.to}-${item.label}`} {...item} collapsed={sidebarCollapsed} />)}
            </nav>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="desktop-glass-panel sticky top-0 z-30 flex h-[70px] items-center gap-4 border-b px-6">
            <button
              type="button"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => {
                setSidebarCollapsed((value) => {
                  const next = !value;
                  try {
                    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
                  } catch {
                    // Best-effort only.
                  }
                  return next;
                });
              }}
              className="grid h-11 w-11 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.04] text-white/80 transition-colors hover:border-white/14 hover:bg-white/[0.07] hover:text-white"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/search" className="flex h-11 min-w-[360px] max-w-[520px] flex-1 items-center gap-3 rounded-lg border border-white/[0.06] bg-black/24 px-4 text-sm text-white/48 transition-colors hover:border-white/14 hover:bg-white/[0.045] hover:text-white/72">
              <Search className="h-5 w-5" />
              <span>Search anime...</span>
              <kbd className="ml-auto rounded bg-white/8 px-2 py-1 text-[11px] text-white/42">Ctrl K</kbd>
            </Link>
            <div className="ml-auto flex items-center gap-3">
              <button type="button" className="relative grid h-10 w-10 place-items-center rounded-full border border-white/[0.06] bg-white/[0.04] text-white/72 transition-colors hover:bg-white/[0.07] hover:text-white">
                <Bell className="h-5 w-5" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
              </button>
              <Link to="/dashboard" className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.055] text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white">
                <UserCircle className="h-6 w-6" />
              </Link>
            </div>
          </header>
          <main className="custom-scrollbar h-[calc(100vh-70px)] overflow-y-auto">
            <div key={location.pathname} className="desktop-route-transition">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
