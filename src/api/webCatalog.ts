import { infiniteQueryOptions } from '@tanstack/react-query';
import { fetchAniList, mapAnilistToJikan } from './jikan';
import { recentFeedBound, validRecentSchedules } from './desktopRecentSchedule';

export type CatalogFeed = 'recent' | 'trending' | 'upcoming' | 'score' | 'popular' | 'search';
export type CatalogRequest = {
  feed: CatalogFeed; query: string; type: string; status: string; rating: string; genre: string;
  adult: boolean; before?: number;
};
export type CatalogPage = { data: any[]; page: number; nextPage?: number; fetchedAt: number; fingerprint: string; streamnyaa?: any };
export function mediaKey(value: any): string {
  const aid = Number(value?.anilist_id), mid = Number(value?.mal_id);
  return aid > 0 ? `anilist:${aid}` : mid > 0 ? `mal:${mid}` : String(value?.canonicalId || '');
}
export function uniqueMedia(items: any[]) {
  const seen = new Set<string>();
  return items.filter(item => { const key = mediaKey(item); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}
export function catalogRequest(params: URLSearchParams, adult: boolean): CatalogRequest {
  const sort = params.get('sort') || 'trending', query = (params.get('q') || '').trim();
  const feed: CatalogFeed = ['recent', 'trending', 'upcoming', 'score', 'popular'].includes(sort) ? sort as CatalogFeed : 'search';
  const before = Number(params.get('before'));
  const effectiveFeed = query ? 'search' : feed;
  const status = params.get('status') || (effectiveFeed === 'trending' || effectiveFeed === 'score' ? 'airing' : effectiveFeed === 'upcoming' ? 'upcoming' : '');
  return { feed: effectiveFeed, query, type: params.get('type') || '', status,
    rating: params.get('rating') || '', genre: params.get('genre') || '', adult,
    ...(feed === 'recent' && !query ? { before: Number.isSafeInteger(before) && before > 0 && before <= Date.now() / 1000 ? before : recentFeedBound() } : {}) };
}
const fields = `id idMal title{romaji english native} synonyms description episodes status format season seasonYear source coverImage{extraLarge large color} bannerImage genres averageScore popularity nextAiringEpisode{episode airingAt} isAdult`;
export async function fetchCatalogPage(request: CatalogRequest, page: number, signal?: AbortSignal): Promise<CatalogPage> {
  const releasing = request.status === 'airing' || request.feed === 'trending' || request.feed === 'score';
  const status = request.feed === 'upcoming' || request.status === 'upcoming' ? 'NOT_YET_RELEASED' : request.status === 'complete' ? 'FINISHED' : releasing ? 'RELEASING' : undefined;
  const variables: Record<string, unknown> = { page, search: request.query || undefined, format: request.type.toUpperCase() || undefined,
    genre: request.genre || undefined, status, adult: !request.adult ? false : request.rating === 'rx' ? true : request.rating ? false : undefined };
  let query: string;
  if (request.feed === 'recent') {
    variables.before = request.before;
    query = `query Recent($page:Int!,$before:Int!){Page(page:$page,perPage:24){pageInfo{currentPage hasNextPage} airingSchedules(airingAt_lesser:$before,sort:TIME_DESC){id airingAt episode media{${fields}}}}}`;
  } else {
    const sort = request.query ? 'SEARCH_MATCH' : request.feed === 'popular' ? 'POPULARITY_DESC' : request.feed === 'score' ? 'SCORE_DESC' : 'TRENDING_DESC';
    query = `query Catalog($page:Int!,$search:String,$format:MediaFormat,$genre:String,$status:MediaStatus,$adult:Boolean){Page(page:$page,perPage:24){pageInfo{currentPage hasNextPage} media(type:ANIME,search:$search,format:$format,genre:$genre,status:$status,isAdult:$adult,sort:${sort}){${fields}}}}`;
  }
  const response = await fetchAniList({ query, variables }, request.feed === 'recent' ? 300 : 900, { signal });
  if (!response.ok) throw Object.assign(Error('Anime information is temporarily unavailable.'), { statusCode: response.status });
  const payload = await response.json(), value = payload?.data?.Page;
  if (payload.errors?.length || !value?.pageInfo || typeof value.pageInfo.hasNextPage !== 'boolean'
    || Number(value.pageInfo.currentPage) !== page || !Array.isArray(value[request.feed === 'recent' ? 'airingSchedules' : 'media'])) {
    throw Error('The catalog returned an incomplete or repeated page.');
  }
  const raw = request.feed === 'recent' ? validRecentSchedules(value.airingSchedules, request.before!) : value.media;
  const items = raw.map((entry: any) => request.feed === 'recent'
    ? { ...mapAnilistToJikan(entry.media), latestEpisode: entry.episode, airingAt: entry.airingAt, recentFeedKind: 'aired' }
    : mapAnilistToJikan(entry));
  const data = uniqueMedia(items.filter((item: any) => (request.adult || !item.isAdult)
    && (!request.type || item.type === request.type.toUpperCase()) && (!status || item.status === status)
    && (!request.genre || item.genres.some((genre: any) => genre.name === request.genre))));
  return { data, page, ...(value.pageInfo.hasNextPage ? { nextPage: page + 1 } : {}),
    fetchedAt: Number(response.headers.get('x-streamnyaa-fetched-at')) || Date.now(),
    fingerprint: raw.map((item: any) => request.feed === 'recent' ? `${item.media.id}:${item.episode}` : item.id).join(','),
    streamnyaa: { status: /stale/i.test(response.headers.get('x-streamnyaa-metadata-cache') || '') ? 'stale' : 'authoritative' } };
}
export function catalogNextPage(last: CatalogPage, pages: CatalogPage[]) {
  if (pages.slice(0, -1).some(page => page.page === last.page || last.fingerprint && page.fingerprint === last.fingerprint)) return undefined;
  return last.nextPage;
}
export function catalogOptions(request: CatalogRequest) {
  return infiniteQueryOptions({ queryKey: ['web-catalog', request], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchCatalogPage(request, pageParam, signal), getNextPageParam: catalogNextPage,
    staleTime: request.feed === 'recent' ? 300_000 : 900_000, retry: false });
}
