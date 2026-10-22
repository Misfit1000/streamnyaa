import { MAL_METADATA_BASE_URL, MAL_METADATA_ADAPTER_VERSION, supportedMalMetadataPath } from '../lib/malMetadataProvider';
import { recentFeedBound, recentHomeQuery, validRecentSchedules } from './desktopRecentSchedule';
import { useStore } from '../store/useStore';
import { enrichDesktopScheduleRevisions } from '../lib/scheduleRevisions';
import { extractNumericId } from '../lib/slug';
import { fetchDesktopMetadataApi, isDesktopApp } from '../lib/desktop';
import { desktopDataError, DesktopDataError, isDesktopAdmissionWait } from '../lib/desktopData';
import { readEpisodePage, saveEpisodePage } from '../lib/desktopEpisodeCache';
import type { DesktopRequestOptions } from '../lib/desktopRequests';
import { sharedPublicResponse } from '../lib/publicBrowserCache';

const ANILIST_URL = 'https://graphql.anilist.co';
const LOCAL_METADATA_PREFIX = 'streamnyaa.metadataCache.v2.';
const LEGACY_METADATA_PREFIXES = ['streamnyaa.metadataCache.'];
const LOCAL_METADATA_LIMIT = 90;
const LOCAL_METADATA_MAX_STALE_MS = 1000 * 60 * 60 * 24 * 7;
const PROVIDER_COOLDOWN_FALLBACK_MS = 1000 * 60;

type MetadataProvider = 'anilist' | 'tenrai' | 'anidb' | 'animeschedule' | 'tmdb';

type MetadataCacheEntry = {
  value: unknown;
  expiresAt: number;
  savedAt: number;
};

const memoryMetadataCache = new Map<string, MetadataCacheEntry>();
const providerCooldowns = new Map<MetadataProvider, number>();
const desktopProviderFailures = new Map<MetadataProvider, { until: number; error: ReturnType<typeof desktopDataError> }>();
const desktopRequestFailures = new Map<string, { until: number; error: ReturnType<typeof desktopDataError> }>();
const pendingMetadataWrites = new Map<string, MetadataCacheEntry>();
const providerRecoveryFlights = new Map<MetadataProvider, Promise<unknown>>();
let metadataPersistTimer: number | undefined;

const hashCacheKey = (input: string) => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

const cacheKeyFor = (provider: MetadataProvider, value: unknown) => {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return `${LOCAL_METADATA_PREFIX}${provider}.${hashCacheKey(serialized)}`;
};

const staleMetadataResponse = (response: Response) => response.headers.get('X-StreamNyaa-Local-Cache') === 'local-stale'
  || response.headers.get('X-StreamNyaa-Desktop-Cache') === 'stale' || response.headers.get('X-StreamNyaa-Metadata-Cache') === 'STALE';
const metadataState = (response: Response) => ({
  status: staleMetadataResponse(response) ? 'stale' : 'authoritative',
  fetchedAt: Number(response.headers.get('X-StreamNyaa-Fetched-At')) || Date.now(),
  retryAt: Number(response.headers.get('X-StreamNyaa-Retry-At')) || undefined,
});
const jsonResponse = (value: unknown, cacheState: 'local-hit' | 'local-stale', fetchedAt?: number, retryAt?: number) => new Response(JSON.stringify(value), {
  status: 200,
  headers: {
    'Content-Type': 'application/json',
    'X-StreamNyaa-Local-Cache': cacheState,
    ...(fetchedAt ? {'X-StreamNyaa-Fetched-At': String(fetchedAt)} : {}),
    ...(retryAt ? {'X-StreamNyaa-Retry-At': String(retryAt)} : {}),
  },
});

export const isValidDesktopMetadataPayload = (provider: MetadataProvider, value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (provider === 'anilist') {
    return Boolean(record.data && typeof record.data === 'object' && !Array.isArray(record.data))
      && (!Array.isArray(record.errors) || record.errors.length === 0);
  }
  if (provider === 'tenrai') {
    return Object.prototype.hasOwnProperty.call(record, 'data')
      && (Array.isArray(record.data) || Boolean(record.data && typeof record.data === 'object'));
  }
  return true;
};

const readValidatedMetadataJson = async (provider: MetadataProvider, response: Response) => {
  let json: unknown;
  try {
    json = await response.clone().json();
  } catch (error) {
    throw desktopDataError(provider, error);
  }
  if (!isValidDesktopMetadataPayload(provider, json)) {
    throw desktopDataError(provider, new Error('The metadata response had an invalid shape.'));
  }
  return json;
};



const pruneLocalMetadataCache = () => {
  if (typeof window === 'undefined') return;
  try {
    Object.keys(localStorage)
.filter((key) => !key.startsWith(LOCAL_METADATA_PREFIX) && LEGACY_METADATA_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => localStorage.removeItem(key));

    const entries = Object.keys(localStorage)
      .filter((key) => key.startsWith(LOCAL_METADATA_PREFIX))
      .map((key) => {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || '{}') as Partial<MetadataCacheEntry>;
          return { key, savedAt: Number(parsed.savedAt || 0) };
        } catch {
          return { key, savedAt: 0 };
        }
      })
      .sort((a, b) => b.savedAt - a.savedAt);

    entries.slice(LOCAL_METADATA_LIMIT).forEach(({ key }) => {
      localStorage.removeItem(key);
      memoryMetadataCache.delete(key);
    });
  } catch {
    // Cache pruning is best-effort only.
  }
};

const titleHintFromRoute = (id: string) => {
  const hint = String(id || '')
    .replace(/^\d+-?/, '')
    .replace(/-/g, ' ')
    .trim();
  return hint || '';
};

const toPositiveInt = (value: unknown): number | null => {
  const numeric = Number.parseInt(extractNumericId(String(value ?? '')), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const cleanTitleForMatch = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-zA-Z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const seasonNumberFromRouteTitle = (value = '') => {
  const match = value.match(/\bseason\s+(\d{1,2})\b/i)
    || value.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i)
    || value.match(/\bpart\s+(\d{1,2})\b/i)
    || value.match(/\bcour\s+(\d{1,2})\b/i);
  const number = Number(match?.[1] || 0);
  return number > 0 ? number : null;
};

const stripSeasonDecoratorsForMatch = (value = '') => cleanTitleForMatch(
  value
    .replace(/\bseason\s+\d{1,2}\b/ig, ' ')
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\s+season\b/ig, ' ')
    .replace(/\bpart\s+\d{1,2}\b/ig, ' ')
    .replace(/\bcour\s+\d{1,2}\b/ig, ' ')
    .replace(/\bfinal\s+season\b/ig, ' ')
    .replace(/\(\d{4}\)/g, ' ')
);

const preferredFormatFromRouteTitle = (value = '') => {
  if (/\bova\b/i.test(value)) return 'OVA';
  if (/\bona\b/i.test(value)) return 'ONA';
  if (/\bspecial\b/i.test(value)) return 'SPECIAL';
  if (/\b(movie|film)\b/i.test(value)) return 'MOVIE';
  return 'TV';
};

