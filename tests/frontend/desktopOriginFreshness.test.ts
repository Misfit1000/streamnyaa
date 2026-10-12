import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { desktopOriginStaleTime } from '../../src/lib/desktopOriginFreshness';
afterEach(() => vi.useRealTimers());

it('expires an old cache response at its provider deadline without creating an automatic refetch loop', async () => {
  vi.useFakeTimers(); vi.setSystemTime(100_000);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const request = vi.fn().mockResolvedValue({ data: [], fetchedAt: 50_000 });
  const observer = new QueryObserver(client, { queryKey: ['desktop-explore-v3', 'origin-expiry'], queryFn: request,
    staleTime: query => desktopOriginStaleTime(60_000, query.state) });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.getCurrentResult().isStale).toBe(false);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(observer.getCurrentResult().isStale).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(observer.getCurrentResult().isStale).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    await client.refetchQueries();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(observer.getCurrentResult().isStale).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  } finally { unsubscribe(); client.clear(); }
});

it('uses the oldest retained page while preserving legacy baselines', () => {
  expect(desktopOriginStaleTime(60_000, { data: { pages: [{ fetchedAt: 50_000 }, { fetchedAt: 90_000 }] }, dataUpdatedAt: 100_000 })).toBe(10_000);
  expect(desktopOriginStaleTime(60_000, { data: { streamnyaa: { fetchedAt: 50_000 } }, dataUpdatedAt: 100_000 })).toBe(10_000);
  expect(desktopOriginStaleTime(60_000, { data: { data: [] }, dataUpdatedAt: 100_000 })).toBe(60_000);
});
