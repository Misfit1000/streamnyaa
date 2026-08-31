export type DesktopWatchSnapshot = {
  anime: any;
  savedAt: number;
};

const MAX_SNAPSHOTS = 64;
const MAX_AGE_MS = 1000 * 60 * 20;
const snapshots = new Map<string, DesktopWatchSnapshot>();

function snapshotKey(pathWithSearch: string) {
  if (typeof window === 'undefined') return pathWithSearch;
  const url = new URL(pathWithSearch, window.location.origin);
  const match = url.pathname.match(/^\/(?:watch|anime)\/([^/]+)/);
  if (!match) return '';
  return decodeURIComponent(match[1]);
}

export function primeDesktopWatchSnapshot(pathWithSearch: string, anime: any) {
  const key = snapshotKey(pathWithSearch);
  if (!key || !anime) return;
  snapshots.delete(key);
  snapshots.set(key, { anime, savedAt: Date.now() });
  while (snapshots.size > MAX_SNAPSHOTS) {
    const oldest = snapshots.keys().next().value;
    if (!oldest) break;
    snapshots.delete(oldest);
  }
}

export function readDesktopWatchSnapshot(routeId: string) {
  const entry = snapshots.get(String(routeId || ''));
  if (!entry) return null;
  if (Date.now() - entry.savedAt > MAX_AGE_MS) {
    snapshots.delete(String(routeId || ''));
    return null;
  }
  return entry.anime;
}
