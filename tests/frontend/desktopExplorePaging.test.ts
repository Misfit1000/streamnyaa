import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('../../src/api/jikan', () => ({ fetchAniList: vi.fn(), fetchJikanPath: vi.fn(),
  mapAnilistToJikan: (media: any) => ({ anilist_id: media.id, mal_id: media.idMal, title: media.title.english, score: media.averageScore / 10, isAdult: media.isAdult }) }));
import { fetchAniList, fetchJikanPath } from '../../src/api/jikan';
import { animeExploreQuery, malExplorePath, fetchExplorePage, type ExploreRequest } from '../../src/api/desktopExplore';
const base: ExploreRequest = { mode: 'ranking', service: 'anilist', query: '', genre: 'Any', format: 'Any', status: 'Any', sort: 'best', adult: false };
beforeEach(() => vi.clearAllMocks());
describe('separate desktop rankings', () => {
  it('uses MAL top ranking and real underlying pages', () => {
    expect(malExplorePath({ ...base, service: 'mal' }, 5)).toBe('/top/anime?page=5&limit=25&sfw=true');
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
