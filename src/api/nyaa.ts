import { fetchDesktopSourceApi, isDesktopApp } from '../lib/desktop';

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
const SEARCH_CACHE_MAX_ENTRIES = 260;
const inMemorySearchCache = new Map<string, SearchCacheEntry>();
const inFlightSearches = new Map<string, Promise<NyaaItem[]>>();
const DEFAULT_TRACKERS = [
  'http://nyaa.tracker.wf:7777/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
];

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
  options: { deep?: boolean; pages?: number; wide?: boolean } = {}
): Promise<NyaaItem[]> {
  const cacheKey = JSON.stringify({ query, category, filter, page, options });
  const cached = inMemorySearchCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < SEARCH_CACHE_TTL) {
    return cached.items;
  }

  const existingRequest = inFlightSearches.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const desktop = isDesktopApp();
    const url = new URL('/api/nyaa', desktop ? 'https://www.streamnyaa.xyz' : window.location.origin);
    if (query) url.searchParams.append('q', query);
    if (category) url.searchParams.append('c', category);
    if (filter) url.searchParams.append('f', filter);
    if (page) url.searchParams.append('p', page);
    if (query && options.deep !== false) url.searchParams.append('deep', '1');
    if (query) url.searchParams.append('pages', String(options.pages || 3));
    if (query && options.wide) url.searchParams.append('wide', '1');

    let data: unknown;
    let sourceCacheStatus = '';
    let sourceQueryCount = 1;
    let sourceFetchedAt = Date.now();

    if (desktop) {
      const desktopResponse = await fetchDesktopSourceApi(url.toString());
      data = desktopResponse.data;
      sourceFetchedAt = desktopResponse.fetched_at || Date.now();
      sourceCacheStatus = 'DESKTOP';
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
    return results;
  })();

  inFlightSearches.set(cacheKey, request);
  try {
    return await request;
  } catch (error) {
    console.error('Source search error:', error);
    return [];
  } finally {
    inFlightSearches.delete(cacheKey);
  }
}
