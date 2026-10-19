import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); localStorage.clear(); delete window.__STREAMNYAA_DESKTOP__; delete window.__TAURI__; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('does not re-age gateway metadata when saving the browser working cache', async () => {
  const original = Date.now() - 45_000;
  const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { headers: { 'X-StreamNyaa-Fetched-At': String(original), 'X-StreamNyaa-Metadata-Cache': 'HIT' } }));
  vi.stubGlobal('fetch', fetch);
  const { fetchJikanPath } = await import('../../src/api/jikan');
  await fetchJikanPath('/anime/52991/episodes', 60);
  const cached = await fetchJikanPath('/anime/52991/episodes', 60);
  expect(Number(cached.headers.get('X-StreamNyaa-Fetched-At'))).toBe(original);
  expect(fetch).toHaveBeenCalledOnce();
});

it('keeps gateway outage content stale and retries rather than saving it as fresh', async () => {
  const original = Date.now() - 120_000;
  const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ mal_id: 1, title: 'Saved title' }], pagination: { last_visible_page: 1 } }), { headers: { 'X-StreamNyaa-Fetched-At': String(original), 'X-StreamNyaa-Metadata-Cache': 'STALE' } }));
  vi.stubGlobal('fetch', fetch);
  const { fetchAnimeEpisodes } = await import('../../src/api/jikan');
  const one = await fetchAnimeEpisodes('52991');
  const two = await fetchAnimeEpisodes('52991');
  expect(one.streamnyaa).toMatchObject({ status: 'stale', fetchedAt: original });
  expect(two.data).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(2);
});

it('does not turn a stale gateway source response into a fresh browser source cache hit', async () => {
  const original = Date.now() - 180_000;
  const fetch = vi.fn(async () => new Response(JSON.stringify([{ title: 'Fixture - 01', infoHash: 'a'.repeat(40), seeders: '5' }]), { headers: { 'X-Source-Fetched-At': String(original), 'X-Source-Cache': 'STALE', 'X-Source-Complete': 'true' } }));
  vi.stubGlobal('fetch', fetch);
  const { searchNyaa } = await import('../../src/api/nyaa');
  for (let i = 0; i < 2; i++) {
    const result = await searchNyaa('Stale Web Fixture', '1_2', '0', '1', { deep: false });
    expect(result.stale).toBe(true); expect(result.fetchedAt).toBe(original);
  }
  expect(fetch).toHaveBeenCalledTimes(2);
});
