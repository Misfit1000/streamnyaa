import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchNyaa } from '../../src/api/nyaa';

afterEach(() => {
  delete window.__TAURI__;
  delete window.__STREAMNYAA_DESKTOP__;
  vi.restoreAllMocks();
});

describe('desktop source request coordination', () => {
  const item = { title: '[Group] Cache Example - 01 [1080p]', infoHash: 'a'.repeat(40), link: 'https://nyaa.si/view/1', size: '100 MiB', seeders: '12', category: 'Anime' };
  function mockNative(responses: unknown[]) {
    window.__STREAMNYAA_DESKTOP__ = true;
    const invoke = vi.fn(async (command: string, _args?: unknown) => {
      if (command !== 'fetch_desktop_source_api') return undefined;
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    });
    window.__TAURI__ = { core: { invoke } };
    return invoke;
  }
  it('sends explicit title and episode scope without inferring a season as an episode', async () => {
    const invoke = mockNative([{ data: [], complete: true }, { data: [], complete: true }]);
    await searchNyaa('Scope Fixture Season 2', '1_2', '0', '1', { deep: false, pages: 1 });
    await searchNyaa('Scope Fixture S02E01', '1_2', '0', '1', { deep: false, pages: 1 });
    const requests = invoke.mock.calls.filter(([command]) => command === 'fetch_desktop_source_api');
    const title = new URL((requests[0][1] as any).url), episode = new URL((requests[1][1] as any).url);
    expect(title.searchParams.get('scope')).toBe('title');
    expect(title.searchParams.has('episode')).toBe(false);
    expect(title.searchParams.get('deep')).toBe('0');
    expect(episode.searchParams.get('scope')).toBe('episode');
    expect(episode.searchParams.get('episode')).toBe('1');
  });
  it('deduplicates raw cache records and replaces them after a complete empty refresh', async () => {
    let now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now);
    const invoke = mockNative([{ data: [item, { ...item, seeders: '20' }], fetched_at: now, complete: true }, { data: [], fetched_at: now + 61_000, complete: true }]);
    const first = await searchNyaa('Complete Empty Fixture 01', '1_2', '0', '1', { deep: false });
    expect(first).toHaveLength(1); expect(first[0].rawSeeders).toBe(20);
    now += 61_000;
    const refreshed = await searchNyaa('Complete Empty Fixture 01', '1_2', '0', '1', { deep: false });
    expect(refreshed).toHaveLength(0); expect(refreshed.complete).toBe(true);
    const cached = await searchNyaa('Complete Empty Fixture 01', '1_2', '0', '1', { deep: false });
    expect(cached).toHaveLength(0);
    expect(invoke.mock.calls.filter(([command]) => command === 'fetch_desktop_source_api')).toHaveLength(2);
  });
  it('keeps the original retrieval timestamp and incomplete state during a failed refresh', async () => {
    let now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now);
    const savedAt = now;
    mockNative([{ data: [item], fetched_at: savedAt, complete: true }, Object.assign(new Error('Provider unavailable'), { code: 'rate-limited', provider: 'nyaa', retryAt: savedAt + 120_000, retryable: true })]);
    await searchNyaa('Stale Timestamp Fixture 01', '1_2', '0', '1', { deep: false });
    now += 61_000;
    const stale = await searchNyaa('Stale Timestamp Fixture 01', '1_2', '0', '1', { deep: false });
    expect(stale).toHaveLength(1);
    expect(stale).toMatchObject({ fetchedAt: savedAt, complete: false, stale: true, retryAt: savedAt + 120_000 });
  });
  it('refreshes desktop title scope after five minutes without altering the episode cache', async () => {
    let now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now);
    const invoke = mockNative([{ data: [item], fetched_at: now, complete: true }, { data: [], fetched_at: now + 301_000, complete: true }]);
    await searchNyaa('Title Freshness Fixture Season 2', '1_2', '0', '1', { deep: false });
    now += 299_000;
    expect(await searchNyaa('Title Freshness Fixture Season 2', '1_2', '0', '1', { deep: false })).toHaveLength(1);
    now += 2_000;
    expect(await searchNyaa('Title Freshness Fixture Season 2', '1_2', '0', '1', { deep: false })).toHaveLength(0);
    expect(invoke.mock.calls.filter(([command]) => command === 'fetch_desktop_source_api')).toHaveLength(2);
  });
  it('rejects an aborted request instead of reporting a valid empty result', async () => {
    let resolveBridge: ((value: unknown) => void) | undefined;
    const invoke = vi.fn((_command?: string, _args?: unknown) => new Promise((resolve) => {
      resolveBridge = resolve;
    }));
    window.__STREAMNYAA_DESKTOP__ = true;
    window.__TAURI__ = { core: { invoke } };
    const controller = new AbortController();

    const request = searchNyaa('StreamNyaa Abort Fixture 01', '1_2', '0', '1', {
      deep: false,
      pages: 1,
      signal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ provider: 'nyaa', code: 'cancelled' });
    expect(invoke.mock.calls.filter(([command]) => command === 'fetch_desktop_source_api')).toHaveLength(0);
    resolveBridge?.({ data: [], fetched_at: Date.now() });
  });

  it('does not leave a failed native source request pending', async () => {
    window.__STREAMNYAA_DESKTOP__ = true;
    window.__TAURI__ = { core: { invoke: vi.fn(() => Promise.reject(new Error('native provider unavailable'))) } };

    const request = searchNyaa('StreamNyaa Rejection Fixture 02', '1_2', '0', '1', {
      deep: false,
      pages: 1,
      signal: new AbortController().signal,
    });

    await expect(request).rejects.toThrow(/native provider unavailable/i);
  });
});
