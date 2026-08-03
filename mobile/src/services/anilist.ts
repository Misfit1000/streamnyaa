import { ANILIST_URL, API_ORIGIN, JIKAN_URL, KITSU_URL } from '../config';
import type { Anime, ScheduleEntry } from '../types';
import { HttpError, requestJson } from '../lib/network';

type Variables = Record<string, string | number | boolean | null | undefined>;
type DetailLookup = { anilistId?: number; malId?: number | null; kitsuId?: string; title?: string };

const jikanGenreIds = new Map<string, number>();
let jikanDirectQueue: Promise<void> = Promise.resolve();
let lastJikanDirectRequest = 0;

async function graphQL<T>(query: string, variables: Variables = {}, signal?: AbortSignal): Promise<T> {
  const payload = await requestJson<any>(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
    timeoutMs: 9_000,
  });
  if (payload.errors?.length) throw new HttpError(payload.errors[0]?.message || 'AniList could not complete the request.', payload.errors[0]?.status || 422);
  if (!payload.data) throw new HttpError('AniList returned no metadata.', 502);
  return payload.data as T;
}

async function requestJikanDirect(path: string, signal?: AbortSignal) {
  const run = jikanDirectQueue.catch(() => undefined).then(async () => {
    const waitMs = Math.max(0, 420 - (Date.now() - lastJikanDirectRequest));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastJikanDirectRequest = Date.now();
    return requestJson<any>(`${JIKAN_URL}${path}`, { signal, timeoutMs: 9_000 });
  });
  jikanDirectQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function requestJikan(path: string, signal?: AbortSignal) {
  const gateway = `${API_ORIGIN}/api/stream-sources?provider=jikan&ttl=21600&path=${encodeURIComponent(path)}`;
  try {
    const cached = await requestJson<any>(gateway, { signal, timeoutMs: 7_000 });
    if (cached?.data) return cached;
  } catch {
    // The direct endpoint remains available if the StreamNyaa cache is cold or unreachable.
  }
  const direct = await requestJikanDirect(path, signal);
  if (!direct?.data) throw new HttpError(direct?.message || direct?.error || 'Jikan returned no metadata.', direct?.status || 502);
  return direct;
}

async function requestKitsu(path: string, signal?: AbortSignal) {
  const payload = await requestJson<any>(`${KITSU_URL}${path}`, {
    headers: { Accept: 'application/vnd.api+json' },
    signal,
    timeoutMs: 9_000,
  });
  if (!payload?.data) throw new HttpError(payload?.errors?.[0]?.detail || 'Kitsu returned no metadata.', 502);
  return payload;
}

const MEDIA_LIST_FIELDS = `
  id idMal title { romaji english native }
  coverImage { large color } averageScore
  type episodes chapters volumes duration format status season seasonYear isAdult
`;

const MEDIA_TRENDING_FIELDS = `${MEDIA_LIST_FIELDS} bannerImage`;

const MEDIA_FIELDS = `
  ${MEDIA_LIST_FIELDS}
  bannerImage popularity genres source countryOfOrigin
  nextAiringEpisode { episode airingAt }
  description(asHtml: false)
  studios(isMain: true) { nodes { name } }
  trailer { id site }
`;

function mapAniListMedia(media: any): Anime {
  return {
    id: media.id,
    anilistId: media.id,
    metadataProvider: 'AniList',
    mediaType: media.type,
    malId: media.idMal,
    title: media.title?.english || media.title?.romaji || media.title?.native || 'Untitled anime',
    titles: media.title,
    description: String(media.description || '').replace(/<[^>]*>/g, '').trim(),
    cover: media.coverImage?.large || media.coverImage?.extraLarge,
    banner: media.bannerImage,
    color: media.coverImage?.color,
    score: media.averageScore ? media.averageScore / 10 : undefined,
    popularity: media.popularity,
    episodes: media.episodes,
    chapters: media.chapters,
    volumes: media.volumes,
    duration: media.duration,
    format: media.format,
    status: media.status,
    season: media.season,
    year: media.seasonYear,
    source: media.source,
    countryOfOrigin: media.countryOfOrigin,
    genres: media.genres || [],
    studios: media.studios?.nodes?.map((studio: any) => studio.name) || [],
    isAdult: Boolean(media.isAdult),
    trailerId: media.trailer?.site === 'youtube' ? media.trailer.id : undefined,
    nextAiringEpisode: media.nextAiringEpisode || null,
  };
}

function mapJikanMedia(item: any, mediaType: 'ANIME' | 'MANGA' = 'ANIME'): Anime {
  const cover = item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || item.images?.jpg?.image_url;
  const rating = String(item.rating || '').toLowerCase();
  return {
    id: Number(item.mal_id),
    malId: Number(item.mal_id),
    metadataProvider: 'Jikan',
    mediaType,
    title: item.title_english || item.title || item.title_japanese || 'Untitled anime',
    titles: { romaji: item.title, english: item.title_english, native: item.title_japanese },
    description: String(item.synopsis || item.background || '').trim(),
    cover,
    banner: item.trailer?.images?.maximum_image_url || item.trailer?.images?.large_image_url || cover,
    score: item.score || undefined,
    popularity: item.popularity || undefined,
    episodes: mediaType === 'ANIME' ? item.episodes : undefined,
    chapters: mediaType === 'MANGA' ? item.chapters : undefined,
    volumes: mediaType === 'MANGA' ? item.volumes : undefined,
    duration: Number.parseInt(String(item.duration || ''), 10) || undefined,
    format: String(item.type || '').toUpperCase().replaceAll(' ', '_') || undefined,
    status: String(item.status || '').toUpperCase().replaceAll(' ', '_') || undefined,
    season: String(item.season || '').toUpperCase() || undefined,
    year: item.year || item.aired?.prop?.from?.year || item.published?.prop?.from?.year,
    source: String(item.source || '').toUpperCase().replaceAll(' ', '_') || undefined,
    countryOfOrigin: 'JP',
    genres: [...(item.genres || []), ...(item.explicit_genres || []), ...(item.themes || [])].map((genre: any) => genre.name).filter(Boolean),
    studios: (item.studios || item.authors || []).map((studio: any) => studio.name).filter(Boolean),
    isAdult: rating.includes('hentai') || rating.includes('rx'),
    trailerId: item.trailer?.youtube_id || undefined,
    nextAiringEpisode: null,
  };
}

function mapKitsuMedia(item: any, mediaType: 'ANIME' | 'MANGA' = 'ANIME'): Anime {
  const attributes = item.attributes || {};
  const id = Number(item.id);
  const score = Number(attributes.averageRating || 0) / 10;
  const cover = attributes.posterImage?.large || attributes.posterImage?.medium || attributes.posterImage?.original;
  const startDate = String(attributes.startDate || '');
  return {
    id,
    kitsuId: String(item.id),
    metadataProvider: 'Kitsu',
    mediaType,
    title: attributes.titles?.en_us || attributes.canonicalTitle || attributes.titles?.en_jp || attributes.titles?.ja_jp || 'Untitled anime',
    titles: { romaji: attributes.titles?.en_jp || attributes.canonicalTitle, english: attributes.titles?.en_us, native: attributes.titles?.ja_jp },
    description: String(attributes.synopsis || attributes.description || '').trim(),
    cover,
    banner: attributes.coverImage?.large || attributes.coverImage?.original || cover,
    score: score > 0 ? score : undefined,
    popularity: attributes.popularityRank || undefined,
    episodes: mediaType === 'ANIME' ? attributes.episodeCount : undefined,
    chapters: mediaType === 'MANGA' ? attributes.chapterCount : undefined,
    volumes: mediaType === 'MANGA' ? attributes.volumeCount : undefined,
    duration: mediaType === 'ANIME' ? attributes.episodeLength : undefined,
    format: String(attributes.subtype || '').toUpperCase() || undefined,
    status: String(attributes.status || '').toUpperCase() || undefined,
    year: /^\d{4}/.test(startDate) ? Number(startDate.slice(0, 4)) : undefined,
    genres: [],
    studios: [],
    isAdult: String(attributes.ageRating || '').toUpperCase() === 'R18',
    nextAiringEpisode: null,
  };
}

function uniqueMedia(items: Anime[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaType || 'ANIME'}:${item.malId || item.anilistId || item.kitsuId || item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function itemsFrom(result: PromiseSettledResult<any>, mediaType: 'ANIME' | 'MANGA' = 'ANIME') {
  if (result.status !== 'fulfilled' || !Array.isArray(result.value?.data)) return [];
  return uniqueMedia(result.value.data.map((item: any) => mapJikanMedia(item, mediaType)).filter((item: Anime) => item.id));
}

function metadataUnavailable(primary: unknown, fallback: unknown) {
  const fallbackMessage = fallback instanceof Error ? fallback.message : '';
  const primaryMessage = primary instanceof Error ? primary.message : '';
  return new HttpError(fallbackMessage || primaryMessage || 'Anime metadata services are temporarily unavailable. Please try again.', 424);
}

function firstSuccessful<T>(requests: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!requests.length) { reject(new Error('No metadata fallback is available.')); return; }
    let remaining = requests.length;
    let lastError: unknown;
    requests.forEach((request) => request.then(resolve).catch((error) => {
      lastError = error;
      remaining -= 1;
      if (!remaining) reject(lastError);
    }));
  });
}

