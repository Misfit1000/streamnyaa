import { useStore } from '../store/useStore';
import { extractNumericId } from '../lib/slug';
import { fetchDesktopMetadataApi, isDesktopApp } from '../lib/desktop';

const ANILIST_URL = 'https://graphql.anilist.co';
const LOCAL_METADATA_PREFIX = 'streamnyaa.metadataCache.v2.';
const LEGACY_METADATA_PREFIXES = ['streamnyaa.metadataCache.'];
const LOCAL_METADATA_LIMIT = 90;

type MetadataCacheEntry = {
  value: unknown;
  expiresAt: number;
  savedAt: number;
};

const memoryMetadataCache = new Map<string, MetadataCacheEntry>();

const hashCacheKey = (input: string) => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

const cacheKeyFor = (provider: 'anilist' | 'jikan', value: unknown) => {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return `${LOCAL_METADATA_PREFIX}${provider}.${hashCacheKey(serialized)}`;
};

const jsonResponse = (value: unknown, cacheState: 'local-hit' | 'local-stale') => new Response(JSON.stringify(value), {
  status: 200,
  headers: {
    'Content-Type': 'application/json',
    'X-StreamNyaa-Local-Cache': cacheState,
  },
});

const pruneLocalMetadataCache = () => {
  if (typeof window === 'undefined') return;
  try {
    Object.keys(localStorage)
      .filter((key) => LEGACY_METADATA_PREFIXES.some((prefix) => key.startsWith(prefix)))
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

const readLocalMetadata = (key: string, allowStale = false) => {
  const now = Date.now();
  const memoryEntry = memoryMetadataCache.get(key);
  if (memoryEntry && (allowStale || memoryEntry.expiresAt > now)) return memoryEntry;

  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MetadataCacheEntry;
    if (!parsed || typeof parsed.expiresAt !== 'number') return null;
    if (!allowStale && parsed.expiresAt <= now) return null;
    memoryMetadataCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
};

const writeLocalMetadata = (key: string, value: unknown, ttlSeconds: number) => {
  const entry: MetadataCacheEntry = {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
    savedAt: Date.now(),
  };
  memoryMetadataCache.set(key, entry);

  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(entry));
    pruneLocalMetadataCache();
  } catch {
    try {
      pruneLocalMetadataCache();
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // The direct request already succeeded, so cache write failure should not break the page.
    }
  }
};

const fetchWithLocalMetadataCache = async (
  key: string,
  ttlSeconds: number,
  request: () => Promise<Response>,
) => {
  const cached = readLocalMetadata(key);
  if (cached) return jsonResponse(cached.value, 'local-hit');

  try {
    const response = await request();
    if (!response.ok) {
      const stale = readLocalMetadata(key, true);
      if (stale) return jsonResponse(stale.value, 'local-stale');
      return response;
    }

    const json = await response.clone().json();
    writeLocalMetadata(key, json, ttlSeconds);
    return response;
  } catch (error) {
    const stale = readLocalMetadata(key, true);
    if (stale) return jsonResponse(stale.value, 'local-stale');
    throw error;
  }
};

