import { memo, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, CalendarDays, Compass, Download, Heart, History, Home, Keyboard, Library, Menu, Search, Settings, UserCircle, X } from 'lucide-react';
import desktopLogo from '../assets/desktop-logo.png';
import { useAuth } from '../context/AuthContext';

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

const desktopShortcuts = [
  ['Ctrl K', 'Open search'],
  ['?', 'Show this shortcut guide'],
  ['Esc', 'Close panels or overlays'],
  ['Space', 'Play or pause in the player'],
  ['[ / ]', 'Previous or next episode in the player'],
  ['← / →', 'Seek backward or forward in the player'],
  ['↑ / ↓', 'Adjust player volume'],
  ['F', 'Toggle fullscreen in the player'],
  ['C', 'Toggle subtitles in the player'],
];

export function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function ShortcutHelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/68 p-5 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="sn-glass-panel w-full max-w-2xl overflow-hidden rounded-[2rem] shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/16 text-primary">
              <Keyboard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Shortcuts</p>
              <h2 className="text-xl font-black tracking-[-0.03em] text-white">Desktop controls</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="sn-icon-action h-10 w-10 rounded-full" aria-label="Close shortcuts">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-2 p-5 sm:grid-cols-2">
          {desktopShortcuts.map(([keys, label]) => (
            <div key={keys} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.045] px-4 py-3">
              <span className="text-sm font-bold text-white/70">{label}</span>
              <kbd className="shrink-0 rounded-lg bg-black/42 px-2.5 py-1 text-xs font-black text-white/72 shadow-inner shadow-white/[0.04]">{keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
        'group relative flex h-11 items-center overflow-hidden rounded-xl text-[15px] font-semibold transition-all duration-200',
        collapsed ? 'justify-center px-0' : 'gap-3 px-4',
        isActive
          ? 'bg-[linear-gradient(135deg,rgba(255,63,95,0.36),rgba(255,63,95,0.16))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_18px_42px_rgba(255,47,79,0.18)]'
          : 'text-white/58 hover:bg-white/[0.060] hover:text-white',
      ].join(' ')}
    >
      {({ isActive }) => (
        <>
          <span
            className={`absolute left-0 top-2 h-7 w-1 rounded-r-full bg-primary shadow-[0_0_18px_rgba(244,63,94,0.65)] transition-opacity duration-200 ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden="true"
          />
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition duration-200 ${
              isActive ? 'bg-primary/16 text-white' : 'text-white/58 group-hover:text-white'
            }`}
          >
            <Icon className="h-[19px] w-[19px]" />
          </span>
          {!collapsed ? <span className="truncate">{label}</span> : null}
        </>
      )}
    </NavLink>
  );
});

export default function DesktopShell() {
  const location = useLocation();
  const { user } = useAuth();
  const isWatch = location.pathname.startsWith('/watch/');
  const [logoFailed, setLogoFailed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (event.key === 'Escape') {
        setShortcutsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isWatch) {
    return (
      <div className="custom-scrollbar h-screen overflow-y-auto overflow-x-hidden bg-[#0A0A0C] text-white">
        <Outlet />
        {shortcutsOpen ? <ShortcutHelpOverlay onClose={() => setShortcutsOpen(false)} /> : null}
      </div>
    );
  }

  return (
    <div className="desktop-app-shell min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_62%_10%,rgba(244,63,94,0.14),transparent_28%),radial-gradient(circle_at_18%_0%,rgba(99,102,241,0.10),transparent_26%)]" />
      <div className={`relative grid min-h-screen w-screen overflow-hidden bg-black/20 shadow-2xl shadow-black/40 transition-[grid-template-columns] duration-300 ${sidebarCollapsed ? 'grid-cols-[86px_minmax(0,1fr)]' : 'grid-cols-[258px_minmax(0,1fr)]'}`}>
        <aside className={`sn-sidebar-panel flex h-screen flex-col py-6 transition-[padding] duration-300 ${sidebarCollapsed ? 'px-3' : 'px-5'}`}>
          <Link to="/" className={`flex h-[58px] items-center ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-1'}`}>
            {logoFailed ? (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[18px] bg-primary text-[21px] font-black text-white">S</span>
            ) : (
              <img
                src={desktopLogo}
                alt="StreamNyaa"
                className="h-11 w-11 shrink-0 rounded-[18px] object-contain drop-shadow-[0_10px_24px_rgba(244,63,94,0.18)]"
                loading="eager"
                decoding="async"
                onError={() => setLogoFailed(true)}
              />
            )}
            {!sidebarCollapsed ? <span className="flex min-w-0 flex-col justify-center">
              <span className="block text-[23px] font-black leading-none tracking-[-0.052em] text-white">
                Stream<span className="text-primary">Nyaa</span>
              </span>
              <span className="mt-1.5 block text-[11px] font-bold uppercase leading-[1.1] tracking-[0.32em] text-white/42">Desktop Cinema</span>
            </span> : null}
          </Link>

          <nav className="mt-7 space-y-2">
            {desktopNav.map((item) => <DesktopNavItem key={item.to} {...item} collapsed={sidebarCollapsed} />)}
          </nav>

          <div className="mt-7 border-t border-white/[0.06] pt-5">
            {!sidebarCollapsed ? <p className="mb-3 px-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/38">Library</p> : null}
            <nav className="space-y-2">
              {desktopLibrary.map((item) => <DesktopNavItem key={`${item.to}-${item.label}`} {...item} collapsed={sidebarCollapsed} />)}
            </nav>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sn-topbar sticky top-0 z-30 flex h-[70px] items-center gap-4 px-6">
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
              className="sn-icon-action h-11 w-11"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/search" className="sn-input flex h-11 min-w-[340px] max-w-[600px] flex-1 items-center gap-3 px-4 text-sm text-white/48 transition-all hover:text-white/74 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
              <Search className="h-5 w-5" />
              <span>Search anime, episodes, sources...</span>
              <kbd className="ml-auto rounded-md bg-white/8 px-2 py-1 text-[11px] font-bold text-white/42">Ctrl K</kbd>
            </Link>
            <div className="ml-auto flex items-center gap-3">
              <button type="button" className="sn-icon-action relative h-10 w-10 rounded-full">
                <Bell className="h-5 w-5" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_rgba(244,63,94,0.14)]" />
              </button>
              <Link
                to={user ? '/profile' : '/login?next=/profile'}
                title={user ? 'Profile' : 'Sign in'}
                className="sn-icon-action relative h-10 w-10 rounded-full"
              >
                <UserCircle className="h-6 w-6" />
                <span
                  className={`absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#101014] ${
                    user ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.65)]' : 'bg-primary shadow-[0_0_12px_rgba(244,63,94,0.65)]'
                  }`}
                  aria-hidden="true"
                />
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
      {shortcutsOpen ? <ShortcutHelpOverlay onClose={() => setShortcutsOpen(false)} /> : null}
    </div>
  );
}