const titleMatchScore = (routeTitle: string, media: any) => {
  const normalizedRoute = cleanTitleForMatch(routeTitle);
  const strippedRoute = stripSeasonDecoratorsForMatch(routeTitle);
  const routeTokens = strippedRoute.split(' ').filter((token) => token.length > 2);
  const routeSeason = seasonNumberFromRouteTitle(routeTitle);
  const preferredFormat = preferredFormatFromRouteTitle(routeTitle);
  const titles = [
    media?.title?.english,
    media?.title?.romaji,
    media?.title?.native,
  ].filter(Boolean).map((title) => String(title));

  let score = 0;
  for (const title of titles) {
    const normalizedTitle = cleanTitleForMatch(title);
    const strippedTitle = stripSeasonDecoratorsForMatch(title);
    if (normalizedTitle === normalizedRoute) score += 120;
    if (strippedTitle === strippedRoute) score += 90;
    if (normalizedTitle.includes(normalizedRoute) || normalizedRoute.includes(normalizedTitle)) score += 40;
    if (strippedTitle.includes(strippedRoute) || strippedRoute.includes(strippedTitle)) score += 28;

    if (routeTokens.length) {
      const hits = routeTokens.filter((token) => strippedTitle.includes(token)).length;
      score += Math.round((hits / routeTokens.length) * 36);
    }

    const titleSeason = seasonNumberFromRouteTitle(title);
    if (routeSeason && titleSeason === routeSeason) score += 30;
  }

  if ((media?.format || '').toUpperCase() === preferredFormat) score += 20;
  if (preferredFormat === 'TV' && (media?.format || '').toUpperCase() === 'TV_SHORT') score += 12;
  if (media?.idMal) score += 6;
  if (media?.popularity) score += Math.min(12, Math.round(Number(media.popularity) / 50000));
  return score;
};

const readLocalMetadata = (key: string, allowStale = false, maxAgeMs = Infinity) => {
  const now = Date.now();
  const memoryEntry = memoryMetadataCache.get(key);
  if (memoryEntry) {
    if (memoryEntry.expiresAt > now && memoryEntry.savedAt+maxAgeMs>now) return memoryEntry;
    if (allowStale && now - Number(memoryEntry.savedAt || 0) <= LOCAL_METADATA_MAX_STALE_MS) return memoryEntry;
  }

  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MetadataCacheEntry;
    if (!parsed || !Number.isFinite(parsed.expiresAt) || !Number.isFinite(parsed.savedAt) || parsed.savedAt > now + 60_000
      || !isValidDesktopMetadataPayload(key.split('.')[3] as MetadataProvider, parsed.value)) return null;
    if (parsed.expiresAt <= now || parsed.savedAt+maxAgeMs<=now) {
      if (now - Number(parsed.savedAt || 0) > LOCAL_METADATA_MAX_STALE_MS) return null;
      if (!allowStale) return null;
    }
    memoryMetadataCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
};

const flushPendingMetadataWrites = () => {
  if (typeof window === 'undefined' || !pendingMetadataWrites.size) return;
  const entries = [...pendingMetadataWrites.entries()];
  pendingMetadataWrites.clear();
  try {
    entries.forEach(([key, entry]) => localStorage.setItem(key, JSON.stringify(entry)));
    pruneLocalMetadataCache();
  } catch {
    // The memory cache remains authoritative for this session.
  }
};

const scheduleMetadataPersistence = () => {
  if (typeof window === 'undefined') return;
  if (metadataPersistTimer !== undefined) window.clearTimeout(metadataPersistTimer);
  metadataPersistTimer = window.setTimeout(() => {
    metadataPersistTimer = undefined;
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
    if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(flushPendingMetadataWrites, { timeout: 2_000 });
    else flushPendingMetadataWrites();
  }, 700);
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingMetadataWrites);
}

const writeLocalMetadata = (key: string, value: unknown, ttlSeconds: number, fetchedAt = Date.now()) => {
  const boundedTtlSeconds = Math.max(60, Math.min(60 * 60 * 24 * 30, Math.floor(ttlSeconds || 0)));
  const entry: MetadataCacheEntry = {
    value,
    expiresAt: fetchedAt + boundedTtlSeconds * 1000,
    savedAt: fetchedAt,
  };
  memoryMetadataCache.set(key, entry);

  if (typeof window === 'undefined') return;
  pendingMetadataWrites.set(key, entry);
  scheduleMetadataPersistence();
};

const providerInCooldown = (provider: MetadataProvider) => {
  const until = providerCooldowns.get(provider) || 0;
  if (until <= Date.now()) {
    providerCooldowns.delete(provider);
    return false;
  }
  return true;
};

const markProviderCooldown = (provider: MetadataProvider, response?: Response | null) => {
  const retryAfter = Number(response?.headers?.get?.('Retry-After') || 0);
  const cooldownMs = Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1000
    : PROVIDER_COOLDOWN_FALLBACK_MS;
  providerCooldowns.set(provider, Date.now() + cooldownMs);
};

const fetchWithLocalMetadataCache = async (
  provider: MetadataProvider,
  key: string,
  ttlSeconds: number,
  request: (signal?:AbortSignal) => Promise<Response>,
  signal?:AbortSignal,
) => {
  const cached = readLocalMetadata(key,false,ttlSeconds*1000);
  if (cached) return jsonResponse(cached.value, 'local-hit', cached.savedAt);
  const stale = readLocalMetadata(key, true);
  const providerFailure = desktopProviderFailures.get(provider);
  const recentFailure = isDesktopApp() ? (providerFailure && providerFailure.until > Date.now()
    ? providerFailure : desktopRequestFailures.get(key)) : undefined;
  if (recentFailure && recentFailure.until > Date.now()) {
    if (stale) return jsonResponse(stale.value, 'local-stale', stale.savedAt, recentFailure.until);
    throw recentFailure.error;
  }
  if (stale && providerInCooldown(provider)) return jsonResponse(stale.value, 'local-stale', stale.savedAt);

  // Only one expired-cooldown request probes the provider; other consumers wait
  // for its result rather than issuing a simultaneous recovery burst.
  const recovery = providerRecoveryFlights.get(provider);
  if (isDesktopApp() && providerFailure && recovery) {
    await recovery.catch(() => undefined);
    const failed = desktopProviderFailures.get(provider);
    if (failed && failed.until > Date.now()) {
      if (stale) return jsonResponse(stale.value, 'local-stale', stale.savedAt, failed.until);
      throw failed.error;
    }
  }

  const nextRequest = (async () => {
    const response = await (isDesktopApp()?request(signal):sharedPublicResponse(`metadata:${provider}:${key}`,ttlSeconds*1000,
      ownedSignal=>request(ownedSignal),signal,value=>isValidDesktopMetadataPayload(provider,value)&&!(value as any)?.disabled));
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) markProviderCooldown(provider, response);
      if (stale) return jsonResponse(stale.value, 'local-stale', stale.savedAt);
      const header = response.headers.get('retry-after') || '';
      const retryAt = /^\d+$/.test(header) ? Date.now() + Number(header) * 1000 : Date.parse(header) || undefined;
      throw new DesktopDataError({ provider, statusCode: response.status, origin: 'provider', retryAt,
        code: response.status === 429 ? 'rate-limited' : [401,403].includes(response.status) ? 'access-denied' : [400,404,501].includes(response.status) ? 'invalid' : 'error',
        retryable: response.status === 429 || response.status >= 500 && response.status !== 501,
        message: 'Anime information is temporarily unavailable. Please try again shortly.' });
    }

    const json = await readValidatedMetadataJson(provider, response);
    if (staleMetadataResponse(response)) return response;
    const fetchedAt = Number(response.headers.get('X-StreamNyaa-Fetched-At')) || Date.now();
    writeLocalMetadata(key, json, ttlSeconds, Math.min(Date.now(), fetchedAt));
    providerCooldowns.delete(provider);
    desktopProviderFailures.delete(provider);
    desktopRequestFailures.delete(key);
    return response;
  })();

  const ownsRecovery = isDesktopApp() && Boolean(providerFailure) && !providerRecoveryFlights.has(provider);
  if (ownsRecovery) providerRecoveryFlights.set(provider, nextRequest);


  try {
    return (await nextRequest).clone();
  } catch (error) {
    let failure = desktopDataError(provider, error);
    if (failure.code === 'cancelled') throw failure;
    if (isDesktopApp() && failure.code !== 'invalid' && !isDesktopAdmissionWait(failure)) {
      const wait = failure.code === 'access-denied' ? 300_000 : failure.code === 'rate-limited'
        ? Math.max(1000, Math.min(86_400_000, failure.retryAfterMs || 60_000)) : 30_000;
      const until = failure.retryAt ?? Date.now() + wait;
      failure = new DesktopDataError({ code:failure.code, provider:failure.provider, message:failure.message,
        retryable:failure.retryable, statusCode:failure.statusCode, origin:failure.origin,
        retryAt:until, retryAfterMs:Math.max(0, until-Date.now()) });
      if (failure.code === 'access-denied' || failure.code === 'rate-limited') {
        desktopProviderFailures.set(provider, { until, error: failure });
      } else {
        // A failed search must not disable working schedules, details and shelves.
        desktopRequestFailures.set(key, { until, error: failure });
        if (desktopRequestFailures.size > 500) desktopRequestFailures.delete(desktopRequestFailures.keys().next().value!);
      }
    }
    if (failure.code === 'rate-limited') providerCooldowns.set(provider, failure.retryAt ?? Date.now() + (failure.retryAfterMs || 60_000));
    if (stale) return jsonResponse(stale.value, 'local-stale', stale.savedAt, failure.retryAt);
    throw failure;
  } finally {
    if (ownsRecovery && providerRecoveryFlights.get(provider) === nextRequest) providerRecoveryFlights.delete(provider);
  }
};

