import { afterEach, expect, it, vi } from 'vitest';
import { PublicRequestCache, type PublicDisk, type PublicRecord } from '../../src/lib/publicBrowserCache';
import { createIntentPrefetch } from '../../src/lib/intentPrefetch';

afterEach(() => vi.useRealTimers());
const response = (value: unknown = { data: [1] }, headers = {}) => new Response(JSON.stringify(value), { headers });
const disk = () => {
  const records = new Map<string, PublicRecord>();
  return { records, get: async (key: string) => records.get(key), put: async (row: PublicRecord) => { records.set(row.key, row); } };
};
it('retains retrieval time and applies the current caller’s shorter freshness', async () => {
  const fetchedAt = Date.now() - 60_000, fetcher = vi.fn(async () => response(undefined, { 'X-StreamNyaa-Fetched-At': String(fetchedAt) }));
  const cache = new PublicRequestCache();
  await cache.request('metadata:anilist:one', 120_000, fetcher);
  const hit = await cache.request('metadata:anilist:one', 120_000, fetcher);
  expect(Number(hit.headers.get('X-StreamNyaa-Fetched-At'))).toBe(fetchedAt);
  expect(fetcher).toHaveBeenCalledOnce();
  await cache.request('metadata:anilist:one', 10_000, fetcher);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not cache failures, stale results, or incomplete empty sources', async () => {
  for (const make of [() => new Response('{}', { status: 429 }), () => response([], { 'X-Source-Complete': 'false' }), () => response([], { 'X-Source-Cache': 'STALE' }), () => response([], {'Cache-Control':'no-store'})]) {
    const cache = new PublicRequestCache(), fetcher = vi.fn(async () => make());
    await cache.request('source:v2:one', 60_000, fetcher); await cache.request('source:v2:one', 60_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
});
it('cancels a hover subscriber without cancelling its foreground consumer', async () => {
  let finish!: (value: Response) => void, transport!: AbortSignal;
  const fetcher = vi.fn((signal: AbortSignal) => { transport = signal; return new Promise<Response>(resolve => { finish = resolve; }); });
  const cache = new PublicRequestCache(), hover = new AbortController();
  const one = cache.request('metadata:anilist:one', 60_000, fetcher, hover.signal);
  const cancelled = expect(one).rejects.toMatchObject({ name: 'AbortError' });
  const two = cache.request('metadata:anilist:one', 60_000, fetcher);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce()); hover.abort();
  expect(transport.aborted).toBe(false); finish(response()); await cancelled;
  expect(await (await two).json()).toEqual({ data: [1] });
});
it('aborts underlying work when its final subscriber leaves', async () => {
  let transport!: AbortSignal;
  const cache = new PublicRequestCache(), controller = new AbortController();
  const pending = cache.request('metadata:anilist:one', 60_000, signal => { transport = signal; return new Promise(() => {}); }, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(transport).toBeTruthy()); controller.abort(); await rejected;
  expect(transport.aborted).toBe(true);
});
it('starts fresh work immediately after an aborted last consumer, before old settlement',async()=>{
  const cache=new PublicRequestCache(),controller=new AbortController(),fetcher=vi.fn(async()=>response());
  const first=cache.request('calendar:v1:remount',60_000,fetcher,controller.signal);
  const rejected=expect(first).rejects.toMatchObject({name:'AbortError'});
  controller.abort();
  const replacement=cache.request('calendar:v1:remount',60_000,fetcher);
  expect(await(await replacement).json()).toEqual({data:[1]});await rejected;expect(fetcher).toHaveBeenCalledOnce();
});
it('reuses committed shared storage across two coordinated tabs', async () => {
  const storage = disk(); let tail = Promise.resolve();
  const lock = async <T,>(_name: string, _signal: AbortSignal, run: () => Promise<T>) => {
    const prior = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; });
    await prior; try { return await run(); } finally { release(); }
  };
  const fetcher = vi.fn(async () => response());
  await Promise.all([new PublicRequestCache(storage, lock).request('metadata:anilist:one', 60_000, fetcher), new PublicRequestCache(storage, lock).request('metadata:anilist:one', 60_000, fetcher)]);
  expect(fetcher).toHaveBeenCalledOnce();
});
it('rejects malformed saved payloads and survives storage exceptions', async () => {
  const storage = disk(); await new PublicRequestCache(storage).request('one', 60_000, async () => response());
  storage.records.get('one')!.value = { bad: true };
  const fetcher = vi.fn(async () => response());
  await new PublicRequestCache(storage).request('one', 60_000, fetcher, undefined, value => Array.isArray((value as any)?.data));
  expect(fetcher).toHaveBeenCalledOnce();
  const broken: PublicDisk = { get: async () => { throw Error('blocked'); }, put: async () => { throw Error('quota'); } };
  expect((await new PublicRequestCache(broken).request('one', 60_000, fetcher)).ok).toBe(true);
});
it('delays hover intent, cancels abandoned intent and keeps deliberate focus immediate', async () => {
  vi.useFakeTimers(); const run = vi.fn(async () => {}), intent = createIntentPrefetch(run);
  intent.start(); await vi.advanceTimersByTimeAsync(149); expect(run).not.toHaveBeenCalled();
  intent.cancel(); await vi.advanceTimersByTimeAsync(1); expect(run).not.toHaveBeenCalled();
  intent.start(true); expect(run).toHaveBeenCalledOnce(); intent.cancel();
});
