import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const bridge = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/desktop', () => ({ isDesktopApp: () => true, fetchDesktopMetadataApi: bridge }));
beforeEach(() => { vi.resetModules(); bridge.mockReset(); localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-09T00:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });
describe('desktop catalog provider cooldown', () => {
  it('resolves the final episode page rather than calling the first hundred the latest', async () => {
    const { fetchAnimeEpisodeWindow } = await import('../../src/api/jikan');
    bridge.mockResolvedValueOnce({ data: { data: [{ mal_id: 100, aired: '2001-01-01' }], pagination: { last_visible_page: 12, has_next_page: true } } });
    bridge.mockResolvedValueOnce({ data: { data: [{ mal_id: 1150, aired: '2026-01-01' }], pagination: { last_visible_page: 12, has_next_page: false } } });
    const result = await fetchAnimeEpisodeWindow('21');
    expect(result.data.map((item: any) => item.mal_id)).toEqual([100, 1150]);
    expect(result.latestPageResolved).toBe(true);
    expect(JSON.stringify(bridge.mock.calls[1])).toContain('page=12');
  });
  it('retains partial episodes while marking an unavailable final page as unresolved', async () => {
    const { fetchAnimeEpisodeWindow } = await import('../../src/api/jikan');
    bridge.mockResolvedValueOnce({ data: { data: [{ mal_id: 100 }], pagination: { last_visible_page: 12, has_next_page: true } } });
    bridge.mockRejectedValueOnce({ code: 'error', provider: 'jikan', message: 'Timeout', statusCode: 504 });
    const result = await fetchAnimeEpisodeWindow('21');
    expect(result.data).toHaveLength(1);
    expect(result.latestPageResolved).toBe(false);
  });
  it('loads matching basic details when AniList and full details fail', async () => {
    const { fetchAnimeDetails } = await import('../../src/api/jikan');
    bridge.mockRejectedValueOnce({ code: 'access-denied', provider: 'anilist', message: 'Denied', retryable: false });
    bridge.mockRejectedValueOnce({ code: 'error', provider: 'jikan', message: 'Upstream 504', statusCode: 504 });
    bridge.mockResolvedValueOnce({ data: { data: { mal_id: 52991, title: 'Matching title', episodes: 28, status: 'Finished Airing' } } });
    const result = await fetchAnimeDetails('52991', { malId: 52991 });
    expect(result.data.mal_id).toBe(52991);
    expect(result.data.episodes).toBe(28);
    expect(bridge).toHaveBeenCalledTimes(3);
  });
  it('omits the redundant first-page episode parameter', async () => {
    const { fetchAnimeEpisodes } = await import('../../src/api/jikan');
    bridge.mockResolvedValueOnce({ data: { data: [{ mal_id: 1 }], pagination: { has_next_page: false } } });
    await fetchAnimeEpisodes('21');
    expect(JSON.stringify(bridge.mock.calls[0])).toContain('/anime/21/episodes');
    expect(JSON.stringify(bridge.mock.calls[0])).not.toContain('page=1');
  });
  it('keeps a failed search from disabling Calendar while bounding repeated failed requests', async () => {
    const { fetchJikanPath } = await import('../../src/api/jikan');
    bridge.mockRejectedValueOnce({ code: 'error', provider: 'jikan', message: 'Upstream 504', statusCode: 504, retryable: true });
    await expect(fetchJikanPath('/anime?q=failed')).rejects.toMatchObject({ statusCode: 504 });
    await expect(fetchJikanPath('/anime?q=failed')).rejects.toMatchObject({ statusCode: 504 });
    expect(bridge).toHaveBeenCalledTimes(1);
    bridge.mockResolvedValueOnce({ data: { data: [{ mal_id: 1 }], pagination: { has_next_page: false } }, cache_status: 'network' });
    expect((await fetchJikanPath('/schedules')).ok).toBe(true);
    expect(bridge).toHaveBeenCalledTimes(2);
    // Successful schedules do not clear the separate failed-search cooldown.
    await expect(fetchJikanPath('/anime?q=failed')).rejects.toMatchObject({ statusCode: 504 });
    expect(bridge).toHaveBeenCalledTimes(2);
  });
  it('suppresses denied requests across consumers and retries the primary after cooldown', async () => {
    const { fetchAniList } = await import('../../src/api/jikan');
    bridge.mockRejectedValueOnce({ code: 'access-denied', provider: 'anilist', message: 'Denied', retryable: false });
    await expect(fetchAniList({ query: 'first' })).rejects.toMatchObject({ code: 'access-denied' });
    await expect(fetchAniList({ query: 'second' })).rejects.toMatchObject({ code: 'access-denied' });
    expect(bridge).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 300_001);
    bridge.mockResolvedValueOnce({ data: { data: { Media: { id: 1 } } }, cache_status: 'network' });
    expect((await fetchAniList({ query: 'second' })).ok).toBe(true);
    expect(bridge).toHaveBeenCalledTimes(2);
  });
  it('retains stale content during a provider outage', async () => {
    const { fetchAniList } = await import('../../src/api/jikan');
    bridge.mockResolvedValueOnce({ data: { data: { Media: { id: 1 } } } });
    await fetchAniList({ query: 'saved' }, 60);
    vi.setSystemTime(Date.now() + 61_000);
    bridge.mockRejectedValueOnce({ code: 'error', message: 'Unavailable', retryable: true });
    const response = await fetchAniList({ query: 'saved' }, 60);
    expect(response.headers.get('X-StreamNyaa-Local-Cache')).toBe('local-stale');
    expect(await response.json()).toEqual({ data: { Media: { id: 1 } } });
  });
  it('does not let cancellation disable other consumers', async () => {
    const { fetchAniList } = await import('../../src/api/jikan');
    bridge.mockRejectedValueOnce({ code: 'cancelled', message: 'Cancelled', retryable: false });
    await expect(fetchAniList({ query: 'cancelled' })).rejects.toMatchObject({ code: 'cancelled' });
    bridge.mockResolvedValueOnce({ data: { data: { Media: { id: 2 } } } });
    expect((await fetchAniList({ query: 'next' })).ok).toBe(true);
    expect(bridge).toHaveBeenCalledTimes(2);
  });
});