const fetchAniListDirect = (body: Record<string, unknown>, signal?:AbortSignal) => fetch(ANILIST_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal,
});

export const fetchAniList = async (body: Record<string, unknown>, ttlSeconds = 21600, options: DesktopRequestOptions = {}) => {
  if (options.signal?.aborted) throw desktopDataError('anilist', new DOMException('Cancelled', 'AbortError'));
  const cacheKey = cacheKeyFor('anilist', body);
  return fetchWithLocalMetadataCache('anilist', cacheKey, ttlSeconds, async ownedSignal => {
    if (isDesktopApp()) {
      const desktopResponse = await fetchDesktopMetadataApi({
        provider: 'anilist',
        body,
        ttl_seconds: ttlSeconds,
      }, options);
      return new Response(JSON.stringify(desktopResponse.data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-StreamNyaa-Desktop-Cache': desktopResponse.cache_status || 'bridge',
          'X-StreamNyaa-Fetched-At': String(desktopResponse.fetched_at),
        },
      });
    }

    const timeout = AbortSignal.timeout(18_000);
    const gatewayResponse = await fetch(`/api/stream-sources?provider=anilist&ttl=${ttlSeconds}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ownedSignal ? AbortSignal.any([ownedSignal, timeout]) : timeout,
    });
    return gatewayResponse;
  },options.signal);
};

const fetchJikanPathDirect = (path: string, signal?: AbortSignal) => fetch(`${MAL_METADATA_BASE_URL}${path}`, { signal });

export const fetchJikanPath = async (path: string, ttlSeconds = 21600, options: DesktopRequestOptions = {}) => {
  if (options.signal?.aborted) throw desktopDataError('tenrai', new DOMException('Cancelled', 'AbortError'));
  const validPath = supportedMalMetadataPath(path);
  if (!validPath) throw new DesktopDataError({provider:'tenrai', code:'invalid', retryable:false, statusCode:501, message:'This metadata endpoint is unsupported.'});
  const cacheKey = cacheKeyFor('tenrai', `v${MAL_METADATA_ADAPTER_VERSION}:${validPath}`);
  return fetchWithLocalMetadataCache('tenrai', cacheKey, ttlSeconds, async ownedSignal => {
    if (isDesktopApp()) {
      const desktopResponse = await fetchDesktopMetadataApi({
        provider: 'tenrai',
        path,
        ttl_seconds: ttlSeconds,
      }, options);
      return new Response(JSON.stringify(desktopResponse.data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-StreamNyaa-Desktop-Cache': desktopResponse.cache_status || 'bridge',
          'X-StreamNyaa-Fetched-At': String(desktopResponse.fetched_at),
        },
      });
    }

    const gatewayResponse = await fetch(`/api/stream-sources?provider=tenrai&ttl=${ttlSeconds}&path=${encodeURIComponent(validPath)}`, { signal: ownedSignal }).catch(error => {if(ownedSignal?.aborted)throw error;return null;});
    if (gatewayResponse) return gatewayResponse;
    return fetchJikanPathDirect(validPath, ownedSignal);
  },options.signal);
};

/** Explicit transport name; fetchJikanPath remains a source-compatible wrapper. */
export const fetchTenraiPath = fetchJikanPath;

export const fetchMetadataProviderPath = async (
  provider: 'tmdb' | 'animeschedule',
  path: string,
  ttlSeconds = 21600,
) => {
  const cacheKey = cacheKeyFor(provider, path);
  return fetchWithLocalMetadataCache(provider, cacheKey, ttlSeconds, async () => {
    if (isDesktopApp()) {
      try {
        const desktopResponse = await fetchDesktopMetadataApi({
          provider,
          path,
          ttl_seconds: ttlSeconds,
        });
        return new Response(JSON.stringify(desktopResponse.data), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-StreamNyaa-Desktop-Cache': 'bridge',
          },
        });
      } catch {
        return new Response(JSON.stringify({
          provider,
          disabled: true,
          reason: `${provider} metadata is unavailable in this desktop runtime.`,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const gatewayResponse = await fetch(
      `/api/stream-sources?provider=${provider}&ttl=${ttlSeconds}&path=${encodeURIComponent(path)}`,
    ).catch(() => null);
    if (gatewayResponse?.ok) return gatewayResponse;
    return new Response(JSON.stringify({
      provider,
      disabled: true,
      reason: `${provider} metadata is unavailable in this runtime.`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
};

export const fetchAniDbAnimeMetadata = async (aid: number, ttlSeconds = 604800) => {
  const cacheKey = cacheKeyFor('anidb', { request: 'anime', aid });
  return fetchWithLocalMetadataCache('anidb', cacheKey, ttlSeconds, async () => {
    if (isDesktopApp()) {
      try {
        const desktopResponse = await fetchDesktopMetadataApi({
          provider: 'anidb',
          path: `/anime?aid=${encodeURIComponent(String(aid))}`,
          ttl_seconds: ttlSeconds,
        });
        return new Response(JSON.stringify(desktopResponse.data), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-StreamNyaa-Desktop-Cache': 'bridge',
          },
        });
      } catch {
        return new Response(JSON.stringify({
          provider: 'anidb',
          disabled: true,
          reason: 'AniDB metadata is unavailable in this desktop runtime.',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const gatewayResponse = await fetch(
      `/api/stream-sources?provider=anidb&ttl=${ttlSeconds}&request=anime&aid=${encodeURIComponent(String(aid))}`,
    ).catch(() => null);
    if (gatewayResponse?.ok) return gatewayResponse;
    return new Response(JSON.stringify({
      provider: 'anidb',
      disabled: true,
      reason: 'AniDB metadata is unavailable in this runtime.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
};

export const mapAnilistToJikan = (m: any) => ({
  metadataProvider: 'anilist',
  popularityKind: 'list-count',
  id: m.id,
  mal_id: m.idMal || null,
  anilist_id: m.id,
  ...(m.countryOfOrigin ? { countryOfOrigin: m.countryOfOrigin } : {}),
  title: m.title.english || m.title.romaji || m.title.native,
  title_romaji: m.title.romaji,
  title_english: m.title.english,
  title_native: m.title.native,
  synonyms: m.synonyms || [],
  images: { 
    jpg: { 
      image_url: m.coverImage?.large || m.coverImage?.extraLarge, 
      large_image_url: m.coverImage?.extraLarge || m.coverImage?.large 
    },
    webp: { 
      image_url: m.coverImage?.large || m.coverImage?.extraLarge, 
      large_image_url: m.coverImage?.extraLarge || m.coverImage?.large 
    }
  },
  banner_image: m.bannerImage,
  color: m.coverImage?.color,
  synopsis: (m.description || '').replace(/<[^>]*>?/gm, ''), // strip html tags
  episodes: m.episodes,
  status: m.status,
  score: m.averageScore ? m.averageScore / 10 : 0,
  popularity: m.popularity || null,
  rank: m.rank || null,
  scored_by: m.scored_by || null,
  type: m.format || 'TV',
  year: m.seasonYear,
  season: m.season,
  source: m.source,
  genres: (m.genres || []).map((g: string) => ({ name: g })),
  trailer: m.trailer?.site === 'youtube' ? {
    youtube_id: m.trailer.id,
    url: `https://youtube.com/watch?v=${m.trailer.id}`,
    embed_url: `https://youtube.com/embed/${m.trailer.id}`
  } : null,
  studios: m.studios?.nodes?.map((s: any) => ({ name: s.name })) || [],
  isAdult: m.isAdult || false,
  streamingEpisodes: m.streamingEpisodes || [],
  nextAiringEpisode: m.nextAiringEpisode,
  latestEpisode: m.latestEpisode || (m.nextAiringEpisode?.episode ? Math.max(0, Number(m.nextAiringEpisode.episode) - 1) : null),
  relations: m.relations?.edges?.map((edge: any) => ({
    relation: edge.relationType,
    entry: [
      {
        id: edge.node.id,
        anilist_id: edge.node.id,
        mal_id: edge.node.idMal || null,
        type: edge.node.type,
        format: edge.node.format,
        status: edge.node.status,
        episodes: edge.node.episodes,
        year: edge.node.seasonYear,
        startDate: edge.node.startDate,
        name: edge.node.title?.english || edge.node.title?.romaji || edge.node.title?.native,
        images: {
          jpg: {
            image_url: edge.node.coverImage?.large || edge.node.coverImage?.extraLarge,
            large_image_url: edge.node.coverImage?.extraLarge || edge.node.coverImage?.large
          }
        }
      }
    ]
  })) || [],
  recommendations: m.recommendations?.nodes?.map((node: any) => {
    const r = node.mediaRecommendation;
    if (!r) return null;
    return {
      id: r.id,
      anilist_id: r.id,
      mal_id: r.idMal || null,
      type: r.type,
      title: r.title?.english || r.title?.romaji || r.title?.native,
      title_romaji: r.title?.romaji,
      title_english: r.title?.english,
      images: {
        jpg: {
          image_url: r.coverImage?.large || r.coverImage?.extraLarge,
          large_image_url: r.coverImage?.extraLarge || r.coverImage?.large
        }
      }
    };
  }).filter((x: any) => x) || []
});

