import { MAL_METADATA_BASE_URL, supportedMalMetadataPath } from '../src/lib/malMetadataProvider.js';
import { RequestUsage, publicFreshness } from './_shared/requestReuse.js';
import { publicCalendar } from './_shared/publicCalendar.js';
const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_URL = MAL_METADATA_BASE_URL;
class UpstreamMetadataError extends Error { constructor(message: string, readonly status: number, readonly retryAfter?: string | null) { super(message); } }
const TMDB_URL = 'https://api.themoviedb.org/3';
const ANIME_SCHEDULE_URL = 'https://animeschedule.net/api/v3';
const ANIDB_URL = 'https://api.anidb.net:9001/httpapi';
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 604800;
const STALE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_METADATA_CACHE_ENTRIES = 300;
const PROVIDER_DISABLED_TTL_SECONDS = 3600;

type CacheEntry = {
  savedAt: number;
  value: unknown;
};

const metadataCache = new Map<string, CacheEntry>();
const inFlightMetadataCache = new Map<string, Promise<CacheEntry>>();

function ttlFromRequest(req: any) {
  const raw = Array.isArray(req.query.ttl) ? req.query.ttl[0] : req.query.ttl;
  const parsed = Number(raw || 21600);
  if (!Number.isFinite(parsed)) return 21600;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(parsed)));
}

function sendCached(req: any, res: any, value: unknown, ttlSeconds: number, cacheState: string, fetchedAt: number, usage: RequestUsage) {
  // GraphQL POSTs are body-keyed in memory only, never cached by their URL.
  publicFreshness(res, fetchedAt, ttlSeconds, req.method === 'GET' && cacheState !== 'STALE');
  res.setHeader('X-StreamNyaa-Metadata-Cache', cacheState);
  res.setHeader('X-StreamNyaa-Fetched-At', String(fetchedAt));
  usage.cache = cacheState;
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

async function cachedJson(cacheKey: string, ttlSeconds: number, fetcher: () => Promise<unknown>, usage: RequestUsage) {
  const now = Date.now();
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.savedAt + ttlSeconds * 1000 > now) return { value: cached.value, state: 'HIT', fetchedAt: cached.savedAt, ttlSeconds };
  const stale = cached && now - cached.savedAt <= STALE_TTL_MS ? cached : null;
  const inFlight = inFlightMetadataCache.get(cacheKey);
  if (inFlight) {
    try {
      usage.coalesced++;
      const entry = await inFlight;
      return { value: entry.value, state: 'COALESCED', fetchedAt: entry.savedAt, ttlSeconds };
    } catch (error) {
      if (stale) return { value: stale.value, state: 'STALE', fetchedAt: stale.savedAt, ttlSeconds };
      throw error;
    }
  }

  const nextRequest = fetcher().then(value => ({ value, savedAt: now }));
  inFlightMetadataCache.set(cacheKey, nextRequest);
  try {
    const entry = await nextRequest;
    metadataCache.set(cacheKey, entry);
    if (metadataCache.size > MAX_METADATA_CACHE_ENTRIES) {
      [...metadataCache.entries()]
        .sort((left, right) => left[1].savedAt - right[1].savedAt)
        .slice(0, metadataCache.size - MAX_METADATA_CACHE_ENTRIES)
        .forEach(([key]) => metadataCache.delete(key));
    }
    return { value: entry.value, state: 'MISS', fetchedAt: entry.savedAt, ttlSeconds };
  } catch (error) {
    if (stale) return { value: stale.value, state: 'STALE', fetchedAt: stale.savedAt, ttlSeconds };
    throw error;
  } finally {
    if (inFlightMetadataCache.get(cacheKey) === nextRequest) {
      inFlightMetadataCache.delete(cacheKey);
    }
  }
}

