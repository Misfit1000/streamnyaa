import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('../../src/api/jikan', () => ({ fetchAniList: vi.fn(), fetchJikanPath: vi.fn(),
  mapAnilistToJikan: (media: any) => ({ anilist_id: media.id, mal_id: media.idMal, title: media.title.english, score: media.averageScore / 10, isAdult: media.isAdult }) }));
import { fetchAniList, fetchJikanPath } from '../../src/api/jikan';
import { animeExploreQuery, recentExploreQuery, malExplorePath, fetchExplorePage, jikanAdultTitle, type ExploreRequest } from '../../src/api/desktopExplore';
const base: ExploreRequest = { mode: 'ranking', service: 'anilist', query: '', genre: 'Any', format: 'Any', status: 'Any', sort: 'best', adult: false };
beforeEach(() => vi.clearAllMocks());
describe('separate desktop rankings', () => {
  it('keeps dedicated ranking format and order on the top endpoint', () => {
    expect(malExplorePath({ ...base, mode: 'ranking', format: 'TV', sort: 'score' }, 1)).toBe('/top/anime?type=tv');
    expect(malExplorePath({ ...base, mode: 'ranking', sort: 'popular' }, 1)).toBe('/top/anime?filter=bypopularity');
    expect(malExplorePath({ ...base, mode: 'ranking', year: 2020 }, 1)).toContain('start_date=2020-01-01');
  });
  it('uses the working minimal search shape while retaining explicit filters and pagination', () => {
    expect(malExplorePath({ ...base, mode: 'popular', query: 'naruto' }, 1)).toBe('/anime?q=naruto');
    const path = malExplorePath({ ...base, query: 'naruto', genre: 'Fantasy', status: 'Completed' }, 2);
    expect(path).toContain('page=2');
    expect(path).toContain('genres=10');
    expect(path).toContain('status=complete');
    expect(path).not.toContain('sfw=');
    expect(path).not.toContain('limit=');
  });
  it('uses standard shelf endpoints without upstream advanced-search combinations', () => {
    expect(malExplorePath({ ...base, mode: 'popular' }, 1)).toBe('/top/anime?filter=bypopularity');
    expect(malExplorePath({ ...base, mode: 'airing', sort: 'score' }, 1)).toBe('/top/anime?filter=airing');
    expect(malExplorePath({ ...base, mode: 'seasonal', year: 2026, season: 'SUMMER' }, 1)).toBe('/seasons/2026/summer');
    expect(malExplorePath({ ...base, mode: 'popular', genre: 'Fantasy' }, 1)).toContain('genres=10');
  });
  it('retains client content filtering when using standard provider catalogs', async () => {
    expect(jikanAdultTitle({ rating: 'Rx - Hentai' })).toBe(true);
    expect(jikanAdultTitle({ explicit_genres: [{ mal_id: 49 }] })).toBe(true);
    expect(jikanAdultTitle({ rating: 'PG-13 - Teens 13 or older' })).toBe(false);
    vi.mocked(fetchJikanPath).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ mal_id: 1, rating: 'Rx - Hentai' }, { mal_id: 2, rating: 'PG-13' }], pagination: { has_next_page: true } })));
    const page = await fetchExplorePage({ ...base, service: 'mal' }, 1);
    expect(page.data.map(item => item.mal_id)).toEqual([2]);
    expect(page.data[0].rankingPosition).toBe(2);
    expect(page.hasNextPage).toBe(true);
  });
  it('retains the airing mode when sorting by score on MAL', () => {
    const path = malExplorePath({ ...base, mode: 'airing', sort: 'score', genre: 'Fantasy' }, 1);
    expect(path).toContain('/anime?');
    expect(path).toContain('status=airing');
  });
  it('sends the release boundary to both providers without replacing a stricter season boundary', () => {
    const request = { ...base, mode: 'seasonal', year: 2026, season: 'SUMMER', releasedAfter: '2026-08-10' };
    expect(animeExploreQuery(request, 1).variables.releasedAfter).toBe(20260810);
    expect(malExplorePath(request, 1)).toContain('start_date=2026-08-10');
    expect(malExplorePath({ ...request, releasedAfter: '2026-06-01' }, 1)).toContain('start_date=2026-07-01');
  });
  it('uses the primary exclusively when it succeeds', async () => {
    vi.mocked(fetchAniList).mockResolvedValueOnce(new Response(JSON.stringify({ data: { Page: { media: [], pageInfo: { hasNextPage: false } } } })));
    await fetchExplorePage({ ...base, mode: 'popular', allowFallback: true }, 1);
    expect(fetchJikanPath).not.toHaveBeenCalled();
  });
  it('falls back after denial and keeps MAL identity and pagination', async () => {
    vi.mocked(fetchAniList).mockRejectedValueOnce({ code: 'access-denied', message: 'Denied', retryable: false });
    vi.mocked(fetchJikanPath).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ mal_id: 42, score: 8 }], pagination: { has_next_page: true } })));
    const result = await fetchExplorePage({ ...base, mode: 'popular', allowFallback: true }, 1);
    expect(result).toMatchObject({ service: 'mal', fallback: true, hasNextPage: true });
    expect(result.data[0].anilist_id).toBeUndefined();
  });
  it('identifies both provider failures without presenting an empty result', async () => {
    vi.mocked(fetchAniList).mockRejectedValueOnce({ code: 'access-denied', message: 'Denied', retryable: false });
    vi.mocked(fetchJikanPath).mockRejectedValueOnce({ code: 'timeout', message: 'Timed out', retryable: true });
    await expect(fetchExplorePage({ ...base, mode: 'popular', allowFallback: true }, 1)).rejects.toThrow('AniList unavailable (access-denied). Jikan fallback unavailable (timeout)');
  });
  it('does not switch provider halfway through pagination or rankings', async () => {
    vi.mocked(fetchAniList).mockRejectedValue(new Error('Denied'));
    await expect(fetchExplorePage({ ...base, mode: 'popular', allowFallback: true }, 2)).rejects.toThrow('Denied');
    await expect(fetchExplorePage({ ...base, allowFallback: true }, 2)).rejects.toThrow('Denied');
    expect(fetchJikanPath).not.toHaveBeenCalled();
  });
  it('labels secondary recent listings without treating video IDs as episode numbers', async () => {
    vi.mocked(fetchAniList).mockRejectedValueOnce(new Error('Denied'));
    vi.mocked(fetchJikanPath).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{entry:{mal_id:7,title:'Example'},episodes:[{mal_id:999,title:'Episode 3'}]}] })));
    const page = await fetchExplorePage({ ...base, mode: 'new', allowFallback: true }, 1);
    expect(page.fallback).toBe(true);
    expect(page.data[0]).toMatchObject({mal_id:7,listedEpisode:3,recentFeedKind:'listed'});
    expect(page.data[0].latestEpisode).toBeUndefined();
    expect(fetchJikanPath).toHaveBeenCalledWith('/watch/episodes',600,expect.any(Object));
  });
  it('preserves seasonal, content and airing filters in fallback requests', () => {
    const url = new URL(malExplorePath({ ...base, mode: 'seasonal', year: 2026, season: 'SUMMER', status: 'Airing', genre: 'Fantasy' }, 2), 'https://fixture.test');
    expect(url.searchParams.get('start_date')).toBe('2026-07-01');
    expect(url.searchParams.get('end_date')).toBe('2026-09-30');
    expect(url.searchParams.get('status')).toBe('airing');
    expect(url.searchParams.get('genres')).toBe('10');
    expect(url.searchParams.get('sfw')).toBeNull(); // Applied to response data instead.
  });
  it('uses MAL top ranking and real underlying pages', () => {
    expect(malExplorePath({ ...base, service: 'mal' }, 5)).toBe('/top/anime?page=5');
  });
  it('sends popularity and genre filters before pagination', () => {
    const url = new URL(malExplorePath({ ...base, genre: 'Fantasy', sort: 'popular', status: 'Completed' }, 2), 'https://fixture.test');
    expect(url.searchParams.get('genres')).toBe('10');
    expect(url.searchParams.get('order_by')).toBe('members');
    expect(url.searchParams.get('sort')).toBe('desc');
    expect(url.searchParams.get('status')).toBe('complete');
  });
  it('uses safe GraphQL variables and stable score ordering', () => {
    const request = animeExploreQuery({ ...base, query: '"}) { secret }', genre: 'Fantasy' }, 3);
    expect(request.variables.search).toBe('"}) { secret }');
    expect(request.query).not.toContain('secret');
    expect(animeExploreQuery(base, 1).variables.sort).toEqual(['SCORE_DESC', 'ID']);
    expect(animeExploreQuery({ ...base, mode: 'popular' }, 1).variables.sort[0]).toBe('POPULARITY_DESC');
  });
  it('does not substitute AniList after a MAL failure', async () => {
    vi.mocked(fetchJikanPath).mockRejectedValueOnce(new Error('offline'));
    await expect(fetchExplorePage({ ...base, service: 'mal' }, 1)).rejects.toThrow('offline');
    expect(fetchAniList).not.toHaveBeenCalled();
  });
  it('keeps raw scores and identifiers distinct', async () => {
    vi.mocked(fetchAniList).mockResolvedValueOnce(new Response(JSON.stringify({ data: { Page: {
      pageInfo: { hasNextPage: true }, media: [{ id: 123, idMal: 999, title: { english: 'A' }, averageScore: 91 }],
    } } })));
    const result = await fetchExplorePage(base, 1);
    expect(result.data[0]).toMatchObject({ anilist_id: 123, mal_id: 999, rankingScore: 91, score: 9.1 });
    vi.mocked(fetchJikanPath).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ mal_id: 999, title: 'A', score: 8.6 }], pagination: { has_next_page: false } })));
    const mal = await fetchExplorePage({ ...base, service: 'mal' }, 1);
    expect(mal.data[0]).toMatchObject({ rankingScore: 8.6, mal_id: 999 });
    expect(mal.data[0].anilist_id).toBeUndefined();
  });
  it('rejects incomplete pagination rather than declaring an empty end', async () => {
    vi.mocked(fetchAniList).mockResolvedValueOnce(new Response(JSON.stringify({ data: { Page: { media: [] } } })));
    await expect(fetchExplorePage(base, 1)).rejects.toThrow('Incomplete');
  });
  it('passes cancellation to the selected service', async () => {
    const controller = new AbortController();
    vi.mocked(fetchJikanPath).mockResolvedValueOnce(new Response(JSON.stringify({ data: [], pagination: { has_next_page: false } })));
    await fetchExplorePage({ ...base, service: 'mal' }, 1, controller.signal);
    expect(fetchJikanPath).toHaveBeenCalledWith(expect.any(String), 900, { signal: controller.signal });
  });
  it('orders upcoming premieres nearest first by default', () => {
    expect(animeExploreQuery({ ...base, mode: 'upcoming' }, 1).variables.sort).toEqual(['START_DATE', 'ID']);
  });
  it('retains one schedule time boundary across pages', async () => {
    vi.mocked(fetchAniList).mockImplementation(async () => new Response(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: true }, airingSchedules: [] } } })));
    const request = { ...base, mode: 'new', before: 1700000000 };
    const first = await fetchExplorePage(request, 1);
    const second = await fetchExplorePage(request, 2);
    expect(first.before).toBe(second.before);
    expect(vi.mocked(fetchAniList).mock.calls[1][0].variables.end).toBe(request.before);
  });
});


