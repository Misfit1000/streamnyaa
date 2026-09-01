const DESKTOP_EXPLORE_CACHE_KEY = 'streamnyaa.desktop.explore-catalog.v1';
const MAX_ENTRIES = 20;
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

type ExploreCacheEntry = {
  key: string;
  savedAt: number;
  data: any;
};

function readEntries() {
  if (typeof window === 'undefined') return [] as ExploreCacheEntry[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DESKTOP_EXPLORE_CACHE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry?.key && entry?.savedAt && Array.isArray(entry?.data?.data))
      : [];
  } catch {
    return [];
  }
}

export function exploreCatalogCacheKey(input: Record<string, unknown>) {
  return Object.entries(input)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value ?? '').trim().toLowerCase()}`)
    .join('|');
}

export function readDesktopExploreCatalog(key: string, now = Date.now()) {
  const entry = readEntries().find((candidate) => candidate.key === key);
  if (!entry || now - entry.savedAt > MAX_AGE_MS) return null;
  return entry;
}

export function writeDesktopExploreCatalog(key: string, data: any, now = Date.now()) {
  if (typeof window === 'undefined' || !Array.isArray(data?.data) || !data.data.length) return;
  try {
    const next = [
      { key, savedAt: now, data },
      ...readEntries().filter((entry) => entry.key !== key && now - entry.savedAt <= MAX_AGE_MS),
    ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(DESKTOP_EXPLORE_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Explore remains functional when storage is full or unavailable.
  }
}

