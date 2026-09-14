import { fetchAniList, fetchJikanPath, mapAnilistToJikan } from './jikan';
import { desktopDataError } from '../lib/desktopData';
import { fetchRecentEpisodeListings } from './desktopRecentEpisodes';
import { readCachedExploreTitles } from '../lib/desktopExploreCache';
import { readCachedWatchTitles } from '../lib/desktopWatchSnapshot';
import { useStore } from '../store/useStore';

export type ExploreService = 'mal' | 'anilist';
export interface ExploreRequest {
  mode: string; service: ExploreService; query: string; genre: string; format: string;
  status: string; sort: string; year?: number; season?: string; adult: boolean; before?: number;
  allowFallback?: boolean;
  releasedAfter?: string;
}
export interface ExplorePage {
  data: any[]; page: number; hasNextPage: boolean; service: ExploreService; fetchedAt: number; before?: number;
  fallback?: boolean;
  fallbackLabel?: string;
  paginationVersion?: 2;
  recentFeedKind?: 'listed';
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
  // Standard MAL catalog pages are available even when Jikan's upstream
  // advanced-search combinations time out. Do not turn plain shelves into searches.
  if (['ranking', 'top'].includes(request.mode) && !request.query && request.genre === 'Any'
    && !request.year && !request.releasedAfter && ['best', 'score', 'popular'].includes(request.sort)
    && (request.status === 'Any' || request.sort !== 'popular')) {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    if (request.format !== 'Any') params.set('type', request.format.toLowerCase());
    if (request.sort === 'popular') params.set('filter', 'bypopularity');
    else if (request.status === 'Airing') params.set('filter', 'airing');
    else if (request.status === 'Upcoming') params.set('filter', 'upcoming');
    if (request.status !== 'Completed') return `/top/anime${params.size ? `?${params}` : ''}`;
  }
  const plain = !request.query && request.genre === 'Any' && request.format === 'Any'
    && request.status === 'Any' && !request.releasedAfter;
  const standard = new URLSearchParams();
  if (page > 1) standard.set('page', String(page));
  const endpoint = (path: string) => `${path}${standard.size ? `?${standard}` : ''}`;
  if (plain && (request.sort === 'best' || (request.sort === 'score' && ['airing', 'top', 'ranking'].includes(request.mode)))) {
    if (request.mode === 'seasonal' && request.year && /^(winter|spring|summer|fall)$/i.test(request.season || '')) {
      return endpoint(`/seasons/${request.year}/${request.season!.toLowerCase()}`);
    }
    if (!request.year && ['popular', 'airing', 'upcoming', 'top', 'ranking'].includes(request.mode)) {
      const filter = ({ popular: 'bypopularity', airing: 'airing', upcoming: 'upcoming' } as Record<string, string>)[request.mode];
      if (filter) standard.set('filter', filter);
      return endpoint('/top/anime');
    }
  }
  // Jikan defaults to 25 items and page one. Content filtering is performed on
  // every response below; adding sfw to search causes upstream 504s on this host.
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  const order = exploreOrder(request);
  const unfilteredScore = ['ranking', 'top'].includes(request.mode) && order === 'score' && !request.query && request.genre === 'Any'
    && request.format === 'Any' && request.status === 'Any' && !request.year && !request.releasedAfter;
  if (unfilteredScore) return `/top/anime?${params}`;
  if (request.query) params.set('q', request.query);
  if (genres[request.genre]) params.set('genres', String(genres[request.genre]));
  if (request.format !== 'Any') params.set('type', request.format.toLowerCase());
  const status = ({ Airing: 'airing', Completed: 'complete', Upcoming: 'upcoming' } as Record<string, string>)[request.status]
    || (request.mode === 'airing' ? 'airing' : request.mode === 'upcoming' ? 'upcoming' : undefined);
  if (status) params.set('status', status);
  if (order !== 'match') {
    params.set('order_by', ({ popular: 'members', score: 'score', recent: 'start_date', title: 'title' } as Record<string, string>)[order] || 'score');
    params.set('sort', order === 'title' || (request.mode === 'upcoming' && request.sort === 'best') ? 'asc' : 'desc');
  }
  if (request.year) { params.set('start_date', `${request.year}-01-01`); params.set('end_date', `${request.year}-12-31`); }
  if (request.season && request.year) {
    const bounds = ({ WINTER: ['01-01', '03-31'], SPRING: ['04-01', '06-30'], SUMMER: ['07-01', '09-30'], FALL: ['10-01', '12-31'] } as Record<string, string[]>)[request.season.toUpperCase()];
    if (!bounds) throw new Error('Invalid catalog season.');
    params.set('start_date', `${request.year}-${bounds[0]}`);
    params.set('end_date', `${request.year}-${bounds[1]}`);
  }
  if (request.releasedAfter && request.releasedAfter > (params.get('start_date') || '')) params.set('start_date', request.releasedAfter);
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
    releasedAfter: request.releasedAfter ? Number(request.releasedAfter.replaceAll('-', '')) : null,
    sort: [request.mode === 'upcoming' && request.sort === 'best' ? 'START_DATE' : ({ score: 'SCORE_DESC', popular: 'POPULARITY_DESC', title: 'TITLE_ROMAJI', recent: 'START_DATE_DESC', match: 'SEARCH_MATCH' } as Record<string, string>)[order] || 'TRENDING_DESC', 'ID'],
  };
  return { query: `query($page:Int,$search:String,$genre:String,$format:MediaFormat,$status:MediaStatus,$year:Int,$season:MediaSeason,$adult:Boolean,$sort:[MediaSort],$releasedAfter:FuzzyDateInt) {
    Page(page:$page,perPage:25) { pageInfo { hasNextPage } media(type:ANIME,search:$search,genre:$genre,format:$format,status:$status,seasonYear:$year,season:$season,isAdult:$adult,sort:$sort,startDate_greater:$releasedAfter) { ${fields} } }
  }`, variables };
}
function savedExploreAlternative(request: ExploreRequest): ExplorePage | null {
  if (request.mode === 'ranking') return null;
  let stored: any[];
  try { const store=useStore.getState(); stored=[...(store.myList || []),...(store.likedAnimes || []),...readCachedWatchTitles(),...readCachedExploreTitles()]; } catch { return null; }
  const seen=new Set<string>();
  const data=stored.filter(item => {
    const id=String(item.mal_id || item.anilist_id || item.id || item.title || '');
    if (!id || seen.has(id) || !item.title || (!request.adult && jikanAdultTitle(item))) return false;
    if (request.query && !String(item.title).toLowerCase().includes(request.query.toLowerCase())) return false;
    if (request.genre !== 'Any' && !item.genres?.some((genre:any) => (genre.name || genre) === request.genre)) return false;
    if (request.format !== 'Any' && String(item.type || item.format).toLowerCase() !== request.format.toLowerCase()) return false;
    if (request.year && Number(item.year || item.seasonYear) !== request.year) return false;
    if (request.season && String(item.season || '').toLowerCase() !== request.season.toLowerCase()) return false;
    const start = item.aired?.from || (typeof item.startDate === 'string' ? item.startDate : '');
    if (request.releasedAfter && (!start || String(start).slice(0,10) < request.releasedAfter)) return false;
    if (request.status !== 'Any') { const status=String(item.status || '').toLowerCase(); if (!(request.status === 'Airing' ? /airing|releasing/.test(status) && !/not yet/.test(status) : request.status === 'Completed' ? /finished|complete/.test(status) : /not.yet|upcoming/.test(status))) return false; }
    seen.add(id); return true;
  }).sort((a,b) => {
    const order = exploreOrder(request);
    if (order === 'title') return String(a.title).localeCompare(String(b.title));
    if (order === 'score') return Number(b.score || 0)-Number(a.score || 0);
    if (order === 'popular') return Number(b.members || b.popularity || 0)-Number(a.members || a.popularity || 0);
    if (order === 'recent') return String(b.aired?.from || '').localeCompare(String(a.aired?.from || ''));
    return 0;
  }).slice(0,100).map(item => ({...item,catalogAlternative:true}));
  if (!data.length) return null;
  return {data,page:1,hasNextPage:false,service:'mal',fetchedAt:Date.now(),fallback:true,fallbackLabel:'Saved titles from this device · live feeds are unavailable. These are browsing alternatives, not current rankings or new releases.'};
}
export async function fetchExplorePage(request: ExploreRequest, page: number, signal?: AbortSignal): Promise<ExplorePage> {
  try {
    return await fetchSelectedExplorePage(request, page, signal);
  } catch (error) {
    const failure = desktopDataError(request.service, error);
    if (signal?.aborted || failure.code === 'cancelled') throw error;
    if (request.service === 'mal' && page === 1 && request.mode !== 'ranking') {
      const saved = savedExploreAlternative(request); if (saved) return saved;
    }
    // Never splice a different ranking or pagination sequence into an existing list.
    if (!request.allowFallback || request.service !== 'anilist' || page !== 1
      ) throw error;
    try {
      const result = await fetchSelectedExplorePage({ ...request, service: 'mal' }, page, signal);
      return { ...result, fallback: true };
    } catch (secondaryError) {
      if (signal?.aborted || desktopDataError('jikan', secondaryError).code === 'cancelled') throw secondaryError;
      const saved = savedExploreAlternative(request); if (saved) return saved;
      const secondaryFailure = desktopDataError('jikan', secondaryError);
      throw new Error(`AniList unavailable (${failure.code}). Jikan fallback unavailable (${secondaryFailure.code}). Retry after the provider cooldown or check your connection.`);
    }
  }
}

