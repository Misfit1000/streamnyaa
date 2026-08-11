import { API_ORIGIN, SOURCE_CATEGORY, SOURCE_TRACKERS } from '../config';
import type { TorrentSource } from '../types';
import { buildSourceQuery, parseSizeBytes, sourceQualityScore } from '../../../shared/sources';
import { requestJson } from '../lib/network';
import { sourceQueriesForAnime } from '../lib/sourceDiscovery';
import type { Anime } from '../types';
import type { AudioPreference } from '../../../shared/preferences';

export type SourceSearchOptions = { category?: string; filter?: string; page?: number; deep?: boolean; pages?: number; wide?: boolean; timeoutMs?: number; signal?: AbortSignal };

function sourceItems(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function magnetFor(item: any) {
  const original = String(item.link || '').startsWith('magnet:') ? String(item.link) : '';
  const hash = String(item.infoHash || '').trim() || original.match(/(?:xt=urn:btih:)([a-z0-9]+)/i)?.[1] || '';
  if (!/^[a-z0-9]{32,64}$/i.test(hash)) return '';
  let magnet = `magnet:?xt=urn:btih:${encodeURIComponent(hash)}&dn=${encodeURIComponent(item.title || 'StreamNyaa source')}`;
  const existingTrackers = new Set<string>();
  if (original) {
    try {
      new URL(original).searchParams.getAll('tr').forEach((tracker) => existingTrackers.add(tracker));
    } catch { /* Rebuild malformed magnets from the verified info hash. */ }
  }
  [...existingTrackers, ...SOURCE_TRACKERS].forEach((tracker) => { magnet += `&tr=${encodeURIComponent(tracker)}`; });
  return magnet;
}

function normalizedSizeBytes(item: any) {
  const raw = Number(item.rawSize || 0);
  if (Number.isFinite(raw) && raw > 0) return raw;
  const parsed = parseSizeBytes(String(item.size || ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function metadataUrlsFor(item: any) {
  const link = String(item.link || '');
  const torrentId = String(item.id || link.match(/(?:view|download)\/(\d+)/i)?.[1] || '').trim();
  const urls: string[] = [];
  if (/^\d+$/.test(torrentId)) urls.push(`${API_ORIGIN}/api/torrent?id=${encodeURIComponent(torrentId)}`);
  if (/^https:\/\//i.test(link) && /\.(torrent)(?:$|\?)/i.test(link)) urls.push(link);
  else if (/^\d+$/.test(torrentId)) urls.push(`https://nyaa.si/download/${torrentId}.torrent`);
  return [...new Set(urls)].slice(0, 3);
}

export async function searchSources(query: string, options: SourceSearchOptions = {}): Promise<TorrentSource[]> {
  const params = new URLSearchParams({
    q: query,
    c: options.category || SOURCE_CATEGORY,
    f: options.filter || '0',
    p: String(options.page || 1),
    deep: options.deep === true ? '1' : '0',
    pages: String(options.pages || 1),
    wide: options.wide === true ? '1' : '0',
  });
  const data = await requestJson<any>(`${API_ORIGIN}/api/nyaa?${params.toString()}`, {
    signal: options.signal,
    timeoutMs: options.timeoutMs || 8_000,
  });
  return sourceItems(data).map((item: any): TorrentSource => ({
    title: String(item.title || ''),
    link: item.link,
    pubDate: item.pubDate,
    seeders: Number(item.seeders || 0),
    leechers: Number(item.leechers || 0),
    downloads: Number(item.downloads || 0),
    infoHash: String(item.infoHash || ''),
    category: item.category,
    size: item.size,
    sizeBytes: normalizedSizeBytes(item),
    trusted: String(item.trusted).toLowerCase() === 'yes',
    remake: String(item.remake).toLowerCase() === 'yes',
    sourceScore: Number(item.sourceScore || sourceQualityScore({
      title: item.title,
      seeders: Number(item.seeders || 0),
      leechers: Number(item.leechers || 0),
      sizeBytes: normalizedSizeBytes(item),
    })),
    matchScore: Number(item.matchScore || 0),
    magnet: magnetFor(item),
    metadataUrls: metadataUrlsFor(item),
  })).filter((source: TorrentSource) => Boolean(source.magnet)).sort((a: TorrentSource, b: TorrentSource) =>
    (b.matchScore || 0) - (a.matchScore || 0)
      || (b.sourceScore || 0) - (a.sourceScore || 0)
      || b.seeders - a.seeders,
  );
}

export async function searchAnimeSources(
  anime: Pick<Anime, 'title' | 'titles'>,
  episode: number,
  audio: AudioPreference,
  options: SourceSearchOptions = {},
): Promise<TorrentSource[]> {
  const queries = sourceQueriesForAnime(anime, episode, audio);
  const sources = new Map<string, TorrentSource>();
  let lastError: unknown;

  const merge = (matches: TorrentSource[]) => matches.forEach((source) => {
    const key = source.infoHash?.toLowerCase() || source.magnet;
    const previous = sources.get(key);
    if (!previous || Number(source.sourceScore || 0) > Number(previous.sourceScore || 0)) sources.set(key, source);
  });

  // Focused aliases are dramatically faster on mobile and avoid waiting for
  // the server's broad multi-page expansion before playback can begin.
  const fastQueries = queries.slice(0, 6);
  const fastResults = await Promise.allSettled(fastQueries.map((query) => searchSources(query, {
    ...options,
    deep: false,
    pages: 1,
    wide: false,
    timeoutMs: Math.min(options.timeoutMs || 4_000, 4_000),
  })));
  fastResults.forEach((result) => {
    if (result.status === 'fulfilled') merge(result.value);
    else lastError = result.reason;
  });

  // A broad server expansion is a recovery path, not part of normal startup.
  // Waiting for it whenever fewer than three releases exist made a healthy
  // first result feel broken even though it could already begin connecting.
  if (![...sources.values()].some((source) => source.seeders > 0) && queries[0]) {
    try {
      merge(await searchSources(queries[0], {
        ...options,
        deep: true,
        pages: 1,
        wide: true,
        timeoutMs: Math.min(options.timeoutMs || 4_000, 4_000),
      }));
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
    }
  }

  const result = [...sources.values()].sort((left, right) =>
    (right.matchScore || 0) - (left.matchScore || 0)
      || (right.sourceScore || 0) - (left.sourceScore || 0)
      || right.seeders - left.seeders,
  );
  if (!result.length && lastError) throw lastError;
  return result;
}

export function sourceQuery(title: string, episode?: number, audio = 'sub-preferred') {
  return buildSourceQuery(title, episode, audio as import('../../../shared/preferences').AudioPreference);
}
