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
});
describe('active-screen recovery', () => {
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
    await vi.advanceTimersByTimeAsync(6001);
    expect(timeline).toHaveBeenCalledTimes(1);
    expect(unrelated).not.toHaveBeenCalled();
    expect(observer.getCurrentResult().data?.items).toEqual([{ id: 2 }]);
    await vi.advanceTimersByTimeAsync(70000);
    expect(timeline).toHaveBeenCalledTimes(1);
    stop(); unsubscribe(); unsubscribeAccount(); client.clear();
  });
});
