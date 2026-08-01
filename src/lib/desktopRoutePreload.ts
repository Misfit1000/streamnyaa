import type { ComponentType } from 'react';

type PageModule = { default: ComponentType };
type DesktopRouteKey =
  | 'home'
  | 'watch'
  | 'explore'
  | 'schedule'
  | 'sources'
  | 'library'
  | 'animeLanding'
  | 'mangaDetails'
  | 'downloads'
  | 'compare'
  | 'settings'
  | 'history'
  | 'profile'
  | 'login';

const rawLoaders: Record<DesktopRouteKey, () => Promise<PageModule>> = {
  home: () => import('../pages/DesktopHome'),
  watch: () => import('../pages/DesktopWatch'),
  explore: () => import('../pages/DesktopExplore'),
  schedule: () => import('../pages/DesktopSchedule'),
  sources: () => import('../pages/DesktopSources'),
  library: () => import('../pages/DesktopLibrary'),
  animeLanding: () => import('../pages/AnimeLanding'),
  mangaDetails: () => import('../pages/MangaDetails'),
  downloads: () => import('../pages/AnimeDownloads'),
  compare: () => import('../pages/AnimeCompare'),
  settings: () => import('../pages/DesktopSettings'),
  history: () => import('../pages/DesktopHistory'),
  profile: () => import('../pages/DesktopProfile'),
  login: () => import('../pages/Login'),
};

const modulePromises = new Map<DesktopRouteKey, Promise<PageModule>>();

function loadDesktopPage(key: DesktopRouteKey) {
  const existing = modulePromises.get(key);
  if (existing) return existing;
  const promise = rawLoaders[key]().catch((error) => {
    modulePromises.delete(key);
    throw error;
  });
  modulePromises.set(key, promise);
  return promise;
}

export const desktopPageLoaders = Object.fromEntries(
  (Object.keys(rawLoaders) as DesktopRouteKey[]).map((key) => [key, () => loadDesktopPage(key)]),
) as Record<DesktopRouteKey, () => Promise<PageModule>>;

function routeKeyForPath(pathname: string): DesktopRouteKey | null {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/watch/')) return 'watch';
  if (pathname === '/search') return 'explore';
  if (pathname === '/schedule') return 'schedule';
  if (pathname === '/nyaa') return 'sources';
  if (pathname === '/my-list') return 'library';
  if (pathname === '/dashboard') return 'history';
  if (pathname === '/desktop-settings') return 'settings';
  if (pathname === '/compare') return 'compare';
  if (pathname === '/profile') return 'profile';
  if (pathname === '/login' || pathname === '/reset-password') return 'login';
  if (/^\/anime\/[^/]+\/downloads(?:\/|$)/.test(pathname)) return 'downloads';
  if (/^\/anime\/(popular|genre\/|season\/)/.test(pathname) || pathname.startsWith('/season/')) return 'animeLanding';
  if (pathname.startsWith('/anime/')) return 'watch';
  if (pathname.startsWith('/manga/')) return 'mangaDetails';
  return null;
}

export function preloadDesktopRoute(pathname: string) {
  const key = routeKeyForPath(pathname);
  if (!key) return Promise.resolve();
  return loadDesktopPage(key).then(() => undefined).catch(() => undefined);
}

const CORE_ROUTE_KEYS: DesktopRouteKey[] = ['explore', 'schedule', 'sources', 'library', 'history', 'settings'];
const MAX_CONCURRENT_WARMS = 2;
let coreWarmStarted = false;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function warmCoreDesktopRoutes() {
  if (typeof window === 'undefined' || coreWarmStarted) return () => {};
  coreWarmStarted = true;
  let cancelled = false;
  let importsStarted = false;

  const start = () => {
    if (cancelled) return;
    importsStarted = true;
    const queue = [...CORE_ROUTE_KEYS];
    let active = 0;
    const runNext = () => {
      if (cancelled) return;
      while (active < MAX_CONCURRENT_WARMS && queue.length) {
        const key = queue.shift()!;
        active += 1;
        void loadDesktopPage(key).catch(() => undefined).finally(() => {
          active -= 1;
          runNext();
        });
      }
    };
    runNext();
  };

  const idleWindow = window as IdleWindow;
  const idleHandle = idleWindow.requestIdleCallback?.(start, { timeout: 1800 });
  const timeoutHandle = idleHandle === undefined ? window.setTimeout(start, 350) : undefined;

  return () => {
    cancelled = true;
    if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
    if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
    if (!importsStarted) coreWarmStarted = false;
  };
}
