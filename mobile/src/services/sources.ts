import { API_ORIGIN, SOURCE_CATEGORY, SOURCE_TRACKERS } from '../config';
import type { TorrentSource } from '../types';
import { buildSourceQuery, sourceQualityScore } from '../../../shared/sources';
import { requestJson } from '../lib/network';

function magnetFor(item: any) {
  if (String(item.link || '').startsWith('magnet:')) return item.link;
  const hash = String(item.infoHash || '').trim();
  let magnet = `magnet:?xt=urn:btih:${encodeURIComponent(hash)}&dn=${encodeURIComponent(item.title || 'StreamNyaa source')}`;
  SOURCE_TRACKERS.forEach((tracker) => { magnet += `&tr=${encodeURIComponent(tracker)}`; });
  return magnet;
}

export async function searchSources(query: string, options: { category?: string; filter?: string; page?: number; deep?: boolean; pages?: number; wide?: boolean; signal?: AbortSignal } = {}) {
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
  })).sort((a: TorrentSource, b: TorrentSource) =>
    (b.matchScore || 0) - (a.matchScore || 0)
      || (b.sourceScore || 0) - (a.sourceScore || 0)
      || b.seeders - a.seeders,
  );
}

export function sourceQuery(title: string, episode?: number, audio = 'sub-preferred') {
  return buildSourceQuery(title, episode, audio as import('../../../shared/preferences').AudioPreference);
}