export async function fetchHomeFeed(includeAdult = false, signal?: AbortSignal) {
  let primaryError: unknown;
  try {
    const data = await graphQL<any>(`
      query Home($adult: Boolean) {
        trending: Page(page: 1, perPage: 16) { media(type: ANIME, sort: TRENDING_DESC, isAdult: $adult) { ${MEDIA_TRENDING_FIELDS} } }
        popular: Page(page: 1, perPage: 16) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_LIST_FIELDS} } }
        airing: Page(page: 1, perPage: 16) { media(type: ANIME, status: RELEASING, sort: SCORE_DESC, isAdult: $adult) { ${MEDIA_LIST_FIELDS} } }
        upcoming: Page(page: 1, perPage: 16) { media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_LIST_FIELDS} } }
      }
    `, { adult: includeAdult ? null : false }, signal);
    return {
      trending: data.trending.media.map(mapAniListMedia),
      popular: data.popular.media.map(mapAniListMedia),
      airing: data.airing.media.map(mapAniListMedia),
      upcoming: data.upcoming.media.map(mapAniListMedia),
      provider: 'AniList' as const,
    };
  } catch (error) {
    primaryError = error;
  }

  const sfw = includeAdult ? '' : '&sfw=true';
  const results = await Promise.allSettled([
    requestJikan(`/seasons/now?limit=25${sfw}`, signal),
    requestJikan(`/top/anime?limit=25${sfw}`, signal),
    requestJikan(`/seasons/upcoming?limit=20${sfw}`, signal),
  ]);
  const season = itemsFrom(results[0]);
  const top = itemsFrom(results[1]);
  const upcoming = itemsFrom(results[2]);
  const available = uniqueMedia([...season, ...top, ...upcoming]);
  if (!available.length) {
    try {
      const kitsu = await requestKitsu('/anime?sort=-userCount&page[limit]=20', signal);
      const titles = uniqueMedia((kitsu.data || []).map((item: any) => mapKitsuMedia(item)));
      if (titles.length) return { trending: titles.slice(0, 16), popular: titles.slice(0, 16), airing: [], upcoming: [], provider: 'Kitsu' as const };
    } catch (fallbackError) {
      throw metadataUnavailable(primaryError, fallbackError);
    }
    throw metadataUnavailable(primaryError, null);
  }
  return {
    trending: (season.length ? season : top).slice(0, 16),
    popular: (top.length ? top : season).slice(0, 16),
    airing: season.slice(0, 16),
    upcoming: upcoming.slice(0, 16),
    provider: 'Jikan' as const,
  };
}

