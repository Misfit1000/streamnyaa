import { fetchAniList, fetchJikanPath, mapAnilistToJikan } from './jikan';

export type ExploreService = 'mal' | 'anilist';
export interface ExploreRequest {
  mode: string; service: ExploreService; query: string; genre: string; format: string;
  status: string; sort: string; year?: number; season?: string; adult: boolean; before?: number;
}
export interface ExplorePage {
  data: any[]; page: number; hasNextPage: boolean; service: ExploreService; fetchedAt: number; before?: number;
}
const fields = `id idMal title { romaji english native } synonyms description episodes status format
  season seasonYear coverImage { extraLarge large color } bannerImage genres averageScore popularity
  nextAiringEpisode { episode airingAt } isAdult`;
const genres: Record<string, number> = { Action: 1, Adventure: 2, Comedy: 4, Mystery: 7, Drama: 8,
  Fantasy: 10, Romance: 22, 'Sci-Fi': 24, Sports: 30, 'Slice of Life': 36, Supernatural: 37, Thriller: 41 };
export function exploreOrder(request: ExploreRequest) {
  if (request.sort !== 'best') return request.sort;
  if (request.query) return 'match';
  if (['ranking', 'top', 'year'].includes(request.mode)) return 'score';
  if (['popular', 'seasonal'].includes(request.mode)) return 'popular';
  if (request.mode === 'upcoming') return 'recent';
  return 'trending';
}
export function malExplorePath(request: ExploreRequest, page: number) {
  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (!request.adult) params.set('sfw', 'true');
  const order = exploreOrder(request);
  const unfilteredScore = order === 'score' && !request.query && request.genre === 'Any'
    && request.format === 'Any' && request.status === 'Any' && !request.year;
  if (unfilteredScore) return `/top/anime?${params}`;
  if (request.query) params.set('q', request.query);
  if (genres[request.genre]) params.set('genres', String(genres[request.genre]));
  if (request.format !== 'Any') params.set('type', request.format.toLowerCase());
  const status = ({ Airing: 'airing', Completed: 'complete', Upcoming: 'upcoming' } as Record<string, string>)[request.status];
  if (status) params.set('status', status);
  params.set('order_by', ({ popular: 'members', score: 'score', recent: 'start_date', title: 'title' } as Record<string, string>)[order] || 'score');
  params.set('sort', order === 'title' ? 'asc' : 'desc');
  if (request.year) { params.set('start_date', `${request.year}-01-01`); params.set('end_date', `${request.year}-12-31`); }
  return `/anime?${params}`;
}
export function animeExploreQuery(request: ExploreRequest, page: number) {
  const order = exploreOrder(request);
  const variables = { page, search: request.query || null, genre: request.genre === 'Any' ? null : request.genre,
    format: request.format === 'Any' ? null : request.format.toUpperCase().replaceAll(' ', '_'),
    status: ({ Airing: 'RELEASING', Completed: 'FINISHED', Upcoming: 'NOT_YET_RELEASED' } as Record<string, string>)[request.status]
      || (request.mode === 'airing' ? 'RELEASING' : request.mode === 'upcoming' ? 'NOT_YET_RELEASED' : null),
    year: request.year || null, season: request.season?.toUpperCase() || null,
    adult: request.adult ? null : false,
    sort: [request.mode === 'upcoming' && request.sort === 'best' ? 'START_DATE' : ({ score: 'SCORE_DESC', popular: 'POPULARITY_DESC', title: 'TITLE_ROMAJI', recent: 'START_DATE_DESC', match: 'SEARCH_MATCH' } as Record<string, string>)[order] || 'TRENDING_DESC', 'ID'],
  };
  return { query: `query($page:Int,$search:String,$genre:String,$format:MediaFormat,$status:MediaStatus,$year:Int,$season:MediaSeason,$adult:Boolean,$sort:[MediaSort]) {
    Page(page:$page,perPage:25) { pageInfo { hasNextPage } media(type:ANIME,search:$search,genre:$genre,format:$format,status:$status,seasonYear:$year,season:$season,isAdult:$adult,sort:$sort) { ${fields} } }
  }`, variables };
}
export async function fetchExplorePage(request: ExploreRequest, page: number, signal?: AbortSignal): Promise<ExplorePage> {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('Invalid catalog page.');
  if (request.service === 'mal') {
    if (request.format === 'TV Short') throw new Error('Choose All formats or TV for MAL rankings.');
    const response = await fetchJikanPath(malExplorePath(request, page), 900, { signal });
    if (!response.ok) throw new Error('MAL rankings are temporarily unavailable.');
    const payload = await response.json();
    if (!Array.isArray(payload.data) || typeof payload.pagination?.has_next_page !== 'boolean') throw new Error('Incomplete MAL rankings response.');
    return { data: payload.data.map((item: any) => ({ ...item, rankingService: 'mal', rankingScore: item.score })),
      page, hasNextPage: payload.pagination.has_next_page, service: 'mal', fetchedAt: Date.now() };
  }
  const recent = request.mode === 'new' && !request.query;
  const before = request.before ?? Math.floor(Date.now() / 1000);
  const query = recent ? { query: `query($page:Int,$end:Int) { Page(page:$page,perPage:25) { pageInfo { hasNextPage }
    airingSchedules(airingAt_lesser:$end,sort:TIME_DESC) { episode airingAt media { ${fields} } } } }`,
    variables: { page, end: before } } : animeExploreQuery(request, page);
  const response = await fetchAniList(query, 900, { signal });
  if (!response.ok) throw new Error('Anime list is temporarily unavailable.');
  const payload = await response.json();
  const result = payload?.data?.Page;
  const items = recent ? result?.airingSchedules : result?.media;
  if (payload.errors?.length || !Array.isArray(items) || typeof result?.pageInfo?.hasNextPage !== 'boolean') throw new Error('Incomplete anime list response.');
  const data = items.map((entry: any) => {
    const media = recent ? entry.media : entry;
    if (!media?.id || !media.title) throw new Error('Invalid anime identity.');
    return { ...mapAnilistToJikan(media), rankingService: 'anilist', rankingScore: media.averageScore,
      ...(recent ? { latestEpisode: entry.episode, airingAt: entry.airingAt } : {}) };
  }).filter((item: any) => request.adult || !item.isAdult);
  return { data, page, hasNextPage: result.pageInfo.hasNextPage, service: 'anilist', fetchedAt: Date.now(), ...(recent ? { before } : {}) };
}
