const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_URL = 'https://api.jikan.moe/v4';
const TMDB_URL = 'https://api.themoviedb.org/3';
const ANIME_SCHEDULE_URL = 'https://animeschedule.net/api/v3';
const ANIDB_URL = 'https://api.anidb.net:9001/httpapi';
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 604800;
const STALE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_METADATA_CACHE_ENTRIES = 300;
const PROVIDER_DISABLED_TTL_SECONDS = 3600;

type CacheEntry = {
  expiresAt: number;
  savedAt: number;
  value: unknown;
};

const metadataCache = new Map<string, CacheEntry>();
const inFlightMetadataCache = new Map<string, Promise<unknown>>();

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

function safeProviderPath(value: unknown) {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.includes('://') || path.includes('..') || path.includes('\\')) return '';
  if (!/^\/[a-z0-9/_?=&.,:%+\-[\]]*$/i.test(path)) return '';
  return path;
}

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function disabledProvider(provider: string, reason: string) {
  return {
    provider,
    disabled: true,
    reason,
  };
}

function queryValue(req: any, key: string) {
  const raw = req.query?.[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

async function cachedJson(cacheKey: string, ttlSeconds: number, fetcher: () => Promise<unknown>) {
  const now = Date.now();
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return { value: cached.value, state: 'HIT' };
  const stale = cached && now - cached.savedAt <= STALE_TTL_MS ? cached : null;
  const inFlight = inFlightMetadataCache.get(cacheKey);
  if (inFlight) {
    try {
      return { value: await inFlight, state: 'COALESCED' };
    } catch (error) {
      if (stale) return { value: stale.value, state: 'STALE' };
      throw error;
    }
  }

  const nextRequest = fetcher();
  inFlightMetadataCache.set(cacheKey, nextRequest);
  try {
    const value = await nextRequest;
    metadataCache.set(cacheKey, { value, expiresAt: now + ttlSeconds * 1000, savedAt: now });
    if (metadataCache.size > MAX_METADATA_CACHE_ENTRIES) {
      [...metadataCache.entries()]
        .sort((left, right) => left[1].savedAt - right[1].savedAt)
        .slice(0, metadataCache.size - MAX_METADATA_CACHE_ENTRIES)
        .forEach(([key]) => metadataCache.delete(key));
    }
    return { value, state: 'MISS' };
  } catch (error) {
    if (stale) return { value: stale.value, state: 'STALE' };
    throw error;
  } finally {
    if (inFlightMetadataCache.get(cacheKey) === nextRequest) {
      inFlightMetadataCache.delete(cacheKey);
    }
  }
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
      throw new Error(data?.errors?.[0]?.message || `AniList returned ${response.status}`);
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
      throw new Error(data?.message || `Jikan returned ${response.status}`);
    }
    return data;
  });
}

async function fetchTmdb(req: any, ttlSeconds: number) {
  const path = safeProviderPath(queryValue(req, 'path'));
  if (!path) throw new Error('Valid TMDB path is required.');

  const bearerToken = envValue('TMDB_BEARER_TOKEN', 'TMDB_READ_ACCESS_TOKEN');
  const apiKey = envValue('TMDB_API_KEY');
  if (!bearerToken && !apiKey) {
    return cachedJson('tmdb:disabled', PROVIDER_DISABLED_TTL_SECONDS, async () => disabledProvider(
      'tmdb',
      'TMDB is not configured. Add TMDB_BEARER_TOKEN or TMDB_API_KEY to enable poster and backdrop enrichment.',
    ));
  }

  return cachedJson(`tmdb:${path}`, ttlSeconds, async () => {
    const url = new URL(`${TMDB_URL}${path}`);
    if (!bearerToken && apiKey && !url.searchParams.has('api_key')) {
      url.searchParams.set('api_key', apiKey);
    }
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.status_message || `TMDB returned ${response.status}`);
    }
    return data;
  });
}

