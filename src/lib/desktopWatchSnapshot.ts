export type DesktopWatchSnapshot = {
  anime: any;
  savedAt: number;
};

const MAX_SNAPSHOTS = 64;
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const STORAGE_KEY = 'streamnyaa:desktop-watch-snapshots:v1';
const MAX_BYTES = 500_000;
let hydrated = false;
const snapshots = new Map<string, DesktopWatchSnapshot>();

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > MAX_BYTES) return;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.entries)) return;
    for (const entry of saved.entries.slice(-MAX_SNAPSHOTS)) {
      if (typeof entry.key !== 'string' || !entry.anime || typeof entry.anime.title !== 'string'
        || !Number.isFinite(entry.savedAt) || entry.savedAt > Date.now() || Date.now() - entry.savedAt > MAX_AGE_MS) continue;
      snapshots.set(entry.key, { anime: entry.anime, savedAt: entry.savedAt });
    }
  } catch { /* Unavailable storage must not block navigation. */ }
}
function persist() {
  try {
    const entries = [...snapshots].map(([key, value]) => ({ key, ...value }));
    let value = JSON.stringify({ version: 1, entries });
    while (value.length > MAX_BYTES && entries.length) {
      entries.shift(); value = JSON.stringify({ version: 1, entries });
    }
    localStorage.setItem(STORAGE_KEY, value);
  } catch { /* Keep the in-memory snapshot if persistence is unavailable. */ }
}

function snapshotKey(pathWithSearch: string) {
  if (typeof window === 'undefined') return pathWithSearch;
  const url = new URL(pathWithSearch, window.location.origin);
  const match = url.pathname.match(/^\/(?:watch|anime)\/([^/]+)/);
  if (!match) return '';
  return decodeURIComponent(match[1]);
}

export function primeDesktopWatchSnapshot(pathWithSearch: string, anime: any) {
  hydrate();
  const key = snapshotKey(pathWithSearch);
  if (!key || !anime) return;
  if (snapshots.get(key)?.anime === anime) return;
  snapshots.delete(key);
  snapshots.set(key, { anime, savedAt: Date.now() });
  while (snapshots.size > MAX_SNAPSHOTS) {
    const oldest = snapshots.keys().next().value;
    if (!oldest) break;
    snapshots.delete(oldest);
  }
  persist();
}

export function readDesktopWatchSnapshot(routeId: string) {
  hydrate();
  const entry = snapshots.get(String(routeId || ''));
  if (!entry) return null;
  if (Date.now() - entry.savedAt > MAX_AGE_MS) {
    snapshots.delete(String(routeId || ''));
    return null;
  }
  return entry.anime;
}

export function readCachedWatchTitles(): any[] {
  hydrate();
  return [...snapshots.values()].filter(entry => Date.now() - entry.savedAt <= MAX_AGE_MS).map(entry => entry.anime);
}