export type AnimeSearchFilters = {
  query?: string;
  page?: number;
  format?: string;
  status?: string;
  genre?: string;
  season?: string;
  year?: number;
  mediaType?: 'ANIME' | 'MANGA';
  sort?: 'TRENDING_DESC' | 'POPULARITY_DESC' | 'SCORE_DESC' | 'START_DATE_DESC';
  includeAdult?: boolean;
};

function jikanSearchPath(filters: AnimeSearchFilters) {
  const mediaType = filters.mediaType || 'ANIME';
  const params = new URLSearchParams({ page: String(filters.page || 1), limit: '24' });
  if (filters.query) params.set('q', filters.query);
  if (!filters.includeAdult && mediaType === 'ANIME') params.set('sfw', 'true');
  const genreId = filters.genre ? jikanGenreIds.get(filters.genre.toLowerCase()) : undefined;
  if (genreId) params.set('genres', String(genreId));
  const formatMap: Record<string, string> = { TV: 'tv', MOVIE: 'movie', OVA: 'ova', ONA: 'ona', TV_SHORT: 'tv_special', MANGA: 'manga', NOVEL: 'lightnovel', ONE_SHOT: 'oneshot' };
  const mappedFormat = filters.format ? formatMap[filters.format] : undefined;
  if (mappedFormat) params.set('type', mappedFormat);
  const statusMap: Record<string, string> = { RELEASING: 'airing', FINISHED: 'complete', NOT_YET_RELEASED: 'upcoming' };
  const mappedStatus = filters.status ? statusMap[filters.status] : undefined;
  if (mappedStatus) params.set('status', mappedStatus);
  if (filters.year) {
    params.set('start_date', `${filters.year}-01-01`);
    params.set('end_date', `${filters.year}-12-31`);
  }
  if (filters.sort === 'SCORE_DESC') { params.set('order_by', 'score'); params.set('sort', 'desc'); }
  else if (filters.sort === 'START_DATE_DESC') { params.set('order_by', 'start_date'); params.set('sort', 'desc'); }
  else { params.set('order_by', 'popularity'); params.set('sort', 'asc'); }
  return `/${mediaType === 'MANGA' ? 'manga' : 'anime'}?${params.toString()}`;
}

