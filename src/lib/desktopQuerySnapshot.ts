import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from '@tanstack/react-query';

const SNAPSHOT_KEY = 'streamnyaa.desktopPublicQuerySnapshot.v1';
const SNAPSHOT_MAX_AGE_MS = 1000 * 60 * 60 * 24;
const SNAPSHOT_MAX_QUERIES = 48;
const SNAPSHOT_MAX_BYTES = 3 * 1024 * 1024;

const PUBLIC_QUERY_PREFIXES = new Set([
  'anime',
  'episodes',
  'seasonal-anime',
  'recent-episodes',
  'upcoming-anime',
  'popular-anime',
  'top-anime',
  'search-anime',
  'desktop-watch-installments-graph',
  'desktop-watch-sources',
  'desktop-sources',
]);

type StoredSnapshot = {
  savedAt: number;
  state: DehydratedState;
};

export function isPublicDesktopQuery(query: Pick<Query, 'queryKey'>) {
  const prefix = String(query.queryKey[0] || '');
  if (PUBLIC_QUERY_PREFIXES.has(prefix)) return true;
  return prefix.startsWith('desktop-home-') || prefix.startsWith('desktop-explore-');
}
export function restoreDesktopQuerySnapshot(queryClient: QueryClient) {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredSnapshot;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > SNAPSHOT_MAX_AGE_MS || !parsed.state) {
      window.localStorage.removeItem(SNAPSHOT_KEY);
      return false;
    }
    if (parsed.savedAt > Date.now() + 60_000 || !Array.isArray(parsed.state.queries)) return false;
    parsed.state.queries = parsed.state.queries.filter(query => {
      if (!isPublicDesktopQuery(query as Query) || query.state.status !== 'success') return false;
      const data = query.state.data as any;
      if (query.queryKey[0] === 'episodes' && data?.streamnyaa?.status === 'estimated') return false;
      if (query.queryKey[0] === 'desktop-watch-sources' && !Array.isArray(data?.items)) return false;
      if (query.queryKey[0] === 'desktop-watch-installments-graph' && !Array.isArray(data?.items)) return false;
      return query.state.dataUpdatedAt <= Date.now() + 60_000;
    });
    parsed.state.mutations = [];
    hydrate(queryClient, parsed.state);
    return true;
  } catch {
    window.localStorage.removeItem(SNAPSHOT_KEY);
    return false;
  }
}

export function installDesktopQuerySnapshot(queryClient: QueryClient) {
  if (typeof window === 'undefined') return () => {};
  let timer: number | undefined;
  let idleHandle: number | undefined;
  const persist = () => {
    timer = undefined;
    try {
      const state = dehydrate(queryClient, {
        shouldDehydrateQuery: (query) => query.state.status === 'success' && isPublicDesktopQuery(query),
      });
      state.queries = state.queries
        .sort((left, right) => Number(right.state.dataUpdatedAt || 0) - Number(left.state.dataUpdatedAt || 0))
        .slice(0, SNAPSHOT_MAX_QUERIES);
      const serialized = JSON.stringify({ savedAt: Date.now(), state } satisfies StoredSnapshot);
      if (serialized.length <= SNAPSHOT_MAX_BYTES) {
        window.localStorage.setItem(SNAPSHOT_KEY, serialized);
      }
    } catch {
      // Public-data restoration is an optimization and must never block live queries.
    }
  };
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (!event?.query || !isPublicDesktopQuery(event.query)) return;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      const idleWindow = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
      };
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(() => {
          idleHandle = undefined;
          persist();
        }, { timeout: 2_500 });
      } else {
        persist();
      }
    }, 900);
  });
  return () => {
    unsubscribe();
    if (timer !== undefined) window.clearTimeout(timer);
    if (idleHandle !== undefined) {
      (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback?.(idleHandle);
    }
  };
}
