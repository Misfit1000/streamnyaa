import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/api/jikan', () => ({ fetchCompleteSchedule: vi.fn() }));
vi.mock('../../src/store/useStore', () => ({ useStore: { getState: () => ({ nsfwMode: false }) } }));
import { fetchCompleteSchedule, type CompleteScheduleResult } from '../../src/api/jikan';
import { desktopWeekQuery, mergeDesktopWeekSchedule } from '../../src/lib/desktopScheduleQuery';
import { desktopScheduleCacheKey, readDesktopSchedule } from '../../src/lib/desktopScheduleCache';

const clients: QueryClient[] = [];
function client() { const value = new QueryClient(); clients.push(value); return value; }
function result(complete = false, fetchedAt = 1700000000000): CompleteScheduleResult {
  return { data: [{ anilist_id: 1, airingEpisode: 2, airingAt: 100 }], complete,
    streamnyaa: { status: 'authoritative', fetchedAt }, pagination: { has_next_page: !complete, last_visible_page: 1 } };
}
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { clients.forEach(value => value.clear()); clients.length = 0; });

describe('bounded shared Calendar requests', () => {
  it('uses one background page with no periodic full-week polling or fabricated freshness', async () => {
    vi.mocked(fetchCompleteSchedule).mockResolvedValue(result());
    const query = desktopWeekQuery('background');
    const response = await query.queryFn({ signal: new AbortController().signal, client: client() });
    expect(fetchCompleteSchedule).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 1,
      expect.objectContaining({ priority: 'background' }), undefined);
    expect(response).toMatchObject({ complete: false, partialReason: 'background-budget', streamnyaa: { fetchedAt: 1700000000000 } });
    expect(query.refetchInterval).toBe(false);
    const key = desktopScheduleCacheKey(query.queryKey[1], query.queryKey[2], false);
    expect(readDesktopSchedule(key, 1700000001000)?.savedAt).toBe(1700000000000);
  });
  it('publishes foreground pages before completion and caches the complete week for fifteen minutes', async () => {
    let finish!: (value: CompleteScheduleResult) => void;
    vi.mocked(fetchCompleteSchedule).mockImplementation(async (_start, _end, _max, _options, progress) => {
      progress?.(result());
      return new Promise(resolve => { finish = resolve; });
    });
    const query = desktopWeekQuery(), cache = client();
    const pending = query.queryFn({ signal: new AbortController().signal, client: cache });
    expect(fetchCompleteSchedule).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 10,
      expect.objectContaining({ priority: 'foreground' }), expect.any(Function));
    expect(cache.getQueryData(query.queryKey)).toMatchObject({ complete: false, partialReason: 'foreground-loading' });
    expect(cache.getQueryState(query.queryKey)?.dataUpdatedAt).toBe(1700000000000);
    finish(result(true));
    const response = await pending;
    expect(response.complete).toBe(true);
    expect(response.partialReason).toBeUndefined();
    expect(query.staleTime({ state: { data: response } })).toBe(15 * 60_000);
  });
  it('promotes a cached background partial to a full foreground fetch', async () => {
    const cache = client();
    vi.mocked(fetchCompleteSchedule).mockResolvedValueOnce(result()).mockResolvedValueOnce(result(true));
    await cache.fetchQuery(desktopWeekQuery('background'));
    const response = await cache.fetchQuery(desktopWeekQuery('foreground'));
    expect(response.complete).toBe(true);
    expect(vi.mocked(fetchCompleteSchedule).mock.calls.map(call => call[2])).toEqual([1, 10]);
  });
  it('replaces revised episode times and keeps the original timestamp of retained older records', () => {
    const previous = { ...result(true, 1600000000000), data: [
      { anilist_id: 1, airingEpisode: 2, airingAt: 90 }, { anilist_id: 3, airingEpisode: 4, airingAt: 100 },
    ] };
    const merged = mergeDesktopWeekSchedule(result(), previous);
    expect(merged.data).toEqual([{ anilist_id: 1, airingEpisode: 2, airingAt: 100 }, { anilist_id: 3, airingEpisode: 4, airingAt: 100 }]);
    expect(merged.streamnyaa).toMatchObject({ fetchedAt: 1600000000000, status: 'stale' });
    expect(merged.complete).toBe(false);
  });
});
