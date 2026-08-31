import { fetchDesktopSourceApi, isDesktopApp } from '../lib/desktop';
import { desktopDataError } from '../lib/desktopData';

export interface NyaaItem {
  title: string;
  link: string;
  infoHash: string;
  size: string;
  rawSize: number;
  seeders: string;
  rawSeeders: number;
  leechers: string;
  magnet: string;
  category: string;
  categoryId: string;
  pubDate: string;
  trusted?: string;
  remake?: string;
  downloads?: string;
  comments?: string;
  matchedQuery?: string;
  matchedCategory?: string;
  matchedPage?: number;
  sourceScore?: number;
  matchScore?: number;
  sourceQueryCount?: number;
  sourceFetchedAt?: number;
  sourceCacheStatus?: string;
}

type SearchCacheEntry = {
  items: NyaaItem[];
  savedAt: number;
};

const SEARCH_CACHE_TTL = 1000 * 60 * 20;
const SEARCH_CACHE_MAX_STALE = 1000 * 60 * 60 * 24 * 7;
const SEARCH_CACHE_MAX_ENTRIES = 260;
const SEARCH_CACHE_STORAGE_KEY = 'streamnyaa.desktop.sourceCache.v1';
const inMemorySearchCache = new Map<string, SearchCacheEntry>();
const inFlightSearches = new Map<string, Promise<NyaaItem[]>>();
const DEFAULT_TRACKERS = [
  'http://nyaa.tracker.wf:7777/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
];

let persistentSourceCacheLoaded = false;
let sourceCachePersistTimer: number | undefined;

function loadPersistentSourceCache() {
  if (persistentSourceCacheLoaded || typeof window === 'undefined') return;
  persistentSourceCacheLoaded = true;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEARCH_CACHE_STORAGE_KEY) || '[]') as Array<[string, SearchCacheEntry]>;
    const now = Date.now();
    parsed.forEach(([key, entry]) => {
      if (!key || !Array.isArray(entry?.items) || now - Number(entry.savedAt || 0) > SEARCH_CACHE_MAX_STALE) return;
      inMemorySearchCache.set(key, entry);
    });
  } catch {
    window.localStorage.removeItem(SEARCH_CACHE_STORAGE_KEY);
  }
}

export function warmDesktopSourceCache() {
  if (isDesktopApp()) loadPersistentSourceCache();
}

function persistSourceCacheNow() {
  if (typeof window === 'undefined') return;
  try {
    const entries = [...inMemorySearchCache.entries()]
      .sort((left, right) => right[1].savedAt - left[1].savedAt)
      .slice(0, SEARCH_CACHE_MAX_ENTRIES);
    window.localStorage.setItem(SEARCH_CACHE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A successful lookup must not fail because the optional persistent cache is full.
  }
}

function schedulePersistSourceCache() {
  if (typeof window === 'undefined') return;
  if (sourceCachePersistTimer !== undefined) window.clearTimeout(sourceCachePersistTimer);
  sourceCachePersistTimer = window.setTimeout(() => {
    sourceCachePersistTimer = undefined;
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(persistSourceCacheNow, { timeout: 2_000 });
    } else {
      persistSourceCacheNow();
    }
  }, 900);
}

function parseSize(sizeStr: string): number {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([\d.]+)\s*(GiB|MiB|KiB|Bytes)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'gib': return val * 1024 * 1024 * 1024;
    case 'mib': return val * 1024 * 1024;
    case 'kib': return val * 1024;
    case 'bytes': return val;
    default: return val;
  }
}

function normalizeInfoHash(value: unknown): string {
  const trimmed = String(value || '').trim();
  if (trimmed.length === 40 && /^[a-f0-9]+$/i.test(trimmed)) return trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  if (upper.length === 32 && /^[A-Z2-7]+$/.test(upper)) return upper;
  return '';
}