function kitsuSearchPath(filters: AnimeSearchFilters) {
  const mediaType = filters.mediaType || 'ANIME';
  const params = new URLSearchParams({ 'page[limit]': '20', 'page[offset]': String(((filters.page || 1) - 1) * 20) });
  if (filters.query) params.set('filter[text]', filters.query);
  if (filters.genre) params.set('filter[categories]', filters.genre.toLowerCase().replaceAll(' ', '-'));
  if (filters.year) params.set('filter[seasonYear]', String(filters.year));
  if (filters.format) params.set('filter[subtype]', filters.format.toLowerCase().replace('tv_short', 'special'));
  if (filters.status) {
    const statusMap: Record<string, string> = { RELEASING: 'current', FINISHED: 'finished', NOT_YET_RELEASED: 'tba' };
    const status = statusMap[filters.status];
    if (status) params.set('filter[status]', status);
  }
  params.set('sort', filters.sort === 'SCORE_DESC' ? '-averageRating' : filters.sort === 'START_DATE_DESC' ? '-startDate' : '-userCount');
  return `/${mediaType === 'MANGA' ? 'manga' : 'anime'}?${params.toString()}`;
}

export async function searchMedia(filters: AnimeSearchFilters, signal?: AbortSignal) {
  let primaryError: unknown;
  try {
    const data = await graphQL<any>(`
      query Search($page: Int, $search: String, $type: MediaType, $format: MediaFormat, $status: MediaStatus, $genre: String, $season: MediaSeason, $year: Int, $sort: [MediaSort], $adult: Boolean) {
        Page(page: $page, perPage: 30) {
          pageInfo { currentPage hasNextPage lastPage }
          media(type: $type, search: $search, format: $format, status: $status, genre: $genre, season: $season, seasonYear: $year, sort: $sort, isAdult: $adult) { ${MEDIA_LIST_FIELDS} }
        }
      }
    `, {
      page: filters.page || 1,
      type: filters.mediaType || 'ANIME',
      search: filters.query || undefined,
      format: filters.format || undefined,
      status: filters.status || undefined,
      genre: filters.genre || undefined,
      season: filters.season || undefined,
      year: filters.year || undefined,
      sort: filters.sort || 'TRENDING_DESC',
      adult: filters.includeAdult ? null : false,
    }, signal);
    return { items: data.Page.media.map(mapAniListMedia), pageInfo: data.Page.pageInfo, provider: 'AniList' as const };
  } catch (error) {
    primaryError = error;
  }
  try {
    return await firstSuccessful<{ items: Anime[]; pageInfo: { currentPage: number; hasNextPage: boolean; lastPage: number }; provider: 'Jikan' | 'Kitsu' }>([
      requestJikan(jikanSearchPath(filters), signal).then((payload) => {
        const mediaType = filters.mediaType || 'ANIME';
        return {
          items: uniqueMedia((payload.data || []).map((item: any) => mapJikanMedia(item, mediaType))),
          pageInfo: { currentPage: payload.pagination?.current_page || 1, hasNextPage: Boolean(payload.pagination?.has_next_page), lastPage: payload.pagination?.last_visible_page || 1 },
          provider: 'Jikan' as const,
        };
      }),
      requestKitsu(kitsuSearchPath(filters), signal).then((payload) => {
        const mediaType = filters.mediaType || 'ANIME';
        const items = uniqueMedia((payload.data || []).map((item: any) => mapKitsuMedia(item, mediaType)));
        return { items, pageInfo: { currentPage: filters.page || 1, hasNextPage: Boolean(payload.links?.next), lastPage: filters.page || 1 }, provider: 'Kitsu' as const };
      }),
    ]);
  } catch (fallbackError) {
    throw metadataUnavailable(primaryError, fallbackError);
  }
}

