import { memo, Suspense, useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, CalendarDays, Compass, Download, Heart, History, Home, Keyboard, Library, Menu, Search, Settings, UserCircle, X } from 'lucide-react';
import desktopLogo from '../assets/desktop-logo.png';
import { useAuth } from '../context/AuthContext';
import {
  listenDesktopPlayerAutoNextChanged,
  listenDesktopPlayerReady,
  listenDesktopPlayerSettingChanged,
  loadDesktopPlayerPreferences,
  saveDesktopAutoPlayNextEpisode,
  saveDesktopPlayerSetting,
  syncDesktopPlayerPreferencesToPlayer,
} from '../lib/desktop';
import {
  DESKTOP_REMINDER_POLL_MS,
  deliverDueDesktopReminders,
  readDesktopScheduleReminders,
  subscribeDesktopScheduleReminders,
} from '../lib/desktopReminders';
import { preloadDesktopRoute, preloadDesktopWatchData, warmCoreDesktopRoutes } from '../lib/desktopRoutePreload';

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
const HOVER_PRELOAD_DELAY_MS = 80;
const HOVER_SOURCE_PRELOAD_DELAY_MS = 360;

const desktopShortcuts = [
  ['Ctrl K', 'Open search'],
  ['?', 'Show this shortcut guide'],
  ['Esc', 'Exit fullscreen or close player panels'],
  ['Space / K', 'Play or pause in the player'],
  ['← / →', 'Seek 5 seconds backward or forward'],
  ['J / L', 'Seek 10 seconds backward or forward'],
  ['↑ / ↓', 'Adjust player volume'],
  ['F', 'Toggle fullscreen in the player'],
  ['M', 'Mute or unmute the player'],
  ['C', 'Toggle subtitles in the player'],
  ['[ / ]', 'Decrease or increase playback speed'],
  ['0–9', 'Jump to a percentage of the episode'],
  ['Shift N', 'Play the next episode'],
];

function DesktopOutletFallback() {
  return (
    <div className="px-6 py-5" role="status" aria-label="Opening page">
      <div className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/80" />
      </div>
    </div>
  );
}

function internalLinkedRoute(target: EventTarget | null) {
  const anchor = (target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]');
  if (!anchor) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  return url;
}

function preloadLinkedRoute(target: EventTarget | null, includeWatchSources = false) {
  const url = internalLinkedRoute(target);
  if (!url) return;
  void preloadDesktopRoute(url.pathname);
  if (/^\/(?:watch|anime)\//.test(url.pathname)) {
    void preloadDesktopWatchData(`${url.pathname}${url.search}`, includeWatchSources);
  }
}

