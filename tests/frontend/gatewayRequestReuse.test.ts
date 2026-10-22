import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestCache, requestClient } from '../../api/_shared/requestReuse';

const xml = (title = 'Fixture Series - 01 [1080p]', hash = 'a') => `<rss><channel><item><title>${title}</title><link>https://example.invalid/${hash}</link><nyaa:infoHash>${hash.repeat(40)}</nyaa:infoHash><nyaa:seeders>20</nyaa:seeders></item></channel></rss>`;
function response() {
  const res: any = { headers: {}, statusCode: 200, setHeader(k: string, v: string) { this.headers[k] = v; }, status(n: number) { this.statusCode = n; return this; }, json(body: any) { this.body = body; return this; }, end() {} };
  return res;
}
async function source(handler: any, query: any, signal?: AbortSignal) {
  const res = response(); await handler({ method: 'GET', query: { q: 'Fixture Series', scope: 'title', deep: '0', ...query }, signal, headers: {} }, res); return res;
}
async function metadata(handler: any, query: any, body?: any) {
  const res = response(); await handler({ method: body ? 'POST' : 'GET', query: { provider: 'tenrai', path: '/anime/1/episodes', ttl: '600', ...query }, body, headers: {} }, res); return res;
}
beforeEach(() => { vi.resetModules(); vi.stubEnv('VERCEL', ''); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('bounded shared gateway work', () => {
  it('coalesces cold requests and isolates consumer cancellation', async () => {
    let release!: () => void;
    const fetch = vi.fn(async () => { await new Promise<void>(r => release = r); return new Response(xml()); });
    vi.stubGlobal('fetch', fetch);
    const { default: handler } = await import('../../api/nyaa');
    const controller = new AbortController();
    const one = source(handler, {}, controller.signal), two = source(handler, {});
    controller.abort(); release();
    const [a, b] = await Promise.all([one, two]);
    expect(fetch).toHaveBeenCalledOnce(); expect(a.body).toEqual(b.body); expect(b.body).toHaveLength(1);
    expect(fetch.mock.calls[0][1]?.signal?.aborted).not.toBe(true);
    expect(b.headers['X-Source-Cache']).toBe('COALESCED');
  });
  it('shares exact raw feeds across discovery plans without changing provenance or pages/filters', async () => {
    const fetch = vi.fn(async () => new Response(xml())); vi.stubGlobal('fetch', fetch);
    const { default: handler } = await import('../../api/nyaa');
    const first = await source(handler, {});
    const expanded = await source(handler, { deep: '1', pages: '1' });
    expect(fetch).toHaveBeenCalledTimes(2); // original query reused; normalized alias fetched once
    expect(expanded.body[0].matchedQuery).toBe(first.body[0].matchedQuery);
    await source(handler, { p: '2' }); await source(handler, { f: '2' }); await source(handler, { c: '1_3' });
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch.mock.calls.map(call => String(call[0]))).toEqual(expect.arrayContaining([expect.stringContaining('p=2'), expect.stringContaining('f=2'), expect.stringContaining('c=1_3')]));
  });
  it('retains original feed age when assembling another view and never recaches stale content', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1700000000000);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml())));
    const { default: handler } = await import('../../api/nyaa');
    await source(handler, {});
    vi.setSystemTime(1700000030000);
    const expanded = await source(handler, { deep: '1', pages: '1' });
    expect(expanded.headers['X-Source-Fetched-At']).toBe('1700000000000');
    expect(expanded.headers['Cache-Control']).toContain('max-age=90');
    vi.setSystemTime(1700000121000);
    const stale = await source(handler, {});
    expect(stale.headers['X-Source-Cache']).toBe('STALE');
    expect(stale.headers['Cache-Control']).toBe('no-store');
  });
  it('does not cache partial failures and fresh complete empty replaces old results', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1700000000000);
    const fetch = vi.fn().mockResolvedValueOnce(new Response(xml())).mockResolvedValueOnce(new Response('Unavailable', { status: 503 })).mockResolvedValue(new Response('<rss><channel></channel></rss>'));
    vi.stubGlobal('fetch', fetch);
    const { default: handler } = await import('../../api/nyaa');
    expect((await source(handler, {})).body).toHaveLength(1);
    vi.setSystemTime(1700000601000);
    const partial = await source(handler, {});
    expect(partial.headers['X-Source-Complete']).toBe('false'); expect(partial.headers['Cache-Control']).toBe('no-store');
    const fresh = await source(handler, {});
    expect(fresh.body).toEqual([]); expect(fresh.headers['X-Source-Complete']).toBe('true');
    expect((await source(handler, {})).body).toEqual([]); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('rejects invalid RSS and retries interrupted work instead of caching an empty success', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('<html>Provider unavailable</html>')).mockResolvedValueOnce(new Response(xml()));
    vi.stubGlobal('fetch', fetch);
    const { default: handler } = await import('../../api/nyaa');
    expect((await source(handler, {})).headers['X-Source-Complete']).toBe('false');
    expect((await source(handler, {})).body).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('never confuses title scope, explicit episodes or season aliases', async () => {
    const fetch = vi.fn(async () => new Response(xml('Fixture Series S02E02 [1080p]'))); vi.stubGlobal('fetch', fetch);
    const { default: handler } = await import('../../api/nyaa');
    expect((await source(handler, { q: 'Fixture Series Season 2' })).body).toHaveLength(1);
    expect((await source(handler, { q: 'Fixture Series Season 2', scope: 'episode', episode: '1' })).body).toEqual([]);
    expect((await source(handler, { q: 'Fixture Series Season 2', scope: 'episode', episode: '2' })).body).toHaveLength(1);
    await source(handler, { q: 'Fixture Series Season 3' }); expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('metadata freshness', () => {
  it('honors the current caller TTL and keeps HTTP cache lifetime within the original age', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1700000000000);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [] }))); vi.stubGlobal('fetch', fetch);
    const { default: handler } = await import('../../api/stream-sources');
    await metadata(handler, { ttl: '21600' });
    vi.setSystemTime(1700000030000);
    expect((await metadata(handler, { ttl: '60' })).headers['Cache-Control']).toContain('max-age=30');
    vi.setSystemTime(1700000061000);
    const refreshed = await metadata(handler, { ttl: '60' });
    expect(fetch).toHaveBeenCalledTimes(2); expect(refreshed.headers['X-StreamNyaa-Fetched-At']).toBe('1700000061000');
  });
  it('coalesces metadata, returns original timestamps and keeps stale/error responses uncached', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1700000000000);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [] }))); vi.stubGlobal('fetch', fetch);
    const { default: handler } = await import('../../api/stream-sources');
    const [a, b] = await Promise.all([metadata(handler, {}), metadata(handler, {})]);
    expect(fetch).toHaveBeenCalledOnce(); expect(a.body).toEqual(b.body);
    vi.setSystemTime(1700000601000); fetch.mockRejectedValue(new Error('offline'));
    const stale = await metadata(handler, {});
    expect(stale.body.streamnyaa).toMatchObject({ fetchedAt: 1700000000000, stale: true });
    expect(stale.headers['Cache-Control']).toBe('no-store');
    expect((await metadata(handler, { path: '/anime/2/episodes' })).headers['Cache-Control']).toBe('no-store');
  });
  it('body-keys AniList POST without enabling public HTTP caching or caching partial errors', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { Page: { media: [] } } }))); vi.stubGlobal('fetch', fetch);
    const { default: handler } = await import('../../api/stream-sources');
    const body = { query: 'query($id:Int){Media(id:$id){id}}', variables: { id: 1 } };
    const a = await metadata(handler, { provider: 'anilist' }, body);
    await metadata(handler, { provider: 'anilist' }, body);
    await metadata(handler, { provider: 'anilist' }, { ...body, variables: { id: 2 } });
    expect(fetch).toHaveBeenCalledTimes(2); expect(a.headers['Cache-Control']).toBe('no-store');
    fetch.mockResolvedValue(new Response(JSON.stringify({ data: {}, errors: [{ message: 'Rate limited' }] })));
    const failedBody = { query: 'query{Media(id:3){id}}' };
    expect((await metadata(handler, { provider: 'anilist' }, failedBody)).statusCode).toBe(502);
    await metadata(handler, { provider: 'anilist' }, failedBody); expect(fetch).toHaveBeenCalledTimes(4);
  });
});

