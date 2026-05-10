import { XMLParser } from "fast-xml-parser";

type SourceCacheEntry = {
  data: any[];
  fetchedAt: number;
  refreshPromise?: Promise<any[]>;
};

const sourceCache = new Map<string, SourceCacheEntry>();
const SOURCE_FRESH_MS = 1000 * 60 * 2;
const SOURCE_STALE_MS = 1000 * 60 * 10;

async function fetchSourceResults(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch source results: ${response.status}`);
  }

  const xmlData = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
  });
  const result = parser.parse(xmlData);
  const items = result.rss?.channel?.item || [];

  return (Array.isArray(items) ? items : [items]).map((item) => ({
    title: item.title,
    link: item.link,
    guid: item.guid,
    pubDate: item.pubDate,
    seeders: item["nyaa:seeders"],
    leechers: item["nyaa:leechers"],
    downloads: item["nyaa:downloads"],
    infoHash: item["nyaa:infoHash"],
    categoryId: item["nyaa:categoryId"],
    category: item["nyaa:category"],
    size: item["nyaa:size"],
    comments: item["nyaa:comments"],
    trusted: item["nyaa:trusted"],
    remake: item["nyaa:remake"],
  }));
}

function refreshCachedSource(cacheKey: string, url: string, cached: SourceCacheEntry) {
  if (cached.refreshPromise) return;
  cached.refreshPromise = fetchSourceResults(url)
    .then((data) => {
      sourceCache.set(cacheKey, { data, fetchedAt: Date.now() });
      return data;
    })
    .catch(() => cached.data)
    .finally(() => {
      const latest = sourceCache.get(cacheKey);
      if (latest) delete latest.refreshPromise;
    });
}

export default async function handler(req: any, res: any) {
  try {
    const { q, c, f, p } = req.query;
    const url = new URL("https://nyaa.si/?page=rss");
    if (q) url.searchParams.append("q", q);
    if (c) url.searchParams.append("c", c);
    if (f) url.searchParams.append("f", f);
    if (p) url.searchParams.append("p", p);

    const cacheKey = url.toString();
    const cached = sourceCache.get(cacheKey);
    const age = cached ? Date.now() - cached.fetchedAt : Number.POSITIVE_INFINITY;
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=480");

    if (cached && age < SOURCE_FRESH_MS) {
      res.setHeader("X-Source-Cache", "HIT");
      res.setHeader("X-Source-Fetched-At", String(cached.fetchedAt));
      return res.json(cached.data);
    }

    if (cached && age < SOURCE_STALE_MS) {
      refreshCachedSource(cacheKey, cacheKey, cached);
      res.setHeader("X-Source-Cache", "STALE");
      res.setHeader("X-Source-Fetched-At", String(cached.fetchedAt));
      return res.json(cached.data);
    }

    const formattedItems = await fetchSourceResults(cacheKey);
    const fetchedAt = Date.now();
    sourceCache.set(cacheKey, { data: formattedItems, fetchedAt });
    res.setHeader("X-Source-Cache", "MISS");
    res.setHeader("X-Source-Fetched-At", String(fetchedAt));
    res.json(formattedItems);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
