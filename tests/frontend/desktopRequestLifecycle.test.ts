import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokeDesktopData, stableRequestKey, desktopAnimeQueryKey } from '../../src/lib/desktopRequests';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { installDesktopAutoRecovery } from '../../src/lib/desktopAutoRecovery';
import { desktopDataError } from '../../src/lib/desktopData';

afterEach(() => vi.useRealTimers());
const deferred = () => { let resolve!: (v: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
describe('shared native request lifecycle', () => {
  it('preserves access denial rather than retrying it as a connection error', () => {
    const error = desktopDataError('anilist', { code: 'access-denied', message: 'Catalog access declined', statusCode: 403, retryable: false });
    expect(error.code).toBe('access-denied');
    expect(error.statusCode).toBe(403);
    expect(error.retryable).toBe(false);
    expect(desktopDataError('anilist', new Error('Declined'), 403).retryable).toBe(false);
  });
  it('deduplicates keys without conflating identity namespaces', () => {
    expect(stableRequestKey({ b: 2, a: { x: 1 } })).toBe(stableRequestKey({ a: { x: 1 }, b: 2 }));
    expect(desktopAnimeQueryKey('1', 1)).not.toEqual(desktopAnimeQueryKey('1', null, 1));
  });
  it('does not start work abandoned before dispatch', async () => {
    const invoke = vi.fn(() => Promise.resolve([]));
    const controller = new AbortController();
    const result = invokeDesktopData(invoke as any, 'metadata', { id: 1 }, { signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'cancelled' });
    expect(invoke).not.toHaveBeenCalled();
  });
  it('cancels a subscriber without cancelling the other consumer', async () => {
    const work = deferred();
    const invoke = vi.fn((cmd: string) => cmd === 'metadata' ? work.promise : Promise.resolve());
    const controller = new AbortController();
    const a = invokeDesktopData(invoke as any, 'metadata', { id: 2 }, { signal: controller.signal, priority: 'prefetch' });
    await Promise.resolve();
    const b = invokeDesktopData(invoke as any, 'metadata', { id: 2 });
    controller.abort();
    await expect(a).rejects.toMatchObject({ code: 'cancelled' });
    expect(invoke.mock.calls.filter(([cmd]) => cmd === 'metadata')).toHaveLength(1);
    expect(invoke.mock.calls.some(([cmd]) => cmd === 'promote_desktop_data_request')).toBe(true);
    expect(invoke.mock.calls.some(([cmd]) => cmd === 'cancel_desktop_data_request')).toBe(false);
    work.resolve({ data: 'same response' });
    await expect(b).resolves.toEqual({ data: 'same response' });
  });
  it('cancels the native request when its last live consumer leaves', async () => {
    const work = deferred();
    const invoke = vi.fn((cmd: string) => cmd === 'metadata' ? work.promise : Promise.resolve());
    const controller = new AbortController();
    const result = invokeDesktopData(invoke as any, 'metadata', { id: 3 }, { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'cancelled' });
    expect(invoke.mock.calls.filter(([cmd]) => cmd === 'cancel_desktop_data_request')).toHaveLength(1);
    work.resolve(null);
  });
  it('bounds an unresponsive native bridge and retains structured errors', async () => {
    vi.useFakeTimers();
    const work = deferred();
    const invoke = vi.fn((cmd: string) => cmd === 'metadata' ? work.promise : Promise.resolve());
    const pending = invokeDesktopData(invoke as any, 'metadata', { id: 4 }, { deadlineMs: 500 });
    const check = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(1001);
    await check;
    work.resolve(null);
    await expect(invokeDesktopData((async () => { throw { code: 'rate-limited', provider: 'anilist', retryAfterMs: 15000, message: 'Please wait' }; }) as any, 'metadata', { id: 5 }))
      .rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 15000 });
  });
  it('allows catalog admission wait separately from the HTTP timeout',async()=>{
    vi.useFakeTimers();
    const work=deferred();
    const invoke=vi.fn(()=>work.promise);
    const pending=invokeDesktopData(invoke as any,'fetch_desktop_metadata_api',{request:{provider:'anilist',body:{query:'queued-fixture'}}});
    await vi.advanceTimersByTimeAsync(61_000);
    expect(invoke.mock.calls[0][1]).toMatchObject({deadlineMs:80_000});
    work.resolve({data:'admitted'});
    await expect(pending).resolves.toMatchObject({data:'admitted'});
  });
});
describe('active-screen recovery', () => {
  it('treats Calendar continuation as pagination and uses the final page freshness',async()=>{
    vi.useFakeTimers();
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const request=vi.fn();
    const observer=new QueryObserver(client,{queryKey:['schedule-public',1,2],queryFn:request,staleTime:Infinity,
      initialData:{pages:[{complete:false,stale:true},{complete:false,stale:false,cursor:'0:6'}]}});
    const unsubscribe=observer.subscribe(()=>{}),stop=installDesktopAutoRecovery(client);
    await vi.advanceTimersByTimeAsync(300_000);expect(request).not.toHaveBeenCalled();
    stop();unsubscribe();client.clear();
  });
  it.each([['desktop-schedule-week', 'background-budget'], ['desktop-watch-sources', 'discovery-budget']])('does not turn intentionally bounded %s discovery into an automatic drain loop', async (prefix, partialReason) => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const request = vi.fn().mockResolvedValue({ data: [], complete: true });
    const observer = new QueryObserver(client, { queryKey: [prefix, 'bounded'], queryFn: request,
      initialData: { data: [], complete: false, stale: true, partialReason }, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {}), stop = installDesktopAutoRecovery(client);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(request).not.toHaveBeenCalled();
    stop(); unsubscribe(); client.clear();
  });
  it('resumes provider-interrupted source discovery only after its absolute retry deadline', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const request = vi.fn().mockResolvedValue({ items: [], complete: true });
    const observer = new QueryObserver(client, { queryKey: ['desktop-watch-sources', 'interrupted'], queryFn: request,
      initialData: { items: [], complete: false, partialReason: 'provider-failure', retryAt: 160_000 }, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {}), stop = installDesktopAutoRecovery(client);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(request).toHaveBeenCalledTimes(1);
    stop(); unsubscribe(); client.clear();
  });
  it('does not retry permanent failures or bypass a fresh cooldown', async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const query = vi.fn().mockRejectedValue({ code: 'invalid', retryable: false });
    const observer = new QueryObserver(client, { queryKey: ['anime', 'bad'], queryFn: query });
    const unsubscribe = observer.subscribe(() => {});
    const stop = installDesktopAutoRecovery(client);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(query).toHaveBeenCalledTimes(1);
    stop(); unsubscribe(); client.clear();
  });
  it('resumes incomplete timelines automatically without refreshing unrelated queries', async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const timeline = vi.fn().mockResolvedValue({ items: [{ id: 2 }], complete: true });
    const unrelated = vi.fn().mockResolvedValue('profile');
    const observer = new QueryObserver(client, { queryKey: ['desktop-watch-installments-graph', 'anilist:1'], queryFn: timeline,
      initialData: { items: [], complete: false }, staleTime: Infinity });
    const account = new QueryObserver(client, { queryKey: ['account-profile'], queryFn: unrelated, initialData: 'account', staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {}), unsubscribeAccount = account.subscribe(() => {});
    const stop = installDesktopAutoRecovery(client);
    await vi.advanceTimersByTimeAsync(31001);
    expect(timeline).toHaveBeenCalledTimes(1);
    expect(unrelated).not.toHaveBeenCalled();
    expect(observer.getCurrentResult().data?.items).toEqual([{ id: 2 }]);
    await vi.advanceTimersByTimeAsync(70000);
    expect(timeline).toHaveBeenCalledTimes(1);
    stop(); unsubscribe(); unsubscribeAccount(); client.clear();
  });
  it('does not reset an absolute cooldown when the same failure is observed again',async()=>{
    vi.useFakeTimers();vi.setSystemTime(100_000);
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const failure={code:'rate-limited',provider:'anilist',retryable:true,retryAt:160_000,retryAfterMs:60_000};
    const query=vi.fn().mockRejectedValue(failure);
    const observer=new QueryObserver(client,{queryKey:['desktop-explore-v3','absolute-deadline'],queryFn:query});
    const unsubscribe=observer.subscribe(()=>{}),stop=installDesktopAutoRecovery(client);
    await vi.advanceTimersByTimeAsync(50_000);
    await client.refetchQueries({queryKey:['desktop-explore-v3','absolute-deadline']});
    expect(query).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(query).toHaveBeenCalledTimes(3);
    stop();unsubscribe();client.clear();
  });
});
