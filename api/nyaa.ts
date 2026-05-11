import { XMLParser } from "fast-xml-parser";

type SourceItem = {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  seeders: string;
  leechers: string;
  downloads: string;
  infoHash: string;
  categoryId: string;
  category: string;
  size: string;
  comments: string;
  trusted: string;
  remake: string;
  matchedQuery?: string;
  matchedCategory?: string;
  matchedPage?: number;
  sourceScore?: number;
  matchScore?: number;
  sourceQueryCount?: number;
};

type SourceCacheEntry = {
  data: SourceItem[];
  fetchedAt: number;
  refreshPromise?: Promise<SourceItem[]>;
};

type SearchIntent = {
  rawQuery: string;
  titleQuery: string;
  titleTokens: string[];
  episodeNumber: number | null;
  batchSearch: boolean;
  dubSearch: boolean;
};

const sourceCache = new Map<string, SourceCacheEntry>();
const SOURCE_FRESH_MS = 1000 * 60 * 2;
const SOURCE_STALE_MS = 1000 * 60 * 10;
const DEFAULT_ANIME_CATEGORIES = ["1_2", "1_3", "1_4"];
const MAX_DEEP_PAGES = 3;
const MAX_QUERY_VARIANTS = 6;
const FETCH_CONCURRENCY = 6;

const IGNORE_TOKENS = new Set([
  "anime", "episode", "episodes", "season", "movie", "ova", "ona", "special",
  "batch", "complete", "pack", "1080p", "720p", "480p", "2160p", "4k", "uhd",
  "x264", "x265", "h264", "h265", "hevc", "avc", "aac", "flac", "opus",
  "web", "webrip", "webdl", "web-dl", "bluray", "bd", "bdrip", "hdrip",
  "sub", "subs", "subbed", "multi", "dual", "audio", "dub", "dubbed",
  "eng", "english", "japanese", "raw", "vostfr", "ita", "spa", "ger",
  "10bit", "8bit", "hi10", "hi10p", "remux"
]);

function firstValue(value: any): string {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenise(value: string): string[] {
  return normalizeText(value).split(" ").filter(Boolean);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items.filter(Boolean))];
}

function meaningfulTokens(value: string): string[] {
  return tokenise(value).filter((token) => {
    if (IGNORE_TOKENS.has(token)) return false;
    if (/^s\d{1,2}e\d{1,3}$/i.test(token)) return false;
    if (/^\d{3,4}$/.test(token) && ["480", "720", "1080", "2160"].includes(token)) return false;
    if (/^\d+$/.test(token) && Number(token) > 1900 && Number(token) < 2100) return false;
    return token.length > 1 || /^\d+$/.test(token);
  });
}

function isBatchTitle(title: string): boolean {
  return /\b(batch|complete|season pack|complete season|collection)\b/i.test(title) || /\b\d{1,3}\s*-\s*\d{1,3}\b/.test(title);
}

function parseEpisodeIntent(query: string) {
  if (/\b(batch|complete|season pack|collection)\b/i.test(query)) return { episodeNumber: null, titleQuery: query };
  const sxe = query.match(/\bs\d{1,2}e(\d{1,3})\b/i);
  if (sxe) return { episodeNumber: Number(sxe[1]), titleQuery: query.replace(sxe[0], " ") };

  const parts = query.split(/\s+/).filter(Boolean);
  let episodeIndex = -1;
  let episodeNumber: number | null = null;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const raw = parts[index].replace(/[^\d]/g, "");
    if (!raw || raw.length > 4) continue;
    const num = Number(raw);
    const lower = parts[index].toLowerCase();
    if ([480, 720, 1080].includes(num) || lower.includes("bit")) continue;
    if (num > 0 && num < 3000 && !(num >= 1900 && num <= 2099)) {
      episodeIndex = index;
      episodeNumber = num;
      break;
    }
  }

  if (episodeIndex === -1) return { episodeNumber: null, titleQuery: query };
  const titleQuery = parts.filter((_, index) => index !== episodeIndex).join(" ");
  return { episodeNumber, titleQuery };
}