async function fetchAnimeSchedule(req: any, ttlSeconds: number) {
  const path = safeProviderPath(queryValue(req, 'path'));
  if (!path) throw new Error('Valid AnimeSchedule path is required.');

  return cachedJson(`animeschedule:${path}`, ttlSeconds, async () => {
    const token = envValue('ANIMESCHEDULE_TOKEN', 'ANIMESCHEDULE_API_TOKEN');
    const response = await fetch(`${ANIME_SCHEDULE_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'StreamNyaa Metadata Cache/1.0',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || `AnimeSchedule returned ${response.status}`);
    }
    return data;
  });
}

function parseXmlTag(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseAniDbAnimeXml(xml: string) {
  const titles = [...xml.matchAll(/<title\b([^>]*)>([\s\S]*?)<\/title>/gi)].map((match) => {
    const attrs = match[1] || '';
    return {
      type: attrs.match(/\btype="([^"]+)"/i)?.[1] || '',
      lang: attrs.match(/\bxml:lang="([^"]+)"/i)?.[1] || '',
      title: decodeXml(match[2].replace(/<[^>]+>/g, '').trim()),
    };
  }).filter((title) => title.title);

  return {
    provider: 'anidb',
    titles,
    type: decodeXml(parseXmlTag(xml, 'type')),
    episode_count: Number(parseXmlTag(xml, 'episodecount')) || null,
    start_date: parseXmlTag(xml, 'startdate') || null,
    end_date: parseXmlTag(xml, 'enddate') || null,
    picture: parseXmlTag(xml, 'picture') || null,
    raw_xml: xml,
  };
}

async function fetchAniDb(req: any, ttlSeconds: number) {
  const request = String(queryValue(req, 'request') || 'anime').toLowerCase();
  const aid = Number.parseInt(String(queryValue(req, 'aid') || ''), 10);
  if (request !== 'anime' || !Number.isFinite(aid) || aid <= 0) {
    throw new Error('AniDB currently requires request=anime and a valid aid.');
  }

  const client = envValue('ANIDB_CLIENT');
  const clientVersion = envValue('ANIDB_CLIENT_VERSION', 'ANIDB_CLIENTVER');
  if (!client || !clientVersion) {
    return cachedJson('anidb:disabled', PROVIDER_DISABLED_TTL_SECONDS, async () => disabledProvider(
      'anidb',
      'AniDB is not configured. Register an AniDB HTTP API client and set ANIDB_CLIENT plus ANIDB_CLIENT_VERSION.',
    ));
  }

  return cachedJson(`anidb:${request}:${aid}`, ttlSeconds, async () => {
    const url = new URL(ANIDB_URL);
    url.searchParams.set('request', request);
    url.searchParams.set('client', client);
    url.searchParams.set('clientver', clientVersion);
    url.searchParams.set('protover', '1');
    url.searchParams.set('aid', String(aid));

    const response = await fetch(url, {
      headers: { Accept: 'application/xml,text/xml,*/*', 'User-Agent': 'StreamNyaa Metadata Cache/1.0' },
    });
    const xml = await response.text();
    if (!response.ok) {
      throw new Error(`AniDB returned ${response.status}`);
    }
    if (/^\s*<error\b/i.test(xml)) {
      throw new Error(decodeXml(parseXmlTag(xml, 'error') || 'AniDB returned an error.'));
    }
    return parseAniDbAnimeXml(xml);
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

    if (provider === 'tmdb') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'TMDB cache requires GET.' });
      const result = await fetchTmdb(req, ttlSeconds);
      return sendCached(res, result.value, ttlSeconds, result.state);
    }

    if (provider === 'animeschedule') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'AnimeSchedule cache requires GET.' });
      const result = await fetchAnimeSchedule(req, ttlSeconds);
      return sendCached(res, result.value, ttlSeconds, result.state);
    }

    if (provider === 'anidb') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'AniDB cache requires GET.' });
      const result = await fetchAniDb(req, ttlSeconds);
      return sendCached(res, result.value, ttlSeconds, result.state);
    }

    return res.status(400).json({ error: 'Unsupported metadata provider.' });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Metadata cache failed.' });
  }
}