export async function searchAnime(filters: AnimeSearchFilters, signal?: AbortSignal) {
  return searchMedia({ ...filters, mediaType: 'ANIME' }, signal);
}

async function resolveJikanId(mediaType: 'anime' | 'manga', lookup: DetailLookup, signal?: AbortSignal) {
  if (lookup.malId) return lookup.malId;
  if (!lookup.title?.trim()) return null;
  const params = new URLSearchParams({ q: lookup.title.trim(), limit: '1' });
  if (mediaType === 'anime') params.set('sfw', 'true');
  const result = await requestJikan(`/${mediaType}?${params.toString()}`, signal);
  return Number(result.data?.[0]?.mal_id) || null;
}

export async function fetchAnimeDetails(id: number, lookup: DetailLookup = {}, signal?: AbortSignal) {
  if (lookup.kitsuId) {
    const payload = await requestKitsu(`/anime/${encodeURIComponent(lookup.kitsuId)}`, signal);
    return mapKitsuMedia(payload.data, 'ANIME');
  }
  let primaryError: unknown;
  try {
    const useMalId = !lookup.anilistId && Boolean(lookup.malId);
    const data = await graphQL<any>(`
      query Details($id: Int, $malId: Int) {
        Media(id: $id, idMal: $malId, type: ANIME) {
          ${MEDIA_FIELDS}
          relations { edges { relationType node { ${MEDIA_LIST_FIELDS} } } }
          recommendations(perPage: 12, sort: RATING_DESC) { nodes { mediaRecommendation { ${MEDIA_LIST_FIELDS} } } }
        }
      }
    `, { id: useMalId ? undefined : (lookup.anilistId || id), malId: useMalId ? lookup.malId : undefined }, signal);
    if (!data.Media) throw new HttpError('AniList could not match this title.', 404);
    const anime = mapAniListMedia(data.Media);
    anime.relations = (data.Media.relations?.edges || []).map((edge: any) => ({ ...mapAniListMedia(edge.node), format: edge.relationType || edge.node.format }));
    anime.recommendations = (data.Media.recommendations?.nodes || []).map((node: any) => node.mediaRecommendation).filter(Boolean).map(mapAniListMedia);
    return anime;
  } catch (error) {
    primaryError = error;
  }
  try {
    const fallbacks: Promise<Anime>[] = [resolveJikanId('anime', { ...lookup, malId: lookup.malId || (!lookup.anilistId ? id : undefined) }, signal).then(async (malId) => {
      if (!malId) throw new HttpError('No matching MyAnimeList title was found.', 404);
      return mapJikanMedia((await requestJikan(`/anime/${malId}/full`, signal)).data, 'ANIME');
    })];
    if (lookup.title) fallbacks.push(requestKitsu(kitsuSearchPath({ query: lookup.title, mediaType: 'ANIME' }), signal).then((payload) => {
      if (!payload.data?.[0]) throw new HttpError('Kitsu could not match this title.', 404);
      return mapKitsuMedia(payload.data[0], 'ANIME');
    }));
    return await firstSuccessful(fallbacks);
  } catch (fallbackError) {
    throw metadataUnavailable(primaryError, fallbackError);
  }
}