export function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function ShortcutHelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/82 p-5" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="sn-glass-panel w-full max-w-2xl overflow-hidden rounded-xl border border-white/[0.08] shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/16 text-primary">
              <Keyboard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-primary">Keyboard shortcuts</p>
              <h2 className="text-xl font-semibold text-white">Universal player controls</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="sn-icon-action h-10 w-10 rounded-full" aria-label="Close shortcuts">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-2 p-5 sm:grid-cols-2">
          {desktopShortcuts.map(([keys, label]) => (
            <div key={keys} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.045] px-4 py-3">
              <span className="text-sm font-semibold text-white/70">{label}</span>
              <kbd className="shrink-0 rounded-md bg-black/42 px-2.5 py-1 text-xs font-semibold text-white/72">{keys}</kbd>
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
      onMouseEnter={() => void preloadDesktopRoute(to)}
      onFocus={() => void preloadDesktopRoute(to)}
      onPointerDown={() => void preloadDesktopRoute(to)}
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
  const hoverPreloadTimer = useRef<number | undefined>(undefined);
  const hoverSourcePreloadTimer = useRef<number | undefined>(undefined);
  const hoverPreloadHref = useRef('');
  const contentRef = useRef<HTMLElement>(null);
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

  useEffect(() => warmCoreDesktopRoutes(), []);

  useEffect(() => {
    if (isWatch || typeof window === 'undefined') return;
    const connection = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (connection.connection?.saveData) return;
    let cancelled = false;
    const prepareVisibleLinks = () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      const links = [...(contentRef.current?.querySelectorAll<HTMLAnchorElement>('a[href]') || [])]
        .filter((link) => {
          const url = new URL(link.href, window.location.href);
          if (!/^\/(?:watch|anime)\//.test(url.pathname)) return false;
          const rect = link.getBoundingClientRect();
          return rect.bottom > 70 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
        })
        .slice(0, 6);
      let cursor = 0;
      const worker = async () => {
        while (!cancelled && cursor < links.length) {
          const link = links[cursor++];
          const url = new URL(link.href, window.location.href);
          await preloadDesktopWatchData(`${url.pathname}${url.search}`, false);
        }
      };
      void Promise.all([worker(), worker()]);
    };
    const timer = window.setTimeout(prepareVisibleLinks, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isWatch, location.key, location.pathname, location.search]);

  useEffect(() => () => {
    if (hoverPreloadTimer.current !== undefined) window.clearTimeout(hoverPreloadTimer.current);
    if (hoverSourcePreloadTimer.current !== undefined) window.clearTimeout(hoverSourcePreloadTimer.current);
  }, []);

  const scheduleLinkedRoutePreload = (target: EventTarget | null) => {
    const url = internalLinkedRoute(target);
    if (!url || hoverPreloadHref.current === url.href) return;
    hoverPreloadHref.current = url.href;
    if (hoverPreloadTimer.current !== undefined) window.clearTimeout(hoverPreloadTimer.current);
    if (hoverSourcePreloadTimer.current !== undefined) window.clearTimeout(hoverSourcePreloadTimer.current);
    hoverPreloadTimer.current = window.setTimeout(() => {
      hoverPreloadTimer.current = undefined;
      void preloadDesktopRoute(url.pathname);
      if (/^\/(?:watch|anime)\//.test(url.pathname)) {
        void preloadDesktopWatchData(`${url.pathname}${url.search}`, false);
      }
    }, HOVER_PRELOAD_DELAY_MS);
    if (/^\/(?:watch|anime)\//.test(url.pathname)) {
      hoverSourcePreloadTimer.current = window.setTimeout(() => {
        hoverSourcePreloadTimer.current = undefined;
        if (hoverPreloadHref.current === url.href) {
          void preloadDesktopWatchData(`${url.pathname}${url.search}`, true);
        }
      }, HOVER_SOURCE_PRELOAD_DELAY_MS);
    }
  };

  const preloadLinkedRouteNow = (target: EventTarget | null, includeWatchSources = false) => {
    if (hoverPreloadTimer.current !== undefined) {
      window.clearTimeout(hoverPreloadTimer.current);
      hoverPreloadTimer.current = undefined;
    }
    if (hoverSourcePreloadTimer.current !== undefined) {
      window.clearTimeout(hoverSourcePreloadTimer.current);
      hoverSourcePreloadTimer.current = undefined;
    }
    hoverPreloadHref.current = '';
    preloadLinkedRoute(target, includeWatchSources);
  };

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const register = async () => {
      const settingCleanup = await listenDesktopPlayerSettingChanged((event) => {
        if (cancelled || !event.key) return;
        saveDesktopPlayerSetting(event.key, event.value ?? '');
      });
      if (cancelled) settingCleanup(); else cleanups.push(settingCleanup);

      const autoNextCleanup = await listenDesktopPlayerAutoNextChanged((event) => {
        if (cancelled) return;
        saveDesktopAutoPlayNextEpisode(Boolean(event.enabled));
      });
      if (cancelled) autoNextCleanup(); else cleanups.push(autoNextCleanup);

      const readyCleanup = await listenDesktopPlayerReady(() => {
        if (cancelled) return;
        void syncDesktopPlayerPreferencesToPlayer(loadDesktopPlayerPreferences());
      });
      if (cancelled) readyCleanup(); else cleanups.push(readyCleanup);
    };

    void register();
    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    let running = false;
    let cancelled = false;
    let timer: number | undefined;

    const scheduleNextCheck = () => {
      if (cancelled) return;
      if (timer !== undefined) window.clearTimeout(timer);
      const now = Date.now();
      const pending = readDesktopScheduleReminders().filter((reminder) => !reminder.firedAt);
      if (!pending.length) {
        timer = undefined;
        return;
      }
      const nextTrigger = Math.min(...pending.map(
        (reminder) => reminder.airingAt - reminder.reminderOffsetMinutes * 60 * 1000,
      ));
      const delay = Math.min(
        DESKTOP_REMINDER_POLL_MS,
        Math.max(15_000, nextTrigger - now),
      );
      timer = window.setTimeout(() => void checkReminders(), delay);
    };

    const checkReminders = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        await deliverDueDesktopReminders();
      } finally {
        running = false;
        scheduleNextCheck();
      }
    };
    const handleFocus = () => void checkReminders();
    void checkReminders();
    const unsubscribe = subscribeDesktopScheduleReminders(() => void checkReminders());
    window.addEventListener('focus', handleFocus);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  if (isWatch) {
    return (
      <div className="desktop-app-shell custom-scrollbar h-screen overflow-y-auto overflow-x-hidden text-white">
        <Suspense fallback={<DesktopOutletFallback />}>
          <Outlet />
        </Suspense>
        {shortcutsOpen ? <ShortcutHelpOverlay onClose={() => setShortcutsOpen(false)} /> : null}
      </div>
    );
  }

  return (
    <div className="desktop-app-shell min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_66%_6%,rgba(139,8,30,0.16),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.018),transparent_36%)]" />
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
              <Link to="/schedule" title="Airing reminders" className="sn-icon-action relative h-10 w-10 rounded-full">
                <Bell className="h-5 w-5" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_rgba(244,63,94,0.14)]" />
              </Link>
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
          <main
            ref={contentRef}
            className="custom-scrollbar h-[calc(100vh-70px)] overflow-y-auto"
            onPointerOverCapture={(event: PointerEvent<HTMLElement>) => scheduleLinkedRoutePreload(event.target)}
            onPointerDownCapture={(event: PointerEvent<HTMLElement>) => preloadLinkedRouteNow(event.target, true)}
            onFocusCapture={(event: FocusEvent<HTMLElement>) => preloadLinkedRouteNow(event.target)}
          >
            <div className="desktop-route-transition">
              <Suspense fallback={<DesktopOutletFallback />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
      {shortcutsOpen ? <ShortcutHelpOverlay onClose={() => setShortcutsOpen(false)} /> : null}
    </div>
  );
}