describe('feed continuity', () => {
  it('labels popular fallback instead of claiming live trending', async () => {
    vi.mocked(fetchAniList).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(fetchJikanPath).mockResolvedValueOnce(new Response(JSON.stringify({data:[{mal_id:42,title:'Popular'}],pagination:{has_next_page:true}})));
    const result=await fetchExplorePage({...base,mode:'trending',allowFallback:true},1);
    expect(result.fallbackLabel).toContain('Popular on MyAnimeList');
    expect(result.data[0].mal_id).toBe(42);
    expect(result.hasNextPage).toBe(true);
  });
  it('never substitutes series when episode listings fail', async () => {
    vi.mocked(fetchJikanPath).mockRejectedValueOnce(new Error('timeout'));
    await expect(fetchExplorePage({...base,service:'mal',mode:'new'},1)).rejects.toThrow();
    expect(fetchJikanPath).toHaveBeenCalledTimes(1);
  });
});

describe('active AniList query filters and episode freshness', () => {
  it('omits absent filters from arguments, declarations, and variables', () => {
    const result = animeExploreQuery({...base,mode:'popular'},1);
    for (const key of ['search','genre','format','status','year','season','releasedAfter']) {
      expect(result.query).not.toContain(`$${key}`);
      expect(result.variables).not.toHaveProperty(key);
    }
    expect(result.variables.adult).toBe(false);
    expect(result.query).toContain('isAdult:$adult');
    expect(animeExploreQuery({...base,adult:true},1).query).not.toContain('isAdult:');
  });
  it('includes only a real lower bound for recent schedules', () => {
    const plain = recentExploreQuery(base,1,1700000000);
    expect(plain.query).not.toContain('$start');
    expect(plain.variables).not.toHaveProperty('start');
    const dated = recentExploreQuery({...base,releasedAfter:'2026-09-10'},2,1800000000);
    expect(dated.query).toContain('airingAt_greater:$start');
    expect(dated.variables.start).toBe(Date.parse('2026-09-10')/1000);
    expect(() => recentExploreQuery({...base,releasedAfter:'bad'},1,1800000000)).toThrow();
  });
  it('retains original retrieval time and staleness from a cached episode response', async () => {
    vi.mocked(fetchJikanPath).mockResolvedValueOnce(new Response(JSON.stringify({data:[{entry:{mal_id:1,title:'Example'},episodes:[{title:'Episode 7'}]}]}),{headers:{'X-StreamNyaa-Fetched-At':'1700000000000','X-StreamNyaa-Desktop-Cache':'stale'}}));
    const result=await fetchExplorePage({...base,service:'mal',mode:'new'},1);
    expect(result).toMatchObject({fetchedAt:1700000000000,stale:true,recentFeedKind:'listed'});
    expect(result.data[0].listedEpisode).toBe(7);
    expect(result.data[0].catalogAlternative).toBeUndefined();
  });
  it('does not fall back after cancellation', async () => {
    const controller=new AbortController();controller.abort();
    await expect(fetchExplorePage({...base,mode:'new',allowFallback:true},1,controller.signal)).rejects.toThrow();
    expect(fetchJikanPath).not.toHaveBeenCalled();
  });
});