function buildMagnetLink(infoHash: string, title: string) {
  if (!infoHash) return '';
  let magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`;
  DEFAULT_TRACKERS.forEach((tracker) => {
    magnet += `&tr=${encodeURIComponent(tracker)}`;
  });
  return magnet;
}

export function dedupeNyaaItems(items: NyaaItem[]): NyaaItem[] {
  const byKey = new Map<string, NyaaItem>();
  for (const item of items) {
    const key = item.infoHash
      ? `hash:${item.infoHash.toLowerCase()}`
      : item.link
        ? `link:${item.link.toLowerCase()}`
        : `fallback:${item.title.toLowerCase()}-${item.size.toLowerCase()}`;
    const existing = byKey.get(key);
    const itemScore = Number(item.sourceScore || 0);
    const existingScore = Number(existing?.sourceScore || 0);
    if (!existing || itemScore > existingScore || (itemScore === existingScore && item.rawSeeders > existing.rawSeeders)) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => {
    if (Number(b.sourceScore || 0) !== Number(a.sourceScore || 0)) return Number(b.sourceScore || 0) - Number(a.sourceScore || 0);
    if (b.rawSeeders !== a.rawSeeders) return b.rawSeeders - a.rawSeeders;
    return b.rawSize - a.rawSize;
  });
}

export async function searchNyaa(
  query: string,
  category: string = '1_2',
  filter: string = '0',
  page: string = '1',
  options: { deep?: boolean; pages?: number; wide?: boolean; signal?: AbortSignal } = {}
): Promise<NyaaItem[]> {
  const desktopRuntime = isDesktopApp();
  if (desktopRuntime) loadPersistentSourceCache();
  const normalizedQuery = query.replace(/\s+/g, ' ').trim();
  const requestOptions = { deep: options.deep, pages: options.pages, wide: options.wide };
  const cacheKey = JSON.stringify({ query: normalizedQuery.toLowerCase(), category, filter, page, options: requestOptions });
  const cached = inMemorySearchCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < SEARCH_CACHE_TTL) {
    return cached.items;
  }
  const staleCached = desktopRuntime && cached && Date.now() - cached.savedAt < SEARCH_CACHE_MAX_STALE ? cached.items : null;

  const existingRequest = inFlightSearches.get(cacheKey);
  if (existingRequest) return searchResultUnlessAborted(existingRequest, options.signal);

  const request = (async () => {
    const desktop = desktopRuntime;
    const url = new URL('/api/nyaa', desktop ? 'https://www.streamnyaa.xyz' : window.location.origin);
    if (normalizedQuery) url.searchParams.append('q', normalizedQuery);
    if (category) url.searchParams.append('c', category);
    if (filter) url.searchParams.append('f', filter);
    if (page) url.searchParams.append('p', page);
    if (normalizedQuery && options.deep !== false) url.searchParams.append('deep', '1');
    if (normalizedQuery) url.searchParams.append('pages', String(options.pages || 3));
    if (normalizedQuery && options.wide) url.searchParams.append('wide', '1');

    let data: unknown;
    let sourceCacheStatus = '';
    let sourceQueryCount = 1;
    let sourceFetchedAt = Date.now();

    if (desktop) {
      try {
        const desktopResponse = await fetchDesktopSourceApi(url.toString());
        data = desktopResponse.data;
        sourceFetchedAt = desktopResponse.fetched_at || Date.now();
        sourceCacheStatus = String(desktopResponse.cache_status || 'NETWORK').toUpperCase();
      } catch (error) {
        if (staleCached) return staleCached;
        throw desktopDataError('nyaa', error);
      }
    } else {
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Failed to fetch from /api/nyaa');

      sourceCacheStatus = response.headers.get('X-Source-Cache') || '';
      sourceQueryCount = Number(response.headers.get('X-Source-Query-Count') || 1);
      const fetchedAtHeader = response.headers.get('X-Source-Fetched-At');
      sourceFetchedAt = fetchedAtHeader ? Number(fetchedAtHeader) : Date.now();
      data = await response.json();
    }

    if (!Array.isArray(data)) {
      if (staleCached) return staleCached;
      if (desktop) throw desktopDataError('nyaa', new Error('Source provider returned an invalid response.'));
      console.error('Source search did not return an array:', data);
      return [];
    }

    const results: NyaaItem[] = [];

    for (const item of data) {
      const title = String(item.title || '').trim();
      const link = String(item.link || '').trim();
      const infoHash = normalizeInfoHash(item.infoHash);
      const magnet = buildMagnetLink(infoHash, title);

      if (!title || (!link && !magnet)) continue;

      results.push({
        title,
        link,
        infoHash,
        size: item.size || '0 Bytes',
        rawSize: parseSize(item.size),
        seeders: (item.seeders || 0).toString(),
        rawSeeders: parseInt(item.seeders) || 0,
        leechers: (item.leechers || 0).toString(),
        magnet,
        category: item.category,
        categoryId: item.categoryId,
        pubDate: item.pubDate,
        trusted: item.trusted || '',
        remake: item.remake || '',
        downloads: (item.downloads || 0).toString(),
        comments: (item.comments || 0).toString(),
        matchedQuery: item.matchedQuery || '',
        matchedCategory: item.matchedCategory || '',
        matchedPage: Number(item.matchedPage || 1),
        sourceScore: Number(item.sourceScore || 0),
        matchScore: Number(item.matchScore || 0),
        sourceQueryCount: Number(item.sourceQueryCount || sourceQueryCount),
        sourceFetchedAt,
        sourceCacheStatus,
      });
    }

    inMemorySearchCache.set(cacheKey, { items: results, savedAt: Date.now() });
    while (inMemorySearchCache.size > SEARCH_CACHE_MAX_ENTRIES) {
      const oldestKey = inMemorySearchCache.keys().next().value;
      if (!oldestKey) break;
      inMemorySearchCache.delete(oldestKey);
    }
    if (desktop) schedulePersistSourceCache();
    return results;
  })();

  const handledRequest = request.catch((error) => {
    if (staleCached) return staleCached;
    if (!desktopRuntime) {
      console.error('Source search error:', error);
      return [];
    }
    throw desktopDataError('nyaa', error);
  });
  inFlightSearches.set(cacheKey, handledRequest);
  const clearInFlight = () => {
    if (inFlightSearches.get(cacheKey) === handledRequest) inFlightSearches.delete(cacheKey);
  };
  void handledRequest.then(clearInFlight, clearInFlight);
  return searchResultUnlessAborted(handledRequest, options.signal);
}

function searchResultUnlessAborted(request: Promise<NyaaItem[]>, signal?: AbortSignal) {
  if (!signal) return request;
  if (signal.aborted) return Promise.resolve([]);
  return new Promise<NyaaItem[]>((resolve, reject) => {
    let settled = false;
    const finish = (items: NyaaItem[]) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve(items);
    };
    const onAbort = () => finish([]);
    signal.addEventListener('abort', onAbort, { once: true });
    void request.then(finish, (error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      reject(error);
    });
  });
}
