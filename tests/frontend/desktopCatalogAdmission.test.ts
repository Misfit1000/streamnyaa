import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/api/jikan', () => ({ fetchAniList: vi.fn(), mapAnilistToJikan: (value: any) => ({ ...value, title: value.title.romaji, anilist_id: value.id }) }));
import { fetchAniList } from '../../src/api/jikan';
import { fetchHomeShelf } from '../../src/api/desktopHomeBatch';
import { exploreYear, rememberExploreYear, switchExploreMode } from '../../src/lib/desktopExploreFilters';
import { catalogTitleVisible, localPlayableAnimeIds } from '../../src/lib/desktopCatalogAvailability';
import type { DesktopAvailabilityRecord } from '../../src/lib/desktopAvailability';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());
describe('Home admission and compatible batching', () => {
  it('batches simultaneous visible shelves and preserves the provider retrieval time', async () => {
    vi.mocked(fetchAniList).mockResolvedValue(new Response(JSON.stringify({ data: {
      s0: { media: [{ id: 1, title: { romaji: 'First' } }] }, s1: { media: [{ id: 2, title: { romaji: 'Second' } }] },
    } }), { headers: { 'X-StreamNyaa-Fetched-At': '1700000000000' } }));
    const first = fetchHomeShelf('home:popular');
    const second = fetchHomeShelf('home:top-airing');
    await vi.runAllTimersAsync();
    const result = await Promise.all([first, second]);
    expect(fetchAniList).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchAniList).mock.calls[0][0].query).toContain('s1: Page');
    expect(result.map(value => value.data[0].title)).toEqual(['First', 'Second']);
    expect(result.every(value => value.fetchedAt === 1700000000000)).toBe(true);
  });
  it('removes abandoned intent before any network admission', async () => {
    const controller = new AbortController();
    const result = fetchHomeShelf('home:popular', { signal: controller.signal }).catch(error => error.name);
    controller.abort();
    await vi.runAllTimersAsync();
    expect(await result).toBe('AbortError');
    expect(fetchAniList).not.toHaveBeenCalled();
  });
  it('does not lose healthy aliases if another shelf was omitted', async () => {
    vi.mocked(fetchAniList).mockResolvedValue(new Response(JSON.stringify({ data: { s0: { media: [] } }, errors: [{ path: ['s1'] }] })));
    const first = fetchHomeShelf('home:popular');
    const second = fetchHomeShelf('home:top-airing').catch(error => error.message);
    await vi.runAllTimersAsync();
    expect((await first).data).toEqual([]);
    expect(await second).toMatch(/not returned/);
  });
  it('immediately settles one cancelled shelf while retaining a live shared subscriber', async () => {
    let release!: (response: Response) => void;
    vi.mocked(fetchAniList).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const controller = new AbortController();
    const cancelled = fetchHomeShelf('home:popular', { signal: controller.signal }).catch(error => error.name);
    const live = fetchHomeShelf('home:top-airing');
    await vi.advanceTimersByTimeAsync(1);
    const signal = vi.mocked(fetchAniList).mock.calls[0][2]?.signal;
    controller.abort();
    expect(await cancelled).toBe('AbortError');
    expect(signal?.aborted).toBe(false);
    release(new Response(JSON.stringify({ data: { s1: { media: [] } } })));
    expect((await live).data).toEqual([]);
  });
  it('cancels shared network admission when every shelf is abandoned', async () => {
    let release!: (response: Response) => void;
    vi.mocked(fetchAniList).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const first = new AbortController(), second = new AbortController();
    const pending = [fetchHomeShelf('home:popular', { signal: first.signal }), fetchHomeShelf('home:top-airing', { signal: second.signal })].map(value => value.catch(error => error.name));
    await vi.advanceTimersByTimeAsync(1);
    first.abort(); second.abort();
    expect(await Promise.all(pending)).toEqual(['AbortError', 'AbortError']);
    expect(vi.mocked(fetchAniList).mock.calls[0][2]?.signal?.aborted).toBe(true);
    release(new Response(JSON.stringify({ data: {} })));
    await vi.runAllTimersAsync();
  });
  it('retains stale provider timestamp and the absolute retry deadline', async () => {
    vi.mocked(fetchAniList).mockResolvedValue(new Response(JSON.stringify({ data: { s0: { media: [] } } }), { headers: {
      'X-StreamNyaa-Fetched-At': '1700000000000', 'X-StreamNyaa-Desktop-Cache': 'stale', 'X-StreamNyaa-Retry-At': '1700000060000',
    } }));
    const pending = fetchHomeShelf('home:popular');
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ fetchedAt: 1700000000000, stale: true, retryAt: 1700000060000 });
  });
  it('bounds large visible batches to two aliases without dropping duplicate subscribers', async () => {
    vi.mocked(fetchAniList).mockResolvedValueOnce(new Response(JSON.stringify({ data: {
      s0: { media: [{ id: 1, title: { romaji: 'First' } }] }, s1: { media: [{ id: 2, title: { romaji: 'Second' } }] },
    } }))).mockResolvedValueOnce(new Response(JSON.stringify({ data: { s0: { media: [{ id: 3, title: { romaji: 'Third' } }] } } })));
    const pending = [fetchHomeShelf('home:popular'), fetchHomeShelf('home:top-airing'), fetchHomeShelf('home:trending'), fetchHomeShelf('home:popular')];
    await vi.runAllTimersAsync();
    expect((await Promise.all(pending)).map(value => value.data[0].title)).toEqual(['First', 'Second', 'Third', 'First']);
    expect(fetchAniList).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchAniList).mock.calls.every(call => (String(call[0].query).match(/s\d+: Page/g) || []).length <= 2)).toBe(true);
  });
});
describe('Independent year scopes', () => {
  it('restores each scoped year while preserving ordinary filters', () => {
    rememberExploreYear('ranking', 2022);
    rememberExploreYear('seasonal', 2024);
    let params = new URLSearchParams('mode=year&year=2020&genre=Fantasy&format=ONA');
    params = switchExploreMode(params, 'year', 'popular', 2026);
    expect(params.has('year')).toBe(false);
    expect(exploreYear('popular', new URLSearchParams('year=2020'), 2026)).toBeUndefined();
    params = switchExploreMode(params, 'popular', 'ranking', 2026);
    expect(params.get('year')).toBe('2022');
    expect(params.get('genre')).toBe('Fantasy');
    params = switchExploreMode(params, 'ranking', 'seasonal', 2026);
    expect(params.get('year')).toBe('2024');
    params = switchExploreMode(params, 'seasonal', 'year', 2026);
    expect(params.get('year')).toBe('2020');
  });
  it('remembers all-years ranking independently of a selected seasonal year', () => {
    rememberExploreYear('ranking', undefined);
    expect(exploreYear('ranking', new URLSearchParams(), 2026)).toBeUndefined();
    expect(exploreYear('year', new URLSearchParams(), 2026)).toBe(2026);
  });
  it('persists a migrated ranking year before the old preference can be rewritten', () => {
    localStorage.setItem('streamnyaa.desktop.rankingFilters.v1.anilist', 'year=2023&genre=Fantasy');
    expect(exploreYear('ranking', new URLSearchParams(), 2026)).toBe(2023);
    localStorage.setItem('streamnyaa.desktop.rankingFilters.v1.anilist', '');
    expect(exploreYear('ranking', new URLSearchParams(), 2026)).toBe(2023);
    expect(exploreYear('popular', new URLSearchParams(), 2026)).toBeUndefined();
  });
});
describe('Conservative catalog visibility', () => {
  const now = Date.now();
  const anime = { anilist_id: 42, mal_id: 7, title: 'Series', status: 'RELEASING' };
  const negative: DesktopAvailabilityRecord = { key: 'anilist:42:title', animeId: 'anilist:42', scope: 'title', status: 'unavailable', checkedAt: now - 1000, expiresAt: now + 900_000, complete: true };
  it('hides only fresh complete title negatives and keeps Show unavailable explicit', () => {
    expect(catalogTitleVisible(anime, [negative], false, undefined, now)).toBe(false);
    expect(catalogTitleVisible(anime, [negative], true, undefined, now)).toBe(true);
    expect(catalogTitleVisible(anime, [{ ...negative, complete: false }], false, undefined, now)).toBe(true);
    expect(catalogTitleVisible(anime, [{ ...negative, expiresAt: now - 1 }], false, undefined, now)).toBe(true);
    expect(catalogTitleVisible(anime, [], false, undefined, now)).toBe(true);
  });
  it('keeps upcoming, offline playable titles, and titles with only episode-negative evidence', () => {
    expect(catalogTitleVisible({ ...anime, status: 'NOT_YET_RELEASED' }, [negative], false, undefined, now)).toBe(true);
    expect(catalogTitleVisible(anime, [{ ...negative, scope: 'episode', episode: 2 }], false, undefined, now)).toBe(true);
    const local = localPlayableAnimeIds({ version: 1, limitBps: 0, items: [{ id: 'd', title: 'Series', state: 'completed', downloaded: 1, total: 1, episodeLinks: { 'video.mkv': { animeId: '7', title: 'Series', episode: 1 } } }] });
    expect(catalogTitleVisible(anime, [negative], false, local, now)).toBe(true);
  });
});