async function fetchAniList(req: any, ttlSeconds: number, usage: RequestUsage) {
  const body = await readBody(req);
  if (!body?.query || typeof body.query !== 'string') throw new UpstreamMetadataError('AniList query is required.', 400);

  return cachedJson(`anilist:v2:${JSON.stringify(body)}`, ttlSeconds, async () => {
    const response = await usage.fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.errors?.length) {
      throw new UpstreamMetadataError(data?.errors?.[0]?.message || `AniList returned ${response.status}`, response.ok ? 502 : response.status, response.headers.get('retry-after'));
    }
    if (!data?.data) throw new UpstreamMetadataError('AniList returned an incomplete response.', 502);
    return data;
  }, usage);
}

async function fetchJikan(req: any, ttlSeconds: number, usage: RequestUsage) {
  const path = supportedMalMetadataPath(Array.isArray(req.query.path) ? req.query.path[0] : req.query.path);
  if (!path) throw new UpstreamMetadataError('Unsupported metadata path.', 501);

  return cachedJson(`tenrai:v2:${path}`, ttlSeconds, async () => {
    const response = await usage.fetch(`${JIKAN_URL}${path}`, {
      // Leave room for the desktop's eight-second HTTP bound to receive a
      // cached response or an actionable error instead of another silent timeout.
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json', 'User-Agent': 'StreamNyaa Metadata Cache/1.0' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new UpstreamMetadataError(data?.message || `Metadata provider returned ${response.status}`, response.status, response.headers.get('Retry-After'));
    }
    if (!data || !('data' in data)) throw new UpstreamMetadataError('Invalid metadata response.', 502);
    return data;
  }, usage);
}

async function fetchTmdb(req: any, ttlSeconds: number, usage: RequestUsage) {
  const path = safeProviderPath(queryValue(req, 'path'));
  if (!path) throw new Error('Valid TMDB path is required.');

  const bearerToken = envValue('TMDB_BEARER_TOKEN', 'TMDB_READ_ACCESS_TOKEN');
  const apiKey = envValue('TMDB_API_KEY');
  if (!bearerToken && !apiKey) {
    return cachedJson('tmdb:disabled', PROVIDER_DISABLED_TTL_SECONDS, async () => disabledProvider(
      'tmdb',
      'TMDB is not configured. Add TMDB_BEARER_TOKEN or TMDB_API_KEY to enable poster and backdrop enrichment.',
    ), usage);
  }

  return cachedJson(`tmdb:${path}`, ttlSeconds, async () => {
    const url = new URL(`${TMDB_URL}${path}`);
    if (!bearerToken && apiKey && !url.searchParams.has('api_key')) {
      url.searchParams.set('api_key', apiKey);
    }
    const response = await usage.fetch(url, {
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
  }, usage);
}

async function fetchAnimeSchedule(req: any, ttlSeconds: number, usage: RequestUsage) {
  const path = safeProviderPath(queryValue(req, 'path'));
  if (!path || !/^\/(?:anime(?:\/[a-z0-9-]+)?|timetables\/(?:all|raw|sub|dub))(?:\?|$)/i.test(path)) throw new Error('Valid public AnimeSchedule metadata path is required.');

  return cachedJson(`animeschedule:${path}`, ttlSeconds, async () => {
    const token = envValue('ANIMESCHEDULE_TOKEN', 'ANIMESCHEDULE_API_TOKEN');
    if (!token) throw new Error('AnimeSchedule application token is not configured on the metadata server.');
    const response = await usage.fetch(`${ANIME_SCHEDULE_URL}${path}`, {
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'StreamNyaa Metadata Cache/1.0',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`AnimeSchedule returned HTTP ${response.status}.`);
    const text = await response.text();
    if (!text.trim()) throw new Error('AnimeSchedule returned an empty response.');
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new Error('AnimeSchedule returned invalid JSON.'); }
    return data;
  }, usage);
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

async function fetchAniDb(req: any, ttlSeconds: number, usage: RequestUsage) {
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
    ), usage);
  }

  return cachedJson(`anidb:${request}:${aid}`, ttlSeconds, async () => {
    const url = new URL(ANIDB_URL);
    url.searchParams.set('request', request);
    url.searchParams.set('client', client);
    url.searchParams.set('clientver', clientVersion);
    url.searchParams.set('protover', '1');
    url.searchParams.set('aid', String(aid));

    const response = await usage.fetch(url, {
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
  }, usage);
}

export default async function handler(req: any, res: any) {
  const usage = new RequestUsage(req, 'stream-sources');
  let status = 200;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const provider = Array.isArray(req.query.provider) ? req.query.provider[0] : req.query.provider;
  const ttlSeconds = ttlFromRequest(req);

  try {
    if (provider === 'calendar') {
      if(req.method!=='GET'){status=405;return res.status(status).json({error:'Calendar requires GET.'});}
      const calendar=await publicCalendar(req,usage);
      res.setHeader('X-StreamNyaa-Fetched-At',String(calendar.fetchedAt));
      res.setHeader('X-StreamNyaa-Provider','calendar');
      publicFreshness(res,calendar.fetchedAt,Math.min(ttlSeconds,180),!calendar.stale&&!calendar.cursor);
      return res.status(200).json(calendar);
    }
    if (provider === 'anilist') {
      if (req.method !== 'POST') { status = 405; return res.status(status).json({ error: 'AniList cache requires POST.' }); }
      const result = await fetchAniList(req, ttlSeconds, usage);
      return sendCached(req, res, result.value, result.ttlSeconds, result.state, result.fetchedAt, usage);
    }

    if (provider === 'tenrai' || provider === 'jikan') {
      if (req.method !== 'GET') { status = 405; return res.status(status).json({ error: 'Metadata cache requires GET.' }); }
      const result = await fetchJikan(req, ttlSeconds, usage);
      res.setHeader('X-StreamNyaa-Fetched-At', String(result.fetchedAt));
      res.setHeader('X-StreamNyaa-Provider', 'tenrai');
      return sendCached(req, res, { ...result.value as Record<string, unknown>, streamnyaa: { provider: 'tenrai', adapterVersion: 1, fetchedAt: result.fetchedAt, stale: result.state === 'STALE' } }, result.ttlSeconds, result.state, result.fetchedAt, usage);
    }

    if (provider === 'tmdb') {
      if (req.method !== 'GET') { status = 405; return res.status(status).json({ error: 'TMDB cache requires GET.' }); }
      const result = await fetchTmdb(req, ttlSeconds, usage);
      return sendCached(req, res, result.value, result.ttlSeconds, result.state, result.fetchedAt, usage);
    }

    if (provider === 'animeschedule') {
      if (req.method !== 'GET') { status = 405; return res.status(status).json({ error: 'AnimeSchedule cache requires GET.' }); }
      const result = await fetchAnimeSchedule(req, ttlSeconds, usage);
      return sendCached(req, res, { data: result.value, streamnyaa: { fetchedAt: result.fetchedAt, stale: result.state === 'STALE' } }, result.ttlSeconds, result.state, result.fetchedAt, usage);
    }

    if (provider === 'anidb') {
      if (req.method !== 'GET') { status = 405; return res.status(status).json({ error: 'AniDB cache requires GET.' }); }
      const result = await fetchAniDb(req, ttlSeconds, usage);
      return sendCached(req, res, result.value, result.ttlSeconds, result.state, result.fetchedAt, usage);
    }

    status = 400; return res.status(status).json({ error: 'Unsupported metadata provider.' });
  } catch (error: any) {
    if (error instanceof UpstreamMetadataError) {
      status = error.status;
      if (error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
      return res.status(error.status).json({error:error.message, provider:provider === 'jikan' ? 'tenrai' : provider, retryable:error.status === 429 || error.status >= 500 && error.status !== 501});
    }
    status = Number(error?.status)||500;
    if(error?.retryAt)res.setHeader('Retry-After',String(Math.max(1,Math.ceil((error.retryAt-Date.now())/1000))));
    return res.status(status).json({ error: error?.message || 'Metadata cache failed.', retryAt:error?.retryAt });
  } finally {
    usage.finish(status);
  }
}