describe('cache budgets and attribution', () => {
  it('logs aggregate work without query, credentials, account or user-agent contents', async () => {
    vi.stubEnv('VERCEL', '1'); const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml())));
    const { default: handler } = await import('../../api/nyaa');
    await source(handler, { q: 'private-query-fixture' });
    expect(info).toHaveBeenCalledOnce();
    const log = JSON.parse(info.mock.calls[0][0]);
    expect(log).toMatchObject({ event: 'gateway_request', route: 'nyaa', client: 'unknown', upstreamRequests: 1, status: 200 });
    expect(JSON.stringify(log)).not.toContain('private-query-fixture');
  });
  it('enforces per-namespace limits, combined bytes, expiry and LRU', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const cache = new RequestCache({ assembled: 2, rss: 2 }, 1600);
    cache.set('assembled', 'a', 'first', 2000); cache.set('assembled', 'b', 'second', 2000);
    cache.get('assembled', 'a'); cache.set('assembled', 'c', 'third', 2000);
    expect(cache.get('assembled', 'b')).toBeUndefined();
    cache.set('rss', 'x', 'x'.repeat(300), 2000); cache.set('rss', 'y', 'y'.repeat(300), 2000);
    expect(cache.snapshot().bytes).toBeLessThanOrEqual(1600);
    cache.set('rss', 'oversize', 'z'.repeat(1600), 2000); expect(cache.get('rss', 'oversize')).toBeUndefined();
    vi.setSystemTime(2001); expect(cache.get('rss', 'y')).toBeUndefined();
  });
  it.each([
    [{ 'user-agent': 'StreamNyaa Desktop/0.1.10' }, 'desktop'],
    [{ origin: 'http://tauri.localhost' }, 'desktop'],
    [{ referer: 'https://www.streamnyaa.xyz/anime/1' }, 'website'],
    [{ 'user-agent': 'Mozilla Reflectionbot/2.0' }, 'crawler'],
    [{ 'user-agent': 'vercel-cron/1.0' }, 'scheduled-test'],
    [{ 'user-agent': 'Mozilla/5.0' }, 'unknown'],
    [{ origin: 'https://streamnyaa.xyz.evil.test' }, 'unknown'],
  ])('classifies self-reported client hints without new headers: %j', (headers, expected) => {
    expect(requestClient({ headers })).toBe(expected);
  });
});
