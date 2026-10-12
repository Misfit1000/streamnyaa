import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const bridge = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/desktop', () => ({ isDesktopApp: () => true, fetchDesktopMetadataApi: bridge }));
beforeEach(() => { vi.resetModules(); bridge.mockReset(); localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-09T00:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });
describe('desktop catalog provider cooldown', () => {
  it('returns requested episodes first and resolves the final page independently', async () => {
    const { fetchAnimeEpisodeWindow, fetchAnimeEpisodeTail, mergeAnimeEpisodeTail } = await import('../../src/api/jikan');
    bridge.mockResolvedValueOnce({ data: { data: [{ mal_id: 100, aired: '2001-01-01' }], pagination: { last_visible_page: 12, has_next_page: true } } });
    bridge.mockResolvedValueOnce({ data: { data: [{ mal_id: 1150, aired: '2026-01-01' }], pagination: { last_visible_page: 12, has_next_page: false } } });
    const result = await fetchAnimeEpisodeWindow('21');
    expect(result.data.map((item: any) => item.mal_id)).toEqual([100]);
    expect(result.latestPageResolved).toBe(false);
    expect(bridge).toHaveBeenCalledTimes(1);
    const tail = await fetchAnimeEpisodeTail('21', result.latestPage);
    const merged = mergeAnimeEpisodeTail(result, tail);
    expect(merged.data.map((item: any) => item.mal_id)).toEqual([100, 1150]);
    expect(merged.latestPageResolved).toBe(true);
    expect(JSON.stringify(bridge.mock.calls[1])).toContain('page=12');
  });
  it('retains partial episodes while marking an unavailable final page as unresolved', async () => {
    const { fetchAnimeEpisodeWindow } = await import('../../src/api/jikan');
    bridge.mockResolvedValueOnce({ data: { data: [{ mal_id: 100 }], pagination: { last_visible_page: 12, has_next_page: true } } });
    bridge.mockRejectedValueOnce({ code: 'error', provider: 'jikan', message: 'Timeout', statusCode: 504 });
    const result = await fetchAnimeEpisodeWindow('21');
    expect(result.data).toHaveLength(1);
    expect(result.latestPageResolved).toBe(false);
    expect(bridge).toHaveBeenCalledTimes(1);
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
  it('does not re-age native cached content when copied into local storage', async () => {
    const { fetchAniList } = await import('../../src/api/jikan');
    const original = Date.now() - 45_000;
    bridge.mockResolvedValueOnce({ data: { data: { Media: { id: 1 } } }, cache_status: 'memory', fetched_at: original });
    const first = await fetchAniList({ query: 'preserve-origin' }, 60);
    expect(Number(first.headers.get('X-StreamNyaa-Fetched-At'))).toBe(original);
    vi.setSystemTime(Date.now() + 20_000);
    bridge.mockRejectedValueOnce({ code:'error', message:'Unavailable', retryable:true });
    const stale = await fetchAniList({ query: 'preserve-origin' }, 60);
    expect(bridge).toHaveBeenCalledTimes(2);
    expect(stale.headers.get('X-StreamNyaa-Local-Cache')).toBe('local-stale');
    expect(Number(stale.headers.get('X-StreamNyaa-Fetched-At'))).toBe(original);
  });
  it('preserves the original absolute retry deadline when a cached failure is observed again', async () => {
    const { fetchAniList } = await import('../../src/api/jikan');
    const retryAt = Date.now() + 60_000;
    bridge.mockRejectedValueOnce({code:'rate-limited',provider:'anilist',message:'Wait',retryable:true,retryAt,retryAfterMs:60_000});
    await expect(fetchAniList({query:'deadline-one'})).rejects.toMatchObject({retryAt});
    vi.setSystemTime(Date.now() + 50_000);
    await expect(fetchAniList({query:'deadline-two'})).rejects.toMatchObject({retryAt});
    expect(bridge).toHaveBeenCalledTimes(1);
  });
  it('does not treat a queued local request as a failed provider', async () => {
    const { fetchAniList } = await import('../../src/api/jikan');
    bridge.mockRejectedValueOnce({code:'queued',origin:'local-admission',message:'Queued',retryable:true,retryAt:Date.now()+2100});
    await expect(fetchAniList({query:'queued'})).rejects.toMatchObject({code:'queued'});
    bridge.mockResolvedValueOnce({data:{data:{Media:{id:2}}},fetched_at:Date.now()});
    expect((await fetchAniList({query:'other'})).ok).toBe(true);
    expect(bridge).toHaveBeenCalledTimes(2);
  });
  it('uses one cooldown recovery probe while other consumers wait', async () => {
    const { fetchAniList } = await import('../../src/api/jikan');
    bridge.mockRejectedValueOnce({code:'rate-limited',provider:'anilist',message:'Wait',retryable:true,retryAfterMs:60_000});
    await expect(fetchAniList({query:'before-probe'})).rejects.toMatchObject({code:'rate-limited'});
    vi.setSystemTime(Date.now()+60_001);
    let release!:(value:unknown)=>void;
    bridge.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const first=fetchAniList({query:'probe-one'});
    const second=fetchAniList({query:'probe-two'});
    await Promise.resolve(); await Promise.resolve();
    expect(bridge).toHaveBeenCalledTimes(2);
    const retryAt=Date.now()+60_000;
    // A failed probe must publish the new cooldown before waiting callers run.
    release(Promise.reject({code:'rate-limited',provider:'anilist',message:'Wait again',retryable:true,retryAt,retryAfterMs:60_000}));
    await expect(first).rejects.toMatchObject({retryAt});
    await expect(second).rejects.toMatchObject({retryAt});
    expect(bridge).toHaveBeenCalledTimes(2);
  });
});
