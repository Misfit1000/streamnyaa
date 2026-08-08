import { API_ORIGIN, SOURCE_CATEGORY, SOURCE_TRACKERS } from '../config';
import type { TorrentSource } from '../types';
import { buildSourceQuery, sourceQualityScore } from '../../../shared/sources';
import { requestJson } from '../lib/network';
import { sourceQueriesForAnime } from '../lib/sourceDiscovery';
import type { Anime } from '../types';
import type { AudioPreference } from '../../../shared/preferences';

export type SourceSearchOptions = { category?: string; filter?: string; page?: number; deep?: boolean; pages?: number; wide?: boolean; signal?: AbortSignal };

function magnetFor(item: any) {
  const original = String(item.link || '').startsWith('magnet:') ? String(item.link) : '';
  const hash = String(item.infoHash || '').trim() || original.match(/(?:xt=urn:btih:)([a-z0-9]+)/i)?.[1] || '';
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

function metadataUrlsFor(item: any) {
  const direct = String(item.link || '').trim();
  const match = direct.match(/^https:\/\/(?:www\.)?nyaa\.si\/download\/(\d+)\.torrent(?:\?.*)?$/i);
  const urls: string[] = [];
  if (match?.[1]) urls.push(`${API_ORIGIN}/api/torrent?id=${encodeURIComponent(match[1])}`);
  if (/^https:\/\//i.test(direct)) urls.push(direct);
  return [...new Set(urls)];
}

export async function searchSources(query: string, options: SourceSearchOptions = {}) {
  const params = new URLSearchParams({
    q: query,
    c: options.category || SOURCE_CATEGORY,
    f: options.filter || '0',
    p: String(options.page || 1),
    deep: options.deep === false ? '0' : '1',
    pages: String(options.pages || 2),
    wide: options.wide === false ? '0' : '1',
  });
  const data = await requestJson<any>(`${API_ORIGIN}/api/nyaa?${params.toString()}`, {
    signal: options.signal,
    timeoutMs: 20_000,
  });
  return (Array.isArray(data) ? data : []).map((item: any): TorrentSource => ({
    title: String(item.title || ''),
    link: item.link,
    pubDate: item.pubDate,
    seeders: Number(item.seeders || 0),
    leechers: Number(item.leechers || 0),
    downloads: Number(item.downloads || 0),
    infoHash: String(item.infoHash || ''),
    category: item.category,
    size: item.size,
    trusted: String(item.trusted).toLowerCase() === 'yes',
    remake: String(item.remake).toLowerCase() === 'yes',
    sourceScore: Number(item.sourceScore || sourceQualityScore({
      title: item.title,
      seeders: Number(item.seeders || 0),
      leechers: Number(item.leechers || 0),
      sizeBytes: Number(item.rawSize || 0),
    })),
    matchScore: Number(item.matchScore || 0),
    magnet: magnetFor(item),
    metadataUrls: metadataUrlsFor(item),
  })).sort((a: TorrentSource, b: TorrentSource) =>
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
) {
  const queries = sourceQueriesForAnime(anime, episode, audio);
  const sources = new Map<string, TorrentSource>();
  let lastError: unknown;

  for (const query of queries) {
    if (options.signal?.aborted) throw options.signal.reason;
    try {
      const matches = await searchSources(query, options);
      matches.forEach((source) => {
        const key = source.infoHash?.toLowerCase() || source.magnet;
        const previous = sources.get(key);
        if (!previous || Number(source.sourceScore || 0) > Number(previous.sourceScore || 0)) sources.set(key, source);
      });
      const healthy = [...sources.values()].filter((source) => source.seeders > 0);
      if (healthy.length >= 3) break;
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