const mapJikanDetailToAnime = (item: any) => ({
  metadataProvider: 'tenrai',
  popularityKind: 'rank',
  id: item.mal_id,
  mal_id: item.mal_id,
  anilist_id: null,
  title: item.title_english || item.title || item.title_japanese,
  title_romaji: item.title,
  title_english: item.title_english,
  images: item.images || {
    jpg: {
      image_url: item.image_url || '',
      large_image_url: item.image_url || '',
    },
  },
  // A portrait cover is not a banner. Keeping it out of this field prevents
  // the desktop player from mistaking poster cards for cinematic loading art.
  banner_image: item.trailer?.images?.maximum_image_url || '',
  synopsis: item.synopsis || '',
  episodes: item.episodes,
  status: item.status,
  score: item.score || 0,
  popularity: item.popularity || null,
  rank: item.rank || null,
  scored_by: item.scored_by || null,
  type: item.type || 'TV',
  year: item.year || item.aired?.prop?.from?.year,
  genres: item.genres || [],
  trailer: item.trailer || null,
  studios: item.studios || [],
  isAdult: String(item.rating || '').toLowerCase().includes('hentai'),
  streamingEpisodes: [],
  nextAiringEpisode: null,
  relations: item.relations || [],
  recommendations: [],
});

const fetchJikanAnimeStats = async (malId: number) => {
  try {
    const res = await fetchJikanPath(`/anime/${malId}`, 21600);
    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.data;
    if (!item) return null;
    return {
      score: item.score || 0,
      popularity: item.popularity || null,
      rank: item.rank || null,
      scored_by: item.scored_by || null,
    };
  } catch {
    return null;
  }
};

export const fetchTopAiring = async (options: DesktopRequestOptions = {}) => {
  const isAdultArg = useStore.getState().nsfwMode ? '' : ', isAdult: false';
  const query = `
    query {
      Page(page: 1, perPage: 12) {
        media(type: ANIME, sort: SCORE_DESC, status: RELEASING${isAdultArg}) {
          id
          idMal
          title { romaji english native }
          synonyms
          description
          episodes
          status
          format
          season
          seasonYear
          source
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          popularity
          nextAiringEpisode { episode airingAt }
          isAdult
        }
      }
    }
  `;
  const res = await fetchAniList({ query }, 21600, options);
  if (!res.ok) throw new Error('Failed to fetch top airing anime');
  const data = await res.json();
  const rawData = data.data.Page.media.map(mapAnilistToJikan);
  return { streamnyaa: metadataState(res), data: rawData.filter((anime: any, index: number, self: any[]) => index === self.findIndex((a) => a.anilist_id === anime.anilist_id)) };
};

