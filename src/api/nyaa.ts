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

export async function searchNyaa(query: string, category: string = '1_2', filter: string = '0', page: string = '1'): Promise<NyaaItem[]> {
  try {
    const url = new URL('/api/nyaa', window.location.origin);
    if (query) url.searchParams.append('q', query);
    if (category) url.searchParams.append('c', category);
    if (filter) url.searchParams.append('f', filter);
    if (page) url.searchParams.append('p', page);
    
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error('Failed to fetch from /api/nyaa');
    
    const data = await response.json();
    if (!Array.isArray(data)) {
        console.error("Source search did not return an array:", data);
        return [];
    }

    const results: NyaaItem[] = [];
    
    for (const item of data) {
        const title = item.title || '';
        
        // Generate magnet URI from infohash
        const trackers = [
          'wss://tracker.openwebtorrent.com',
          'wss://tracker.webtorrent.dev',
          'wss://tracker.fastcast.nz',
          'wss://tracker.btorrent.xyz',
          'http://nyaa.tracker.wf:7777/announce',
          'udp://open.stealth.si:80/announce',
          'udp://tracker.opentrackr.org:1337/announce',
          'udp://exodus.desync.com:6969/announce',
          'udp://tracker.torrent.eu.org:451/announce'
        ];
        
        let magnet = `magnet:?xt=urn:btih:${item.infoHash}&dn=${encodeURIComponent(title)}`;
        trackers.forEach(tr => {
            magnet += `&tr=${encodeURIComponent(tr)}`;
        });

        results.push({
            title: title,
            link: item.link || '',
            infoHash: item.infoHash || '',
            size: item.size || '0 Bytes',
            rawSize: parseSize(item.size),
            seeders: (item.seeders || 0).toString(),
            rawSeeders: parseInt(item.seeders) || 0,
            leechers: (item.leechers || 0).toString(),
            magnet: magnet,
            category: item.category,
            categoryId: item.categoryId,
            pubDate: item.pubDate
        });
    }

    return results;
  } catch (error) {
    console.error("Source search error:", error);
    return [];
  }
}
