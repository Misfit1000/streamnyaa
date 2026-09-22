import type { ComponentType } from 'react';
import { desktopAnimeQueryKey } from './desktopRequests';
import { fetchAnimeDetails, fetchAnimeEpisodeWindow } from '../api/jikan';
import { searchNyaa } from '../api/nyaa';
import { desktopQueryClient } from './desktopQueryClient';

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
  animeLanding: () => import('../pages/DesktopAnimeLanding'),
  mangaDetails: () => import('../pages/MangaDetails'),
  downloads: () => import('../pages/DesktopAnimeDownloads'),
  compare: () => import('../pages/DesktopAnimeCompare'),
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

const watchDataPreloads = new Map<string, Promise<void>>();

export function preloadDesktopWatchData(pathWithSearch: string, includeSources = false) {
  if (typeof window === 'undefined') return Promise.resolve();
  const url = new URL(pathWithSearch, window.location.origin);
  const match = url.pathname.match(/^\/(?:watch|anime)\/([^/]+)/);
  if (!match) return Promise.resolve();
  const routeId = decodeURIComponent(match[1]);
  const episode = Math.max(1, Number(url.searchParams.get('ep') || 1));
  const preloadKey = `${routeId}|${episode}|${includeSources ? 'sources' : 'metadata'}`;
  const existing = watchDataPreloads.get(preloadKey);
  if (existing) return existing;

  const anilistId = url.searchParams.get('anilistId') || url.searchParams.get('aid') || '';
  const malIdHint = url.searchParams.get('malId') || url.searchParams.get('mid') || '';
  const detailsKey = desktopAnimeQueryKey(routeId, anilistId, malIdHint);
  const preload = desktopQueryClient.fetchQuery({
    queryKey: detailsKey,
    queryFn: ({ signal }) => fetchAnimeDetails(routeId, {
      signal, priority: includeSources ? 'foreground' : 'prefetch',
      anilistId: anilistId || undefined,
      malId: malIdHint || undefined,
      routeTitle: routeId.replace(/^\d+-?/, '').replace(/-/g, ' '),
    }),
    staleTime: 1000 * 60 * 15,
  }).then(async ({ data }) => {
    const malId = data?.mal_id ? String(data.mal_id) : undefined;
    const title = String(data?.title_english || data?.title_romaji || data?.title || '').trim();
    const tasks: Promise<unknown>[] = [];
    if (malId) {
      const page = Math.max(1, Math.ceil(episode / 100));
      tasks.push(desktopQueryClient.prefetchQuery({
        queryKey: ['episodes', malId, page, 3],
        queryFn: ({ signal }) => fetchAnimeEpisodeWindow(malId, page, { signal, priority: 'prefetch' }),
        staleTime: 1000 * 60 * 10,
      }));
    }
    if (includeSources && title) {
      tasks.push(searchNyaa(`${title} ${String(episode).padStart(2, '0')}`, '1_2', '0', '1', {
        deep: false,
        pages: 1,
        wide: false,
        priority: 'prefetch',
      }));
    }
    await Promise.allSettled(tasks);
  }).then(() => undefined).catch(() => undefined).finally(() => {
    window.setTimeout(() => watchDataPreloads.delete(preloadKey), 30_000);
  });
  watchDataPreloads.set(preloadKey, preload);
  return preload;
}

// Playback/source chunks are loaded on intent; do not compete with initial Home data.
const CORE_ROUTE_KEYS: DesktopRouteKey[] = ['explore', 'schedule'];
const MAX_CONCURRENT_WARMS = 2;
let coreWarmStarted = false;
let playbackWorkloadBusy = false;

if (typeof window !== 'undefined') {
  window.addEventListener('streamnyaa:playback-workload', ((event: CustomEvent<{ busy?: boolean }>) => {
    playbackWorkloadBusy = event.detail?.busy === true;
  }) as EventListener);
}

function backgroundWarmAllowed() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  const connection = (typeof navigator !== 'undefined' ? navigator : null) as (Navigator & {
    connection?: { saveData?: boolean };
  }) | null;
  return !playbackWorkloadBusy && connection?.connection?.saveData !== true;
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function warmCoreDesktopRoutes() {
  if (typeof window === 'undefined' || coreWarmStarted) return () => {};
  coreWarmStarted = true;
  let cancelled = false;
  let importsStarted = false;
  let retryHandle: number | undefined;

  const start = () => {
    if (cancelled) return;
    if (!backgroundWarmAllowed()) {
      retryHandle = window.setTimeout(start, 750);
      return;
    }
    importsStarted = true;
    const queue = [...CORE_ROUTE_KEYS];
    let active = 0;
    const runNext = () => {
      if (cancelled) return;
      if (!backgroundWarmAllowed()) { retryHandle=window.setTimeout(runNext,750); return; }
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
    if (retryHandle !== undefined) window.clearTimeout(retryHandle);
    if (!importsStarted) coreWarmStarted = false;
  };
}