export const fetchRecentEpisodesWithLimit = async (limit = 12, options: DesktopRequestOptions = {}) => {
  const nsfwMode = useStore.getState().nsfwMode;
  const perPage = Math.max(12, Math.min(50, Math.ceil(limit)));
  const query = recentHomeQuery(perPage, recentFeedBound());
  const res = await fetchAniList({ query }, 300, options);
  if (!res.ok) throw new Error('Failed to fetch recent episodes');
  const data = await res.json();
  
  const rows = data?.data?.Page?.airingSchedules;
  if (data.errors?.length || !Array.isArray(rows)) throw new Error('Incomplete recent episode response.');
  let schedules = validRecentSchedules(rows, Math.floor(Date.now()/1000));
  if (!nsfwMode) {
    schedules = schedules.filter((s: any) => !s.media.isAdult);
  }
  
  const seen = new Set();
  schedules = schedules.filter((s: any) => {
    const id = s.media.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  
  return { streamnyaa: metadataState(res),
    data: schedules.slice(0, limit).map((schedule: any) => ({
      ...mapAnilistToJikan(schedule.media),
      latestEpisode: schedule.episode, airingAt: schedule.airingAt, recentFeedKind: 'aired'
    }))
  };
};

export const fetchUpcomingAnime = async (options: DesktopRequestOptions = {}) => {
  const isAdultArg = useStore.getState().nsfwMode ? '' : ', isAdult: false';
  const query = `
    query {
      Page(page: 1, perPage: 18) {
        media(type: ANIME, sort: TRENDING_DESC, status: NOT_YET_RELEASED${isAdultArg}) {
          id
          idMal
          title { romaji english native }
          synonyms
          description
          episodes
          status
          format
          season
          seasonYear
          source
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          popularity
          startDate { year month day }
          nextAiringEpisode { episode airingAt }
          isAdult
        }
      }
    }
  `;
  const res = await fetchAniList({ query }, 21600, options);
  if (!res.ok) throw new Error('Failed to fetch upcoming anime');
  const data = await res.json();
  const rawData = data.data.Page.media.map(mapAnilistToJikan);
  return { streamnyaa: metadataState(res), data: rawData.filter((anime: any, index: number, self: any[]) => index === self.findIndex((a) => a.anilist_id === anime.anilist_id)) };
};

export const fetchPopularAnime = async (options: DesktopRequestOptions = {}) => {
  const isAdultArg = useStore.getState().nsfwMode ? '' : ', isAdult: false';
  const query = `
    query {
      Page(page: 1, perPage: 18) {
        media(type: ANIME, sort: POPULARITY_DESC${isAdultArg}) {
          id
          idMal
          title { romaji english native }
          synonyms
          description
          episodes
          status
          format
          season
          seasonYear
          source
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          popularity
          nextAiringEpisode { episode airingAt }
          isAdult
        }
      }
    }
  `;
  const res = await fetchAniList({ query }, 21600, options);
  if (!res.ok) throw new Error('Failed to fetch popular anime');
  const data = await res.json();
  const rawData = data.data.Page.media.map(mapAnilistToJikan);
  return { streamnyaa: metadataState(res), data: rawData.filter((anime: any, index: number, self: any[]) => index === self.findIndex((a) => a.anilist_id === anime.anilist_id)) };
};

export const fetchSeasonalAnime = async () => {
  const isAdultArg = useStore.getState().nsfwMode ? '' : ', isAdult: false';
  const query = `
    query {
      Page(page: 1, perPage: 18) {
        media(type: ANIME, sort: TRENDING_DESC, status: RELEASING${isAdultArg}) {
          id
          idMal
          title { romaji english native }
          synonyms
          description
          episodes
          status
          format
          season
          seasonYear
          source
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          popularity
          nextAiringEpisode { episode airingAt }
          isAdult
        }
      }
    }
  `;
  const res = await fetchAniList({ query }, 900);
  if (!res.ok) throw new Error('Failed to fetch seasonal anime');
  const data = await res.json();
  const rawData = data.data.Page.media.map(mapAnilistToJikan);
  return { data: rawData.filter((anime: any, index: number, self: any[]) => index === self.findIndex((a) => a.anilist_id === anime.anilist_id)) };
};

type AnimeDetailsLookupOptions = DesktopRequestOptions & {
  anilistId?: string | number | null;
  malId?: string | number | null;
  routeTitle?: string | null;
};

const ANIME_DETAIL_SELECTION = `
  id
  idMal
  title { romaji english native }
  synonyms
  description
  episodes
  status
  format
  seasonYear
  coverImage { extraLarge large color } bannerImage
  genres
  averageScore
  trailer { id site thumbnail }
  studios { nodes { name } }
  isAdult
  nextAiringEpisode { episode airingAt }
  streamingEpisodes {
    title
    thumbnail
    url
    site
  }
  relations {
    edges {
      relationType
      node {
        id
        idMal
        type
        format
        status
        episodes
        seasonYear
        startDate { year month day }
        title { romaji english native }
        coverImage { extraLarge large color }
        bannerImage
      }
    }
  }
  recommendations(sort: RATING_DESC) {
    nodes {
      mediaRecommendation {
        id
        idMal
        type
        title { romaji english native }
        coverImage { extraLarge large color }
        bannerImage
      }
    }
  }
`;

const ANIME_DETAIL_QUERY_BY_MAL = `
  query($id: Int) {
    Media(idMal: $id, type: ANIME) {
      ${ANIME_DETAIL_SELECTION}
    }
  }
`;

const ANIME_DETAIL_QUERY_BY_ANILIST = `
  query($id: Int) {
    Media(id: $id, type: ANIME) {
      ${ANIME_DETAIL_SELECTION}
    }
  }
`;

export async function fetchAnimeInstallments(entries: any[], options: DesktopRequestOptions = {}) {
  const ids = [...new Set(entries.map(e => Number(e.anilist_id)).filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
  if (!ids.length) return [];
  const query = 'query($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { ' + ANIME_DETAIL_SELECTION + ' } } }';
  const response = await fetchAniList({ query, variables: { ids } }, 21600, options);
  const payload = await response.json();
  if (!Array.isArray(payload?.data?.Page?.media)) throw desktopDataError('anilist', new Error('Invalid timeline response.'));
  return payload.data.Page.media.filter((entry: any) => ids.includes(Number(entry?.id))).map(mapAnilistToJikan);
}

const ANIME_DETAIL_SEARCH_QUERY = `
  query($search: String) {
    Page(page: 1, perPage: 12) {
      media(type: ANIME, search: $search, sort: SEARCH_MATCH) {
        ${ANIME_DETAIL_SELECTION}
      }
    }
  }
`;

const animeDetailsCandidateScore = (
  media: any,
  {
    titleHint,
    preferredMalId,
    preferredAniListId,
    routeNumericId,
  }: {
    titleHint: string;
    preferredMalId: number | null;
    preferredAniListId: number | null;
    routeNumericId: number | null;
  },
) => {
  let score = titleHint ? titleMatchScore(titleHint, media) : 0;
  if (preferredMalId && Number(media?.idMal || 0) === preferredMalId) score += 420;
  if (preferredAniListId && Number(media?.id || 0) === preferredAniListId) score += 420;
  if (!preferredMalId && routeNumericId && Number(media?.idMal || 0) === routeNumericId) score += 48;
  if (!preferredAniListId && routeNumericId && Number(media?.id || 0) === routeNumericId) score += 24;
  if ((media?.format || '').toUpperCase() === preferredFormatFromRouteTitle(titleHint)) score += 12;
  return score;
};

export const fetchAnimeDetails = async (id: string, options: AnimeDetailsLookupOptions = {}) => {
  const routeNumericId = toPositiveInt(id);
  const preferredAniListId = toPositiveInt(options.anilistId) || Number(/^anilist-(\d+)(?:-|$)/.exec(id)?.[1]) || null;
  const preferredMalId = toPositiveInt(options.malId) || (preferredAniListId ? null : routeNumericId);
  const titleHint = String(options.routeTitle || titleHintFromRoute(id) || '').trim();

  const candidates: any[] = [];
  let detailState: ReturnType<typeof metadataState> = { status: 'authoritative', fetchedAt: Date.now(), retryAt: undefined };
  const seen = new Set<number>();

  const pushCandidate = (media: any) => {
    const mediaId = Number(media?.id || 0);
    if (!mediaId || seen.has(mediaId)) return;
    seen.add(mediaId);
    candidates.push(media);
  };

  const loadSingle = async (query: string, variables: Record<string, unknown>) => {
    const response = await fetchAniList({ query, variables }, 21600, options);
    detailState = metadataState(response);
    if (!response.ok) return;
    const payload = await response.json();
    if (payload?.errors || !payload?.data?.Media) return;
    const candidate = payload.data.Media;
    if (query === ANIME_DETAIL_QUERY_BY_ANILIST && Number(candidate.id) !== Number(variables.id)
      || query === ANIME_DETAIL_QUERY_BY_MAL && Number(candidate.idMal) !== Number(variables.id)) {
      throw desktopDataError('anilist', new Error('Invalid anime identity.'));
    }
    pushCandidate(candidate);
  };

  const failures: unknown[] = [];
  try {
    if (preferredAniListId) await loadSingle(ANIME_DETAIL_QUERY_BY_ANILIST, { id: preferredAniListId });
    else if (preferredMalId) await loadSingle(ANIME_DETAIL_QUERY_BY_MAL, { id: preferredMalId });
  } catch (error) { if (isDesktopAdmissionWait(error)) throw error; failures.push(error); }
  if (options.signal?.aborted) throw desktopDataError('anilist', new DOMException('Cancelled', 'AbortError'));
  // Resolve legacy routes only if the explicit identity could not be loaded.
  if (!candidates.length && titleHint && !preferredAniListId && !toPositiveInt(options.malId)) {
    try {
      const response = await fetchAniList({ query: ANIME_DETAIL_SEARCH_QUERY, variables: { search: titleHint } }, 21600, options);
      const payload = await response.json();
      (payload?.data?.Page?.media || []).filter((candidate: any) => titleMatchScore(titleHint, candidate) >= 60).forEach(pushCandidate);
    } catch (error) { if (isDesktopAdmissionWait(error)) throw error; failures.push(error); }
  }

  const media = [...candidates].sort(
    (left, right) => animeDetailsCandidateScore(right, {
      titleHint,
      preferredMalId,
      preferredAniListId,
      routeNumericId,
    }) - animeDetailsCandidateScore(left, {
      titleHint,
      preferredMalId,
      preferredAniListId,
      routeNumericId,
    }),
  )[0];

  if (!media) {
const fallbackMalId = preferredMalId;
    if (fallbackMalId) {
      for (const detailPath of [`/anime/${fallbackMalId}/full`, `/anime/${fallbackMalId}`]) {
      try {
const jikanRes = await fetchJikanPath(detailPath, 21600, options);
        if (jikanRes.ok) {
          const jikanJson = await jikanRes.json();
          if (jikanJson?.data && Number(jikanJson.data.mal_id) === fallbackMalId) {
            const mapped = mapJikanDetailToAnime(jikanJson.data);
            if (!useStore.getState().nsfwMode && mapped.isAdult) {
              throw new Error('NSFW content is disabled. Toggle SFW to view this content.');
            }
            return { data: mapped, streamnyaa: metadataState(jikanRes) };
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('NSFW')) throw error;
        const failure = desktopDataError('tenrai', error);
        if (options.signal?.aborted || ['cancelled', 'queued', 'access-denied', 'rate-limited'].includes(failure.code)) throw error;
      }
      }
    }
    throw desktopDataError('anilist', failures[0] || new Error('Anime details are temporarily unavailable.'));
  }

  const nsfwMode = useStore.getState().nsfwMode;
  if (!nsfwMode && media.isAdult) {
    throw new Error('NSFW content is disabled. Toggle SFW to view this content.');
  }

  const mappedAnime = mapAnilistToJikan(media);
  // Optional statistics must never add a second provider to the critical navigation path.
  const jikanStats = null;

  return {
    streamnyaa: detailState,
    data: {
      ...mappedAnime,
      ...(jikanStats || {}),
    },
  };
};

export const fetchRecentEpisodes = async (options: DesktopRequestOptions = {}) => fetchRecentEpisodesWithLimit(12, options);

export const fetchMangaDetails = async (id: string) => {
  const query = `
    query($id: Int) {
      Media(idMal: $id, type: MANGA) {
        id
        idMal
        title { romaji english native }
        description
        status
        format
        coverImage { extraLarge large color } bannerImage
        genres
        averageScore
        isAdult
        chapters
        volumes
        relations {
          edges {
            relationType
            node {
              id
              idMal
              type
              title { romaji english native }
              coverImage { extraLarge large color }
              bannerImage
            }
          }
        }
      }
    }
  `;
  const numericId = parseInt(extractNumericId(id), 10);
  let res = await fetchAniList({ query, variables: { id: numericId } }, 21600);
  
  let data = await res.json();
  
  if (data.errors || !data?.data?.Media) {
    const fallbackQuery = query.replace('idMal: $id', 'id: $id');
    res = await fetchAniList({ query: fallbackQuery, variables: { id: numericId } }, 21600);
    data = await res.json();
  }

  if (data.errors || !data?.data?.Media) {
    const titleHint = titleHintFromRoute(id);
    if (titleHint) {
      const searchQuery = `
        query($search: String) {
          Page(page: 1, perPage: 5) {
            media(type: MANGA, search: $search, sort: SEARCH_MATCH) {
              id
              idMal
              title { romaji english native }
              description
              status
              format
              coverImage { extraLarge large color } bannerImage
              genres
              averageScore
              isAdult
              chapters
              volumes
              relations {
                edges {
                  relationType
                  node {
                    id
                    idMal
                    type
                    title { romaji english native }
                    coverImage { extraLarge large color }
                    bannerImage
                  }
                }
              }
            }
          }
        }
      `;
      res = await fetchAniList({ query: searchQuery, variables: { search: titleHint } }, 21600);
      data = await res.json();
      const fallbackMedia = data?.data?.Page?.media?.[0];
      if (fallbackMedia) {
        data = { data: { Media: fallbackMedia } };
      }
    }
  }

  if (!res.ok || data.errors || !data?.data?.Media) throw new Error('Failed to fetch manga details');
  
  const nsfwMode = useStore.getState().nsfwMode;
  if (!nsfwMode && data.data.Media.isAdult) {
    throw new Error('NSFW content is disabled.');
  }

  const media = data.data.Media;
  return { 
    data: {
      ...mapAnilistToJikan(media),
      chapters: media.chapters,
      volumes: media.volumes,
    } 
  };
};

export const fetchAnimeEpisodes = async (id: string, page: number = 1, options: DesktopRequestOptions = {}) => {
  if (!/^[1-9]\d*$/.test(id)) throw desktopDataError('tenrai', new Error('Invalid MAL episode identity.'));
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw desktopDataError('tenrai', new Error('Invalid episode page.'));
  try {
    const path = page === 1 ? `/anime/${id}/episodes` : `/anime/${id}/episodes?page=${page}`;
    let res: Response;
    try {
      res = await fetchJikanPath(path, 600, options);
      if (!res.ok) throw desktopDataError('tenrai', new Error(`Episode metadata failed with status ${res.status}.`), res.status);
    } catch (error) {
      const failure = desktopDataError('tenrai', error);
      // Both are documented forms of page one. Try the explicit form once for
      // an upstream timeout/server failure, never after denial or throttling.
      // Desktop transport already performs its bounded network retry. Retrying
      // the same page under another URL doubles requests and can outlast admission.
      if (isDesktopApp() || page !== 1 || options.signal?.aborted || !(['timeout'].includes(failure.code) || (failure.statusCode || 0) >= 500)) throw error;
      res = await fetchJikanPath(`/anime/${id}/episodes?page=1`, 600, options);
    }
    if (!res.ok) throw desktopDataError('tenrai', new Error(`Episode metadata failed with status ${res.status}.`), res.status);
    const json = await res.json().catch((error) => {
      throw desktopDataError('tenrai', error);
    });
    if (!json || !Array.isArray(json.data)) {
      throw desktopDataError('tenrai', new Error('Episode metadata response was invalid.'));
    }
    const stale = staleMetadataResponse(res);
    // An empty upstream response during an outage must not erase known titles.
    const saved = isDesktopApp() && !json.data.length ? readEpisodePage(id, page) : undefined;
    if (saved?.data.length) return { data: saved.data, pagination: saved.pagination,
      streamnyaa: { status: 'stale', provider: saved.provider || 'jikan', savedAt: saved.savedAt } };
    const fetchedAt = Number(res.headers.get('X-StreamNyaa-Fetched-At')) || (stale ? undefined : Date.now());
    if (!stale) saveEpisodePage(id, page, {...json,provider:'tenrai'}, fetchedAt);
    return {
      ...json,
      streamnyaa: {
        status: stale ? 'stale' : 'authoritative',
        provider: 'tenrai',
        fetchedAt,
        retryAt: Number(res.headers.get('X-StreamNyaa-Retry-At')) || undefined,
        cached: Boolean(res.headers.get('X-StreamNyaa-Local-Cache')) || ['memory','disk','stale'].includes(res.headers.get('X-StreamNyaa-Desktop-Cache') || ''),
      },
    };
  } catch (error) {
    const failure = desktopDataError('tenrai', error);
    if (options.signal?.aborted || failure.code === 'cancelled') throw error;
    const saved = isDesktopApp() ? readEpisodePage(id, page) : undefined;
    if (saved) return { data: saved.data, pagination: saved.pagination, streamnyaa: { status: 'stale', provider: saved.provider || 'jikan', savedAt: saved.savedAt, fetchedAt:saved.savedAt, retryAt:failure.retryAt } };
    if (isDesktopApp()) throw error;
    console.error('Failed to fetch episodes from Tenrai', error);
    return { data: [], pagination: { last_visible_page: 1 } };
  }
};

/** Hydrate the requested page before its refresh starts, retaining its real age. */
export function cachedAnimeEpisodeWindow(id: string, page = 1) {
  const saved = readEpisodePage(id, page);
  if (!saved) return undefined;
  const last = saved.pagination.last_visible_page;
  const fresh = Date.now() - saved.savedAt < 600_000;
  return {data:saved.data,pagination:saved.pagination,latestPage:last,latestPageResolved:fresh && (last === page || last === 1),
    complete:fresh && (last === page || last === 1),streamnyaa:{status:fresh ? 'authoritative' : 'stale',provider:saved.provider || 'jikan',fetchedAt:saved.savedAt,savedAt:saved.savedAt}};
}
/** Requested episodes are usable without waiting for an optional latest-page request. */
export async function fetchAnimeEpisodeWindow(id: string, page = 1, options: DesktopRequestOptions = {}) {
  const current = await fetchAnimeEpisodes(id, page, options);
  const last = Number(current.pagination?.last_visible_page || 1);
  if (!Number.isSafeInteger(last) || last < 1 || last > 1000) throw new Error('Invalid episode pagination.');
  if (last === page || last === 1) return { ...current, latestPageResolved: current.streamnyaa?.status !== 'stale', complete: current.streamnyaa?.status !== 'stale', latestPage: last };
  const savedTail = readEpisodePage(id, last);
  const merged = new Map<number, any>();
  for (const episode of [...current.data, ...(savedTail?.data || [])]) merged.set(Number(episode.mal_id), episode);
  // Saved tails inform navigation, but cannot establish fresh latest-airing data.
  return { ...current, data: [...merged.values()], latestPageResolved: false, complete: false, latestPage: last };
}

/** Independent query for the final page; callers keep the requested-page result visible. */
export async function fetchAnimeEpisodeTail(id: string, page: number, options: DesktopRequestOptions = {}) {
  const result = await fetchAnimeEpisodes(id, page, { ...options, priority: options.priority || 'background' });
  return { ...result, latestPage: page, latestPageResolved: result.streamnyaa?.status !== 'stale', complete: result.streamnyaa?.status !== 'stale' };
}

export function mergeAnimeEpisodeTail<T extends { data: any[]; streamnyaa?: { status?: string; fetchedAt?: number; savedAt?: number } }>(current: T, tail: T) {
  const merged = new Map<number, any>();
  for (const episode of [...current.data, ...tail.data]) merged.set(Number(episode.mal_id), episode);
  return { ...current, data: [...merged.values()], latestPageResolved: tail.streamnyaa?.status !== 'stale', complete: current.streamnyaa?.status !== 'stale' && tail.streamnyaa?.status !== 'stale',
    streamnyaa: { ...current.streamnyaa, status: current.streamnyaa?.status === 'stale' || tail.streamnyaa?.status === 'stale' ? 'stale' : 'authoritative',
      fetchedAt: Math.min(current.streamnyaa?.fetchedAt || current.streamnyaa?.savedAt || Date.now(), tail.streamnyaa?.fetchedAt || tail.streamnyaa?.savedAt || Date.now()) } };
}

export const fetchJikanExploreCatalog = async (options: {
  mode: 'new' | 'trending' | 'popular' | 'top' | 'airing' | 'seasonal' | 'upcoming' | 'year';
  query?: string;
  year?: number;
  season?: string;
  type?: string;
  genre?: string;
  status?: string;
}, requestOptions: DesktopRequestOptions = {}) => {
  const params = new URLSearchParams({ limit: '25' });
  const query = String(options.query || '').trim();
  const rawType = String(options.type || '').trim().toUpperCase();
  const type = rawType === 'TV_SHORT' ? 'tv' : rawType.toLowerCase();
  const status = String(options.status || '').trim().toLowerCase();
  const genreIds: Record<string, string> = {
    action: '1', adventure: '2', comedy: '4', mystery: '7', drama: '8', fantasy: '10', romance: '22',
    'sci-fi': '24', sports: '30', 'slice of life': '36', supernatural: '37', thriller: '41',
  };
  if (query) params.set('q', query);
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  const genreId = genreIds[String(options.genre || '').trim().toLowerCase()];
  if (genreId) params.set('genres', genreId);

  let path = `/anime?${params.toString()}`;
  if (!query && options.mode === 'upcoming') path = '/seasons/upcoming?limit=25';
  else if (!query && options.mode === 'seasonal' && options.year && options.season) {
    path = `/seasons/${options.year}/${String(options.season).toLowerCase()}?limit=25`;
  } else if (!query && options.mode === 'year' && options.year) {
    params.set('start_date', `${options.year}-01-01`);
    params.set('end_date', `${options.year}-12-31`);
    params.set('order_by', 'score');
    params.set('sort', 'desc');
    path = `/anime?${params.toString()}`;
  } else if (!query && options.mode === 'top') path = '/top/anime?limit=25';
  else if (!query) path = '/top/anime?filter=airing&limit=25';

  const response = await fetchJikanPath(path, 900, requestOptions);
  if (!response.ok) throw new Error('The secondary catalog provider did not respond.');
  const payload = await response.json();
  if (!Array.isArray(payload?.data)) throw new Error('The secondary catalog returned an invalid response.');
  return payload;
};

export const searchAnime = async (query: string, page = 1, type = '', rating = '', genres = '', sort = '', statusState = '', options: DesktopRequestOptions = {}) => {
  let typeArg = type ? `, format: ${type.toUpperCase()}` : '';
  let genreArg = genres ? `, genre: "${genres}"` : '';
  let isAdultArg = '';
  
  // Custom logic: if nsfwMode is off, always force isAdult: false
  // if nsfwMode is on, allow what the rating param asks.
  const nsfwMode = useStore.getState().nsfwMode;
  if (!nsfwMode) {
    isAdultArg = ', isAdult: false';
  } else {
    isAdultArg = rating === 'rx' ? ', isAdult: true' : (rating ? ', isAdult: false' : '');
  }

  let sortArg = 'TRENDING_DESC';
  let statusArg = '';
  
  if (statusState === 'airing') {
    statusArg = ', status: RELEASING';
  } else if (statusState === 'complete') {
    statusArg = ', status: FINISHED';
  } else if (statusState === 'upcoming') {
    statusArg = ', status: NOT_YET_RELEASED';
  }
  
  if (sort === 'upcoming') {
    statusArg = ', status: NOT_YET_RELEASED';
  } else if (sort === 'popular') {
    sortArg = 'POPULARITY_DESC';
  } else if (sort === 'recent') {
    // Actually, recent episodes would be tricky in standard search, but we can do start date or ID desc
    sortArg = 'ID_DESC';
  } else if (sort === 'score') {
    sortArg = 'SCORE_DESC';
  } else if (query) {
    sortArg = 'SEARCH_MATCH';
  }
  
  const gqlQuery = `
    query($search: String, $page: Int) {
      Page(page: $page, perPage: 24) {
        pageInfo {
          hasNextPage
          lastPage
        }
        media(type: ANIME, search: $search, sort: ${sortArg}${statusArg}${typeArg}${genreArg}${isAdultArg}) {
          id
          idMal
          title { romaji english native }
          synonyms
          description
          episodes
          status
          format
          season
          seasonYear
          source
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          popularity
          nextAiringEpisode { episode airingAt }
          isAdult
        }
      }
    }
  `;

  // Provide empty search string behaviour (search by trending/sort)
  const emptySearchQuery = `
    query($page: Int) {
      Page(page: $page, perPage: 24) {
        pageInfo {
          hasNextPage
          lastPage
        }
        media(type: ANIME, sort: ${sortArg}${statusArg}${typeArg}${genreArg}${isAdultArg}) {
          id
          idMal
          title { romaji english native }
          synonyms
          description
          episodes
          status
          format
          season
          seasonYear
          source
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          popularity
          nextAiringEpisode { episode airingAt }
          isAdult
        }
      }
    }
  `;
  
  const res = await fetchAniList({
    query: query ? gqlQuery : emptySearchQuery,
    variables: query ? { search: query, page } : { page },
  }, 1800, options);
  if (!res.ok) throw new Error('Failed to search anime');
  const data = await res.json();
  
  return { streamnyaa: metadataState(res),
    data: data.data.Page.media.map(mapAnilistToJikan),
    pagination: {
      has_next_page: data.data.Page.pageInfo.hasNextPage,
      last_visible_page: data.data.Page.pageInfo.lastPage
    }
  };
};

export const fetchTopAnimeByYear = async (year: number, maxPages = 1, options: DesktopRequestOptions = {}) => {
  const isAdultArg = useStore.getState().nsfwMode ? '' : ', isAdult: false';
  const gqlQuery = `
    query($page: Int, $seasonYear: Int) {
      Page(page: $page, perPage: 24) {
        pageInfo {
          hasNextPage
          lastPage
        }
        media(type: ANIME, seasonYear: $seasonYear, sort: SCORE_DESC${isAdultArg}) {
          id
          idMal
          title { romaji english native }
          synonyms
          description
          episodes
          status
          format
          season
          seasonYear
          source
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          popularity
          nextAiringEpisode { episode airingAt }
          isAdult
        }
      }
    }
  `;

  const pages: any[] = [];
  let stale = false;
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= maxPages) {
    const res = await fetchAniList({ query: gqlQuery, variables: { page, seasonYear: year } }, 21600, options);
    stale ||= metadataState(res).status === 'stale';
    if (!res.ok) throw new Error('Failed to fetch yearly top anime');
    const data = await res.json();
    if (data.errors) throw new Error('Failed to fetch yearly top anime');
    pages.push(...(data.data.Page.media || []));
    hasNext = Boolean(data.data.Page.pageInfo?.hasNextPage);
    page += 1;
  }
  const rawData = pages.map(mapAnilistToJikan);
  return { streamnyaa: { status: stale ? 'stale' : 'authoritative' }, data: rawData.filter((anime: any, index: number, self: any[]) => index === self.findIndex((a) => a.anilist_id === anime.anilist_id)) };
};

export const fetchAnimeSeason = async (season: string, year: number, page = 1, options: DesktopRequestOptions = {}) => {
  const validSeason = season.toUpperCase();
  const isAdultArg = useStore.getState().nsfwMode ? '' : ', isAdult: false';
  const gqlQuery = `
    query($page: Int, $seasonYear: Int, $season: MediaSeason) {
      Page(page: $page, perPage: 24) {
        pageInfo {
          hasNextPage
          lastPage
        }
        media(type: ANIME, seasonYear: $seasonYear, season: $season, sort: POPULARITY_DESC${isAdultArg}) {
          id
          idMal
          title { romaji english native }
          synonyms
          description
          episodes
          status
          format
          season
          seasonYear
          source
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          nextAiringEpisode { episode airingAt }
          isAdult
        }
      }
    }
  `;

  const res = await fetchAniList({ query: gqlQuery, variables: { page, seasonYear: year, season: validSeason } }, 21600, options);
  if (!res.ok) throw new Error('Failed to fetch seasonal anime');
  const data = await res.json();
  if (data.errors) throw new Error('Failed to fetch seasonal anime');
  return { streamnyaa: metadataState(res),
    data: (data.data.Page.media || []).map(mapAnilistToJikan),
    pagination: {
      has_next_page: data.data.Page.pageInfo.hasNextPage,
      last_visible_page: data.data.Page.pageInfo.lastPage,
    },
  };
};

export const fetchGenres = async () => {
  const query = `
    query {
      GenreCollection
    }
  `;
  const res = await fetchAniList({ query }, 86400);
  if (!res.ok) throw new Error('Failed to fetch genres');
  const data = await res.json();
  
  let validGenres = data.data.GenreCollection;
  const nsfwMode = useStore.getState().nsfwMode;
  if (!nsfwMode) {
    validGenres = validGenres.filter((g: string) => g !== 'Hentai');
  }
  
  return {
    data: validGenres.map((g: string, idx: number) => ({
      mal_id: idx + 1,
      name: g
    }))
  };
};

export const fetchSchedule = async (page = 1, startDate: number, endDate: number, options: DesktopRequestOptions = {}) => {
  const nsfwMode = useStore.getState().nsfwMode;
  const query = `
    query($page: Int, $start: Int, $end: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo {
          hasNextPage
          lastPage
        }
        airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
          id
          airingAt
          episode
          media {
            id
            idMal
            title { romaji english native }
            description
            episodes
            status
            format
            coverImage { extraLarge large color } bannerImage
            genres
            averageScore
            isAdult
          }
        }
      }
    }
  `;
  
const res = await fetchAniList({ query, variables: { page, start: startDate, end: endDate } }, 180, options);
  
  if (!res.ok) throw new Error('Failed to fetch schedule');
  const data = await res.json();
  
  let schedules = data.data.Page.airingSchedules;
  if (!nsfwMode) {
    schedules = schedules.filter((s: any) => !s.media.isAdult);
  }
  
  const seen = new Set();
  schedules = schedules.filter((s: any) => {
    const id = `${s.media.id}:${s.episode}:${s.airingAt}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  
  const mappedSchedules = schedules.map((schedule: any) => ({
      ...mapAnilistToJikan(schedule.media),
      airingAt: schedule.airingAt,
      airingEpisode: schedule.episode,
      scheduleId: schedule.id
    }));

  return { streamnyaa: metadataState(res),
    data: isDesktopApp() ? enrichDesktopScheduleRevisions(mappedSchedules) : mappedSchedules,
    pagination: {
      has_next_page: data.data.Page.pageInfo.hasNextPage,
      last_visible_page: data.data.Page.pageInfo.lastPage
    }
  };
};

export type CompleteScheduleResult = {
  data: any[]; complete: boolean; retryAfterMs?: number; retryAt?: number;
  partialReason?: 'background-budget' | 'foreground-loading';
  streamnyaa: { status: string; fetchedAt: number; retryAt?: number };
  pagination: { has_next_page: boolean; last_visible_page: number };
};

export const fetchCompleteSchedule = async (startDate: number, endDate: number, maxPages = 10,
  options: DesktopRequestOptions = {}, onProgress?: (value: CompleteScheduleResult) => void): Promise<CompleteScheduleResult> => {
  const items: any[] = [], seen = new Set<string>();
  let page = 1, hasNextPage = true, stale = false;
  let retryAfterMs: number | undefined;
  let retryAt: number | undefined;
  let fetchedAt = Date.now();
  while (hasNextPage && page <= maxPages) {
    try {
      const response = await fetchSchedule(page, startDate, endDate, options);
      stale ||= response.streamnyaa.status === 'stale';
      fetchedAt = Math.min(fetchedAt, response.streamnyaa.fetchedAt);
      retryAt = Math.max(retryAt || 0, response.streamnyaa.retryAt || 0) || undefined;
      response.data.forEach((anime: any) => {
        const key = `${anime?.anilist_id || anime?.mal_id || anime?.id}:${anime?.airingEpisode}:${anime?.airingAt}`;
        if (seen.has(key)) return;
        seen.add(key); items.push(anime);
      });
      hasNextPage = Boolean(response.pagination?.has_next_page);
      page += 1;
      onProgress?.({ data: [...items], complete: !hasNextPage, retryAt,
        streamnyaa: { status: stale ? 'stale' : 'authoritative', fetchedAt, retryAt },
        pagination: { has_next_page: hasNextPage, last_visible_page: page - 1 } });
    } catch (error) {
      if (options.signal?.aborted || !items.length) throw error;
      retryAfterMs = (error as { retryAfterMs?: number })?.retryAfterMs;
      retryAt = (error as { retryAt?: number })?.retryAt;
      break;
    }
  }
  return { data: items, complete: !hasNextPage, retryAfterMs, retryAt,
    streamnyaa: { status: stale ? 'stale' : 'authoritative', fetchedAt, retryAt },
    pagination: { has_next_page: hasNextPage, last_visible_page: page - 1 } };
};