async function fetchSelectedExplorePage(request: ExploreRequest, page: number, signal?: AbortSignal): Promise<ExplorePage> {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('Invalid catalog page.');
  if (request.service === 'mal') {
    if (request.mode === 'trending' && !request.query) {
      const result = await fetchSelectedExplorePage({ ...request, mode:'popular', sort:request.sort === 'best' ? 'popular' : request.sort }, page, signal);
      return { ...result, fallback:true, fallbackLabel:'Popular on MyAnimeList · an alternative while live Trending is unavailable.' };
    }
    if (request.mode === 'new' && !request.query) {
      if (page !== 1) throw new Error('The recent-additions feed has one page.');
      try {
      if (request.genre !== 'Any' || request.format !== 'Any' || request.status !== 'Any' || request.year || request.releasedAfter || !['best','title'].includes(request.sort)) throw new Error('Use the filtered airing catalog.');
      const feed = await fetchRecentEpisodeListings(signal);
      const data = feed.data.filter((item: any) => request.adult || !jikanAdultTitle(item));
      if (request.sort === 'title') data.sort((a: any,b: any) => a.title.localeCompare(b.title));
      return { data, page:1, hasNextPage:false, service:'mal', paginationVersion:2, fetchedAt:Date.now(), recentFeedKind:'listed' };
      } catch(error) {
        if (signal?.aborted || ['cancelled','access-denied','rate-limited'].includes(desktopDataError('jikan',error).code)) throw error;
        const result = await fetchSelectedExplorePage({ ...request, mode:'airing', sort:request.sort === 'best' ? 'popular' : request.sort },1,signal);
        return { ...result, data:result.data.map(item => ({...item,catalogAlternative:true})), hasNextPage:false, fallback:true, fallbackLabel:'Currently airing on MyAnimeList · fresh episode listings are unavailable; these are series, not confirmed new releases.' };
      }
    }
    if (request.format === 'TV Short') throw new Error('Choose All formats or TV for MAL rankings.');
    const response = await fetchJikanPath(malExplorePath(request, page), 900, { signal });
    if (!response.ok) throw new Error('MAL rankings are temporarily unavailable.');
    const payload = await response.json();
    if (!Array.isArray(payload.data) || typeof payload.pagination?.has_next_page !== 'boolean') throw new Error('Incomplete MAL rankings response.');
    const visible = payload.data.map((item: any, index: number) => ({ ...item, rankingPosition: (page - 1) * 25 + index + 1 })).filter((item: any) => request.adult || !jikanAdultTitle(item));
    return { data: visible.map((item: any) => ({ ...item, rankingService: 'mal', rankingScore: item.score })),
      paginationVersion: 2, page, hasNextPage: payload.pagination.has_next_page, service: 'mal', fetchedAt: Date.now() };
  }
  const recent = request.mode === 'new' && !request.query;
  const before = request.before ?? Math.floor(Date.now() / 1000);
  const query = recent ? { query: `query($page:Int,$end:Int,$start:Int) { Page(page:$page,perPage:25) { pageInfo { hasNextPage }
    airingSchedules(airingAt_lesser:$end,airingAt_greater:$start,sort:TIME_DESC) { episode airingAt media { ${fields} } } } }`,
    variables: { page, end: before, start: request.releasedAfter ? Math.floor(Date.parse(request.releasedAfter) / 1000) : null } } : animeExploreQuery(request, page);
  const response = await fetchAniList(query, 900, { signal });
  if (!response.ok) throw new Error('Anime list is temporarily unavailable.');
  const payload = await response.json();
  const result = payload?.data?.Page;
  const items = recent ? result?.airingSchedules : result?.media;
  if (payload.errors?.length || !Array.isArray(items) || typeof result?.pageInfo?.hasNextPage !== 'boolean') throw new Error('Incomplete anime list response.');
  const data = items.map((entry: any, index: number) => {
    const media = recent ? entry.media : entry;
    if (!media?.id || !media.title) throw new Error('Invalid anime identity.');
    return { ...mapAnilistToJikan(media), rankingPosition: (page - 1) * 25 + index + 1, rankingService: 'anilist', rankingScore: media.averageScore,
      ...(recent ? { latestEpisode: entry.episode, airingAt: entry.airingAt } : {}) };
  }).filter((item: any) => request.adult || !item.isAdult);
  return { data, paginationVersion: 2, page, hasNextPage: result.pageInfo.hasNextPage, service: 'anilist', fetchedAt: Date.now(), ...(recent ? { before } : {}) };
}

export function jikanAdultTitle(item: any): boolean {
  return item?.isAdult === true || /^r[x+]/i.test(String(item?.rating || '').trim())
    || [...(item?.genres || []), ...(item?.explicit_genres || [])].some((genre: any) =>
      [9, 12, 49].includes(Number(genre?.mal_id)) || /^(ecchi|hentai|erotica)$/i.test(String(genre?.name || '')));
}