export async function fetchMangaDetails(id: number, lookup: DetailLookup = {}, signal?: AbortSignal) {
  if (lookup.kitsuId) {
    const payload = await requestKitsu(`/manga/${encodeURIComponent(lookup.kitsuId)}`, signal);
    return mapKitsuMedia(payload.data, 'MANGA');
  }
  let primaryError: unknown;
  try {
    const useMalId = !lookup.anilistId && Boolean(lookup.malId);
    const data = await graphQL<any>(`
      query MangaDetails($id: Int, $malId: Int) {
        Media(id: $id, idMal: $malId, type: MANGA) {
          ${MEDIA_FIELDS}
          relations { edges { relationType node { ${MEDIA_LIST_FIELDS} } } }
          recommendations(perPage: 12, sort: RATING_DESC) { nodes { mediaRecommendation { ${MEDIA_LIST_FIELDS} } } }
        }
      }
    `, { id: useMalId ? undefined : (lookup.anilistId || id), malId: useMalId ? lookup.malId : undefined }, signal);
    if (!data.Media) throw new HttpError('AniList could not match this title.', 404);
    const manga = mapAniListMedia(data.Media);
    manga.relations = (data.Media.relations?.edges || []).map((edge: any) => ({ ...mapAniListMedia(edge.node), format: edge.relationType || edge.node.format }));
    manga.recommendations = (data.Media.recommendations?.nodes || []).map((node: any) => node.mediaRecommendation).filter(Boolean).map(mapAniListMedia);
    return manga;
  } catch (error) {
    primaryError = error;
  }
  try {
    const fallbacks: Promise<Anime>[] = [resolveJikanId('manga', { ...lookup, malId: lookup.malId || (!lookup.anilistId ? id : undefined) }, signal).then(async (malId) => {
      if (!malId) throw new HttpError('No matching MyAnimeList title was found.', 404);
      return mapJikanMedia((await requestJikan(`/manga/${malId}/full`, signal)).data, 'MANGA');
    })];
    if (lookup.title) fallbacks.push(requestKitsu(kitsuSearchPath({ query: lookup.title, mediaType: 'MANGA' }), signal).then((payload) => {
      if (!payload.data?.[0]) throw new HttpError('Kitsu could not match this title.', 404);
      return mapKitsuMedia(payload.data[0], 'MANGA');
    }));
    return await firstSuccessful(fallbacks);
  } catch (fallbackError) {
    throw metadataUnavailable(primaryError, fallbackError);
  }
}

export async function fetchSchedule(startSeconds: number, endSeconds: number, signal?: AbortSignal) {
  let primaryError: unknown;
  try {
    const data = await graphQL<any>(`
      query Schedule($start: Int!, $end: Int!) {
        Page(page: 1, perPage: 50) {
          airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) { episode airingAt media { ${MEDIA_LIST_FIELDS} } }
        }
      }
    `, { start: startSeconds, end: endSeconds }, signal);
    return data.Page.airingSchedules.map((entry: any): ScheduleEntry => ({ episode: entry.episode, airingAt: entry.airingAt, anime: mapAniListMedia(entry.media), provider: 'AniList' }));
  } catch (error) {
    primaryError = error;
  }
  try {
    const selectedDate = new Date(startSeconds * 1000);
    const weekday = selectedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const payload = await requestJikan(`/schedules?filter=${weekday}&sfw=true&limit=25`, signal);
    return uniqueMedia((payload.data || []).map((item: any) => mapJikanMedia(item))).map((anime): ScheduleEntry => {
      const original = (payload.data || []).find((item: any) => Number(item.mal_id) === anime.malId);
      const [parsedHour, parsedMinute] = String(original?.broadcast?.time || '12:00').split(':').map(Number);
      const hour = Number.isFinite(parsedHour) ? parsedHour! : 12;
      const minute = Number.isFinite(parsedMinute) ? parsedMinute! : 0;
      const airingDate = new Date(selectedDate);
      airingDate.setHours(hour, minute, 0, 0);
      return { episode: undefined, airingAt: Math.floor(airingDate.getTime() / 1000), anime, provider: 'Jikan' };
    });
  } catch (fallbackError) {
    throw metadataUnavailable(primaryError, fallbackError);
  }
}

export async function fetchGenres(signal?: AbortSignal) {
  try {
    const data = await graphQL<{ GenreCollection: string[] }>('query { GenreCollection }', {}, signal);
    return data.GenreCollection;
  } catch {
    const payload = await requestJikan('/genres/anime', signal);
    const genres = (payload.data || []).map((genre: any) => {
      jikanGenreIds.set(String(genre.name).toLowerCase(), Number(genre.mal_id));
      return String(genre.name);
    });
    return genres.filter(Boolean);
  }
}

export async function searchCompare(query: string, signal?: AbortSignal) {
  if (!query.trim()) return [];
  const result = await searchAnime({ query, sort: 'POPULARITY_DESC' }, signal);
  return result.items.slice(0, 8);
}
