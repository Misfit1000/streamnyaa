import { API_ORIGIN, SOURCE_CATEGORY, SOURCE_TRACKERS } from '../config';
import type { TorrentSource } from '../types';

function magnetFor(item: any) {
  if (String(item.link || '').startsWith('magnet:')) return item.link;
  const hash = String(item.infoHash || '').trim();
  let magnet = `magnet:?xt=urn:btih:${encodeURIComponent(hash)}&dn=${encodeURIComponent(item.title || 'StreamNyaa source')}`;
  SOURCE_TRACKERS.forEach((tracker) => { magnet += `&tr=${encodeURIComponent(tracker)}`; });
  return magnet;
}

export async function searchSources(query: string, options: { category?: string; filter?: string; page?: number } = {}) {
  const params = new URLSearchParams({
    q: query,
    c: options.category || SOURCE_CATEGORY,
    f: options.filter || '0',
    p: String(options.page || 1),
  });
  const response = await fetch(`${API_ORIGIN}/api/nyaa?${params.toString()}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Sources could not be loaded.');
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
    sourceScore: Number(item.sourceScore || 0),
    matchScore: Number(item.matchScore || 0),
    magnet: magnetFor(item),
  })).sort((a: TorrentSource, b: TorrentSource) =>
    (b.matchScore || 0) - (a.matchScore || 0)
      || (b.sourceScore || 0) - (a.sourceScore || 0)
      || b.seeders - a.seeders,
  );
}

export function sourceQuery(title: string, episode?: number, audio = 'sub-preferred') {
  const episodePart = episode ? ` ${String(episode).padStart(2, '0')}` : '';
  const audioPart = audio === 'dub-only' ? ' dub' : audio === 'dual-preferred' ? ' dual audio' : '';
  return `${title}${episodePart}${audioPart}`.trim();
}