function buildIntent(query: string): SearchIntent {
  const cleanQuery = normalizeText(query);
  const episode = parseEpisodeIntent(cleanQuery);
  const titleQuery = normalizeText(episode.titleQuery);
  return {
    rawQuery: query,
    titleQuery,
    titleTokens: meaningfulTokens(titleQuery || cleanQuery),
    episodeNumber: episode.episodeNumber,
    batchSearch: /\b(batch|complete|season pack|collection)\b/i.test(query),
    dubSearch: /\b(dub|dubbed|dual[\s-]?audio|multi[\s-]?audio|english[\s-]?audio|eng[\s-]?dub)\b/i.test(query),
  };
}

function buildQueryVariants(query: string, intent: SearchIntent): string[] {
  const cleanQuery = normalizeText(query);
  const titleOnly = intent.titleTokens.join(" ");
  const variants = [query, cleanQuery];

  if (intent.episodeNumber && titleOnly) {
    const ep = String(intent.episodeNumber);
    const ep2 = ep.padStart(2, "0");
    const ep3 = ep.padStart(3, "0");
    variants.push(`${titleOnly} ${ep2}`);
    variants.push(`${titleOnly} ${ep}`);
    if (ep3 !== ep2) variants.push(`${titleOnly} ${ep3}`);
    if (/1080p|720p|2160p/i.test(query)) variants.push(`${titleOnly} ${ep2} ${query.match(/2160p|1080p|720p/i)?.[0] || ""}`.trim());
  } else if (titleOnly) {
    variants.push(titleOnly);
  }

  if (intent.batchSearch && titleOnly) {
    variants.push(`${titleOnly} batch`);
    variants.push(`${titleOnly} complete`);
  }

  if (intent.dubSearch && titleOnly) {
    variants.push(`${titleOnly} dual audio`);
  }

  return unique(variants.map((variant) => variant.replace(/\s+/g, " ").trim())).slice(0, MAX_QUERY_VARIANTS);
}

function buildCategoryList(category: string): string[] {
  if (!category || category === "1_0") return DEFAULT_ANIME_CATEGORIES;
  if (!category.startsWith("1_")) return [category];
  return unique([category, ...DEFAULT_ANIME_CATEGORIES]);
}

function nyaaSearchUrl(query: string, category: string, filter: string, page: number) {
  const url = new URL("https://nyaa.si/?page=rss");
  if (query) url.searchParams.set("q", query);
  if (category) url.searchParams.set("c", category);
  if (filter) url.searchParams.set("f", filter);
  if (page > 1) url.searchParams.set("p", String(page));
  return url;
}

async function fetchSourceResults(url: URL, context: { query: string; category: string; page: number }): Promise<SourceItem[]> {
  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
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

  return (Array.isArray(items) ? items : [items]).filter(Boolean).map((item) => ({
    title: item.title || "",
    link: item.link || "",
    guid: item.guid || "",
    pubDate: item.pubDate || "",
    seeders: String(item["nyaa:seeders"] || "0"),
    leechers: String(item["nyaa:leechers"] || "0"),
    downloads: String(item["nyaa:downloads"] || "0"),
    infoHash: item["nyaa:infoHash"] || "",
    categoryId: item["nyaa:categoryId"] || "",
    category: item["nyaa:category"] || "",
    size: item["nyaa:size"] || "0 Bytes",
    comments: String(item["nyaa:comments"] || "0"),
    trusted: item["nyaa:trusted"] || "",
    remake: item["nyaa:remake"] || "",
    matchedQuery: context.query,
    matchedCategory: context.category,
    matchedPage: context.page,
  }));
}

function matchingTitleRatio(title: string, tokens: string[]): number {
  if (!tokens.length) return 1;
  const normalizedTitle = normalizeText(title);
  const titleTokens = new Set(tokenise(title));
  const matched = tokens.filter((token) => titleTokens.has(token) || normalizedTitle.includes(token));
  return matched.length / tokens.length;
}

function extractLikelyEpisode(title: string): number | null {
  const sxe = title.match(/\bs\d{1,2}e(\d{1,3})\b/i);
  if (sxe) return Number(sxe[1]);
  const explicit = title.match(/\b(?:ep|episode)\.?\s*(\d{1,3})\b/i);
  if (explicit) return Number(explicit[1]);
  const delimited = title.match(/(?:^|[\s._\-[({])(\d{1,4})(?:v\d+)?(?:[\s._\]))}-]|$)(?!\s*(?:bit|kb|mb|gb|p))/i);
  if (!delimited) return null;
  const num = Number(delimited[1]);
  if ([480, 720, 1080, 2160].includes(num) || (num >= 1900 && num <= 2099) || num <= 0 || num >= 3000) return null;
  return num;
}

