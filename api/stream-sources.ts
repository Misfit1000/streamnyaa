const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_URL = 'https://api.jikan.moe/v4';
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 86400;

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const metadataCache = new Map<string, CacheEntry>();

function ttlFromRequest(req: any) {
  const raw = Array.isArray(req.query.ttl) ? req.query.ttl[0] : req.query.ttl;
  const parsed = Number(raw || 21600);
  if (!Number.isFinite(parsed)) return 21600;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(parsed)));
}

function sendCached(res: any, value: unknown, ttlSeconds: number, cacheState: string) {
  res.setHeader('Cache-Control', `public, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds}`);
  res.setHeader('X-StreamNyaa-Metadata-Cache', cacheState);
  return res.status(200).json(value);
}

async function readBody(req: any) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text.trim() ? JSON.parse(text) : {};
}

function safeJikanPath(value: unknown) {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.includes('://') || path.includes('..')) return '';
  return path;
}

async function cachedJson(cacheKey: string, ttlSeconds: number, fetcher: () => Promise<unknown>) {
  const now = Date.now();
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return { value: cached.value, state: 'HIT' };

  const value = await fetcher();
  metadataCache.set(cacheKey, { value, expiresAt: now + ttlSeconds * 1000 });
  return { value, state: 'MISS' };
}

async function fetchAniList(req: any, ttlSeconds: number) {
  const body = await readBody(req);
  if (!body?.query || typeof body.query !== 'string') throw new Error('AniList query is required.');

  return cachedJson(`anilist:${JSON.stringify(body)}`, ttlSeconds, async () => {
    const response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      return { errors: data?.errors || [{ message: `AniList returned ${response.status}` }] };
    }
    return data;
  });
}

async function fetchJikan(req: any, ttlSeconds: number) {
  const path = safeJikanPath(Array.isArray(req.query.path) ? req.query.path[0] : req.query.path);
  if (!path) throw new Error('Valid Jikan path is required.');

  return cachedJson(`jikan:${path}`, ttlSeconds, async () => {
    const response = await fetch(`${JIKAN_URL}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'StreamNyaa Metadata Cache/1.0' },
    });
    const data = await response.json();
    if (!response.ok) {
      return { error: data?.message || `Jikan returned ${response.status}`, status: response.status };
    }
    return data;
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const provider = Array.isArray(req.query.provider) ? req.query.provider[0] : req.query.provider;
  const ttlSeconds = ttlFromRequest(req);

  try {
    if (provider === 'anilist') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'AniList cache requires POST.' });
      const result = await fetchAniList(req, ttlSeconds);
      return sendCached(res, result.value, ttlSeconds, result.state);
    }

    if (provider === 'jikan') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Jikan cache requires GET.' });
      const result = await fetchJikan(req, ttlSeconds);
      return sendCached(res, result.value, ttlSeconds, result.state);
    }

    return res.status(400).json({ error: 'Unsupported metadata provider.' });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Metadata cache failed.' });
  }
}
