const DESKTOP_CATALOG_CACHE_KEY = 'streamnyaa.desktop.catalogs.v1';
const MAX_ENTRIES = 24;
const MAX_ITEMS_PER_ENTRY = 80;
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_SERIALIZED_BYTES = 2_000_000;

export type DesktopCatalogPayload = {
  data: any[];
  [key: string]: unknown;
};

type DesktopCatalogCacheEntry = {
  key: string;
  savedAt: number;
  data: DesktopCatalogPayload;
};

function validEntry(entry: any): entry is DesktopCatalogCacheEntry {
  return typeof entry?.key === 'string'
    && entry.key.length > 0
    && entry.key.length <= 180
    && Number.isFinite(entry?.savedAt)
    && Array.isArray(entry?.data?.data)
    && entry.data.data.length <= MAX_ITEMS_PER_ENTRY
    && entry.data.data.every((item: unknown) => item !== null && typeof item === 'object');
}

function readEntries() {
  if (typeof window === 'undefined') return [] as DesktopCatalogCacheEntry[];
  try {
    const raw = window.localStorage.getItem(DESKTOP_CATALOG_CACHE_KEY) || '[]';
    if (raw.length > MAX_SERIALIZED_BYTES) {
      window.localStorage.removeItem(DESKTOP_CATALOG_CACHE_KEY);
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validEntry) : [];
  } catch {
    window.localStorage.removeItem(DESKTOP_CATALOG_CACHE_KEY);
    return [];
  }
}

export function readDesktopCatalog(key: string, now = Date.now()) {
  const entry = readEntries().find((candidate) => candidate.key === key);
  if (!entry || now - entry.savedAt > MAX_AGE_MS) return null;
  return entry;
}

export function writeDesktopCatalog(key: string, data: DesktopCatalogPayload, now = Date.now()) {
  if (typeof window === 'undefined' || !key || key.length > 180 || !Array.isArray(data?.data) || !data.data.length) return;
  const boundedData = { ...data, data: data.data.slice(0, MAX_ITEMS_PER_ENTRY) };
  try {
    const next = [
      { key, savedAt: now, data: boundedData },
      ...readEntries().filter((entry) => entry.key !== key && now - entry.savedAt <= MAX_AGE_MS),
    ].slice(0, MAX_ENTRIES);
    const serialized = JSON.stringify(next);
    if (serialized.length <= MAX_SERIALIZED_BYTES) {
      window.localStorage.setItem(DESKTOP_CATALOG_CACHE_KEY, serialized);
    }
  } catch {
    // The in-memory query result remains usable when persistence is unavailable.
  }
}