function matchesEpisode(title: string, episodeNumber: number): boolean {
  const escaped = String(episodeNumber).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\bs\\d{1,2}e0*${escaped}\\b`, "i"),
    new RegExp(`\\b(?:ep|episode)\\.?\\s*0*${escaped}\\b`, "i"),
    new RegExp(`(?:^|[^\\d])0*${escaped}(?:v\\d+)?(?:[^\\d]|$)`, "i"),
  ];
  return patterns.some((pattern) => pattern.test(title));
}

function isLikelyWrongSource(item: SourceItem, intent: SearchIntent): boolean {
  const title = item.title || "";
  if (!title) return true;
  const titleRatio = matchingTitleRatio(title, intent.titleTokens);
  if (intent.titleTokens.length >= 3 && titleRatio < 0.5) return true;
  if (intent.titleTokens.length === 2 && titleRatio < 0.5) return true;
  if (intent.titleTokens.length === 1 && titleRatio < 1) return true;

  if (intent.episodeNumber && !intent.batchSearch) {
    const explicitEpisode = extractLikelyEpisode(title);
    if (explicitEpisode && explicitEpisode !== intent.episodeNumber && !isBatchTitle(title)) return true;
    if (!matchesEpisode(title, intent.episodeNumber) && !isBatchTitle(title)) return true;
  }

  if (intent.dubSearch && !/\b(dub|dubbed|dual[\s-]?audio|multi[\s-]?audio|english[\s-]?audio|eng[\s-]?dub)\b/i.test(title)) {
    return true;
  }

  return false;
}

function scoreSource(item: SourceItem, intent: SearchIntent): number {
  const title = item.title || "";
  const seeders = Number(item.seeders || 0);
  const downloads = Number(item.downloads || 0);
  const titleRatio = matchingTitleRatio(title, intent.titleTokens);
  let score = Math.round(titleRatio * 30);

  score += Math.min(30, Math.round(Math.log10(seeders + 1) * 12));
  score += Math.min(8, Math.round(Math.log10(downloads + 1) * 3));
  if (/yes|true|1/i.test(String(item.trusted))) score += 12;
  if (/yes|true|1/i.test(String(item.remake))) score -= 10;
  if (/\b(1080p|fhd)\b/i.test(title)) score += 8;
  if (/\b720p\b/i.test(title)) score += 5;
  if (/\b(hevc|x265|h265)\b/i.test(title)) score += 6;
  if (/\b(dual[\s-]?audio|multi[\s-]?audio|dub|dubbed)\b/i.test(title)) score += intent.dubSearch ? 10 : 3;
  if (isBatchTitle(title)) score += intent.batchSearch ? 10 : 2;
  if (intent.episodeNumber && matchesEpisode(title, intent.episodeNumber)) score += 16;
  if (item.categoryId === "1_2") score += 4;
  if (item.matchedPage && item.matchedPage > 1) score -= item.matchedPage - 1;

  const published = Date.parse(item.pubDate || "");
  if (Number.isFinite(published)) {
    const ageDays = Math.max(0, (Date.now() - published) / 86400000);
    if (ageDays < 3) score += 5;
    else if (ageDays < 14) score += 3;
    else if (ageDays > 365) score -= 2;
  }

  return Math.max(0, Math.min(100, score));
}

function dedupeKey(item: SourceItem): string {
  if (item.infoHash) return `hash:${String(item.infoHash).toLowerCase()}`;
  if (item.link) return `link:${String(item.link).toLowerCase()}`;
  return `fallback:${normalizeText(item.title)}:${normalizeText(item.size)}`;
}

function dedupeAndRank(items: SourceItem[], intent: SearchIntent, sourceQueryCount: number): SourceItem[] {
  const byKey = new Map<string, SourceItem>();

  for (const item of items) {
    if (isLikelyWrongSource(item, intent)) continue;
    const sourceScore = scoreSource(item, intent);
    const matchScore = Math.round(matchingTitleRatio(item.title, intent.titleTokens) * 100);
    const nextItem = { ...item, sourceScore, matchScore, sourceQueryCount };
    const key = dedupeKey(nextItem);
    const existing = byKey.get(key);
    if (!existing || Number(nextItem.sourceScore || 0) > Number(existing.sourceScore || 0)) {
      byKey.set(key, nextItem);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    if (Number(b.sourceScore || 0) !== Number(a.sourceScore || 0)) return Number(b.sourceScore || 0) - Number(a.sourceScore || 0);
    if (Number(b.seeders || 0) !== Number(a.seeders || 0)) return Number(b.seeders || 0) - Number(a.seeders || 0);
    return Date.parse(b.pubDate || "0") - Date.parse(a.pubDate || "0");
  });
}

async function fetchInChunks(urls: { url: URL; query: string; category: string; page: number }[]): Promise<SourceItem[]> {
  const results: SourceItem[] = [];
  for (let index = 0; index < urls.length; index += FETCH_CONCURRENCY) {
    const chunk = urls.slice(index, index + FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((entry) => fetchSourceResults(entry.url, entry)));
    for (const result of settled) {
      if (result.status === "fulfilled") results.push(...result.value);
    }
  }
  return results;
}

async function fetchEnhancedResults(options: { query: string; category: string; filter: string; page: number; pages: number; deep: boolean }) {
  const intent = buildIntent(options.query);
  const queries = options.deep ? buildQueryVariants(options.query, intent) : [options.query];
  const categories = options.deep ? buildCategoryList(options.category) : [options.category || "1_2"];
  const pageList = options.deep
    ? Array.from({ length: Math.max(1, Math.min(options.pages, MAX_DEEP_PAGES)) }, (_, index) => index + 1)
    : [Math.max(1, options.page || 1)];

  const urls: { url: URL; query: string; category: string; page: number }[] = [];
  for (const query of queries) {
    for (const category of categories) {
      for (const page of pageList) {
        urls.push({ url: nyaaSearchUrl(query, category, options.filter, page), query, category, page });
      }
    }
  }

  const items = await fetchInChunks(urls);
  return dedupeAndRank(items, intent, urls.length);
}

function refreshCachedSource(cacheKey: string, loader: () => Promise<SourceItem[]>, cached: SourceCacheEntry) {
  if (cached.refreshPromise) return;
  cached.refreshPromise = loader()
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
    const q = firstValue(req.query.q);
    const c = firstValue(req.query.c) || "1_2";
    const f = firstValue(req.query.f) || "0";
    const p = firstValue(req.query.p) || "1";
    const pages = Math.max(1, Math.min(Number(firstValue(req.query.pages) || 3) || 3, MAX_DEEP_PAGES));
    const deep = q ? firstValue(req.query.deep) !== "0" : false;
    const loader = () => fetchEnhancedResults({ query: q, category: c, filter: f, page: Number(p) || 1, pages, deep });
    const cacheKey = JSON.stringify({ q, c, f, p, pages, deep, version: 2 });
    const cached = sourceCache.get(cacheKey);
    const age = cached ? Date.now() - cached.fetchedAt : Number.POSITIVE_INFINITY;
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=480");

    if (cached && age < SOURCE_FRESH_MS) {
      res.setHeader("X-Source-Cache", "HIT");
      res.setHeader("X-Source-Fetched-At", String(cached.fetchedAt));
      res.setHeader("X-Source-Query-Count", String(cached.data[0]?.sourceQueryCount || 1));
      return res.json(cached.data);
    }

    if (cached && age < SOURCE_STALE_MS) {
      refreshCachedSource(cacheKey, loader, cached);
      res.setHeader("X-Source-Cache", "STALE");
      res.setHeader("X-Source-Fetched-At", String(cached.fetchedAt));
      res.setHeader("X-Source-Query-Count", String(cached.data[0]?.sourceQueryCount || 1));
      return res.json(cached.data);
    }

    const formattedItems = await loader();
    const fetchedAt = Date.now();
    sourceCache.set(cacheKey, { data: formattedItems, fetchedAt });
    res.setHeader("X-Source-Cache", "MISS");
    res.setHeader("X-Source-Fetched-At", String(fetchedAt));
    res.setHeader("X-Source-Query-Count", String(formattedItems[0]?.sourceQueryCount || 1));
    res.json(formattedItems);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