const fetchAniListDirect = (body: Record<string, unknown>) => fetch(ANILIST_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const fetchAniList = async (body: Record<string, unknown>, ttlSeconds = 21600) => {
  const cacheKey = cacheKeyFor('anilist', body);
  return fetchWithLocalMetadataCache(cacheKey, ttlSeconds, async () => {
    if (isDesktopApp()) {
      try {
        const desktopResponse = await fetchDesktopMetadataApi({
          provider: 'anilist',
          body,
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
        return fetchAniListDirect(body);
      }
    }

    const gatewayResponse = await fetch(`/api/stream-sources?provider=anilist&ttl=${ttlSeconds}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (gatewayResponse?.ok) return gatewayResponse;
    return fetchAniListDirect(body);
  });
};

const fetchJikanPathDirect = (path: string) => fetch(`https://api.jikan.moe/v4${path}`);

const fetchJikanPath = async (path: string, ttlSeconds = 21600) => {
  const cacheKey = cacheKeyFor('jikan', path);
  return fetchWithLocalMetadataCache(cacheKey, ttlSeconds, async () => {
    if (isDesktopApp()) {
      try {
        const desktopResponse = await fetchDesktopMetadataApi({
          provider: 'jikan',
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
        return fetchJikanPathDirect(path);
      }
    }

    const gatewayResponse = await fetch(`/api/stream-sources?provider=jikan&ttl=${ttlSeconds}&path=${encodeURIComponent(path)}`).catch(() => null);
    if (gatewayResponse?.ok) return gatewayResponse;
    return fetchJikanPathDirect(path);
  });
};

const mapAnilistToJikan = (m: any) => ({
  id: m.id,
  mal_id: m.idMal || m.id,
  anilist_id: m.id,
  title: m.title.english || m.title.romaji || m.title.native,
  title_romaji: m.title.romaji,
  title_english: m.title.english,
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
  relations: m.relations?.edges?.map((edge: any) => ({
    relation: edge.relationType,
    entry: [
      {
        id: edge.node.id,
        anilist_id: edge.node.id,
        mal_id: edge.node.idMal || edge.node.id,
        type: edge.node.type,
        format: edge.node.format,
        year: edge.node.seasonYear,
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
      mal_id: r.idMal || r.id,
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
  banner_image: item.trailer?.images?.maximum_image_url || item.images?.jpg?.large_image_url || item.images?.webp?.large_image_url,
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

export const fetchTopAiring = async () => {
  const isAdultArg = useStore.getState().nsfwMode ? '' : ', isAdult: false';
  const query = `
    query {
      Page(page: 1, perPage: 12) {
        media(type: ANIME, sort: SCORE_DESC, status: RELEASING${isAdultArg}) {
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
          popularity
          isAdult
        }
      }
    }
  `;
  const res = await fetchAniList({ query }, 21600);
  if (!res.ok) throw new Error('Failed to fetch top airing anime');
  const data = await res.json();
  const rawData = data.data.Page.media.map(mapAnilistToJikan);
  return { data: rawData.filter((anime: any, index: number, self: any[]) => index === self.findIndex((a) => a.mal_id === anime.mal_id)) };
};

export const fetchRecentEpisodes = async () => {
  const nsfwMode = useStore.getState().nsfwMode;
  const query = `
    query {
      Page(page: 1, perPage: 30) {
        airingSchedules(airingAt_lesser: ${Math.floor(Date.now() / 1000)}, sort: TIME_DESC) {
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
  const res = await fetchAniList({ query }, 300);
  if (!res.ok) throw new Error('Failed to fetch recent episodes');
  const data = await res.json();
  
  let schedules = data.data.Page.airingSchedules;
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
  
  return { 
    data: schedules.slice(0, 12).map((schedule: any) => ({
      ...mapAnilistToJikan(schedule.media),
      latestEpisode: schedule.episode
    }))
  };
};

export const fetchUpcomingAnime = async () => {
  const isAdultArg = useStore.getState().nsfwMode ? '' : ', isAdult: false';
  const query = `
    query {
      Page(page: 1, perPage: 18) {
        media(type: ANIME, sort: TRENDING_DESC, status: NOT_YET_RELEASED${isAdultArg}) {
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
          popularity
          isAdult
        }
      }
    }
  `;
  const res = await fetchAniList({ query }, 21600);
  if (!res.ok) throw new Error('Failed to fetch upcoming anime');
  const data = await res.json();
  const rawData = data.data.Page.media.map(mapAnilistToJikan);
  return { data: rawData.filter((anime: any, index: number, self: any[]) => index === self.findIndex((a) => a.mal_id === anime.mal_id)) };
};

export const fetchPopularAnime = async () => {
  const isAdultArg = useStore.getState().nsfwMode ? '' : ', isAdult: false';
  const query = `
    query {
      Page(page: 1, perPage: 18) {
        media(type: ANIME, sort: POPULARITY_DESC${isAdultArg}) {
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
          popularity
          isAdult
        }
      }
    }
  `;
  const res = await fetchAniList({ query }, 21600);
  if (!res.ok) throw new Error('Failed to fetch popular anime');
  const data = await res.json();
  const rawData = data.data.Page.media.map(mapAnilistToJikan);
  return { data: rawData.filter((anime: any, index: number, self: any[]) => index === self.findIndex((a) => a.mal_id === anime.mal_id)) };
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
          description
          episodes
          status
          format
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          popularity
          isAdult
        }
      }
    }
  `;
  const res = await fetchAniList({ query }, 900);
  if (!res.ok) throw new Error('Failed to fetch seasonal anime');
  const data = await res.json();
  const rawData = data.data.Page.media.map(mapAnilistToJikan);
  return { data: rawData.filter((anime: any, index: number, self: any[]) => index === self.findIndex((a) => a.mal_id === anime.mal_id)) };
};

type AnimeDetailsLookupOptions = {
  anilistId?: string | number | null;
  malId?: string | number | null;
  routeTitle?: string | null;
};

const ANIME_DETAIL_SELECTION = `
  id
  idMal
  title { romaji english native }
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
        seasonYear
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
  const preferredMalId = toPositiveInt(options.malId) || routeNumericId;
  const preferredAniListId = toPositiveInt(options.anilistId);
  const titleHint = String(options.routeTitle || titleHintFromRoute(id) || '').trim();

  const candidates: any[] = [];
  const seen = new Set<number>();

  const pushCandidate = (media: any) => {
    const mediaId = Number(media?.id || 0);
    if (!mediaId || seen.has(mediaId)) return;
    seen.add(mediaId);
    candidates.push(media);
  };

  const loadSingle = async (query: string, variables: Record<string, unknown>) => {
    const response = await fetchAniList({ query, variables }, 21600);
    if (!response.ok) return;
    const payload = await response.json();
    if (payload?.errors || !payload?.data?.Media) return;
    pushCandidate(payload.data.Media);
  };

  if (preferredMalId) {
    await loadSingle(ANIME_DETAIL_QUERY_BY_MAL, { id: preferredMalId });
  }
  if (preferredAniListId && preferredAniListId !== preferredMalId) {
    await loadSingle(ANIME_DETAIL_QUERY_BY_ANILIST, { id: preferredAniListId });
  } else if (!preferredAniListId && routeNumericId && routeNumericId !== preferredMalId) {
    await loadSingle(ANIME_DETAIL_QUERY_BY_ANILIST, { id: routeNumericId });
  }

  if (titleHint) {
    const searchResponse = await fetchAniList(
      { query: ANIME_DETAIL_SEARCH_QUERY, variables: { search: titleHint } },
      21600,
    );
    if (searchResponse.ok) {
      const searchPayload = await searchResponse.json();
      (searchPayload?.data?.Page?.media || []).forEach(pushCandidate);
    }
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
    const fallbackMalId = preferredMalId || routeNumericId;
    if (fallbackMalId) {
      try {
        const jikanRes = await fetchJikanPath(`/anime/${fallbackMalId}/full`, 21600);
        if (jikanRes.ok) {
          const jikanJson = await jikanRes.json();
          if (jikanJson?.data) {
            const mapped = mapJikanDetailToAnime(jikanJson.data);
            if (!useStore.getState().nsfwMode && mapped.isAdult) {
              throw new Error('NSFW content is disabled. Toggle SFW to view this content.');
            }
            return { data: mapped };
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('NSFW')) throw error;
      }
    }
    throw new Error('Failed to fetch anime details');
  }

  const nsfwMode = useStore.getState().nsfwMode;
  if (!nsfwMode && media.isAdult) {
    throw new Error('NSFW content is disabled. Toggle SFW to view this content.');
  }

  const mappedAnime = mapAnilistToJikan(media);
  const jikanStats = media.idMal ? await fetchJikanAnimeStats(media.idMal) : null;

  return {
    data: {
      ...mappedAnime,
      ...(jikanStats || {}),
    },
  };
};

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

export const fetchAnimeEpisodes = async (id: string, page: number = 1) => {
  try {
    const res = await fetchJikanPath(`/anime/${extractNumericId(id)}/episodes?page=${page}`, 21600);
    const json = await res.json();
    return json;
  } catch (error) {
    console.error("Failed to fetch episodes from Jikan", error);
    return { data: [], pagination: { last_visible_page: 1 } };
  }
};

export const searchAnime = async (query: string, page = 1, type = '', rating = '', genres = '', sort = '', statusState = '') => {
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
          description
          episodes
          status
          format
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          popularity
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
          description
          episodes
          status
          format
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          popularity
          isAdult
        }
      }
    }
  `;
  
  const res = await fetchAniList({
    query: query ? gqlQuery : emptySearchQuery,
    variables: query ? { search: query, page } : { page },
  }, 1800);
  if (!res.ok) throw new Error('Failed to search anime');
  const data = await res.json();
  
  return {
    data: data.data.Page.media.map(mapAnilistToJikan),
    pagination: {
      has_next_page: data.data.Page.pageInfo.hasNextPage,
      last_visible_page: data.data.Page.pageInfo.lastPage
    }
  };
};

export const fetchTopAnimeByYear = async (year: number) => {
  const isAdultArg = useStore.getState().nsfwMode ? '' : ', isAdult: false';
  const gqlQuery = `
    query($seasonYear: Int) {
      Page(page: 1, perPage: 18) {
        media(type: ANIME, seasonYear: $seasonYear, sort: SCORE_DESC${isAdultArg}) {
          id
          idMal
          title { romaji english native }
          description
          episodes
          status
          format
          seasonYear
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          popularity
          isAdult
        }
      }
    }
  `;

  const res = await fetchAniList({ query: gqlQuery, variables: { seasonYear: year } }, 21600);
  if (!res.ok) throw new Error('Failed to fetch yearly top anime');
  const data = await res.json();
  if (data.errors) throw new Error('Failed to fetch yearly top anime');
  const rawData = (data.data.Page.media || []).map(mapAnilistToJikan);
  return { data: rawData.filter((anime: any, index: number, self: any[]) => index === self.findIndex((a) => a.mal_id === anime.mal_id)) };
};

export const fetchAnimeSeason = async (season: string, year: number, page = 1) => {
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
          description
          episodes
          status
          format
          seasonYear
          coverImage { extraLarge large color } bannerImage
          genres
          averageScore
          isAdult
        }
      }
    }
  `;

  const res = await fetchAniList({ query: gqlQuery, variables: { page, seasonYear: year, season: validSeason } }, 21600);
  if (!res.ok) throw new Error('Failed to fetch seasonal anime');
  const data = await res.json();
  if (data.errors) throw new Error('Failed to fetch seasonal anime');
  return {
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

export const fetchSchedule = async (page = 1, startDate: number, endDate: number) => {
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
  
  const res = await fetchAniList({ query, variables: { page, start: startDate, end: endDate } }, 180);
  
  if (!res.ok) throw new Error('Failed to fetch schedule');
  const data = await res.json();
  
  let schedules = data.data.Page.airingSchedules;
  if (!nsfwMode) {
    schedules = schedules.filter((s: any) => !s.media.isAdult);
  }
  
  const seen = new Set();
  schedules = schedules.filter((s: any) => {
    const id = s.media.idMal || s.media.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  
  return {
    data: schedules.map((schedule: any) => ({
      ...mapAnilistToJikan(schedule.media),
      airingAt: schedule.airingAt,
      airingEpisode: schedule.episode,
      scheduleId: schedule.id
    })),
    pagination: {
      has_next_page: data.data.Page.pageInfo.hasNextPage,
      last_visible_page: data.data.Page.pageInfo.lastPage
    }
  };
};
