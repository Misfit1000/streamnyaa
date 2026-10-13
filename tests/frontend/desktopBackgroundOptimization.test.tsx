import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCatalogHealth } from '../../src/lib/useDesktopCatalogHealth';
import { useVisibleCountdown } from '../../src/lib/useVisibleCountdown';
import DesktopEpisodeStatus from '../../src/components/DesktopEpisodeStatus';

function visibility(value: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); visibility('visible'); });
afterEach(() => { cleanup(); vi.useRealTimers(); visibility('visible'); });

describe('administrator-only shared catalog monitoring', () => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const cache = client.getQueryCache();
    const subscribe = vi.spyOn(cache, 'subscribe');
    const scan = vi.spyOn(cache, 'getAll');
    const wrapper = ({children}: {children: React.ReactNode}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return { client, cache, subscribe, scan, wrapper };
  }

  it('performs no cache subscriptions, scans or timers while role is unverified or regular', () => {
    const {client, subscribe, scan, wrapper} = setup();
    const view = renderHook(({admin}: {admin: boolean}) => [useCatalogHealth(admin), useCatalogHealth(admin)], {wrapper, initialProps: {admin:false}});
    expect(subscribe).toHaveBeenCalledTimes(0);
    expect(scan).toHaveBeenCalledTimes(0);
    expect(vi.getTimerCount()).toBe(0);
    act(() => { client.setQueryData(['desktop-catalog'], {fallback:true}); vi.advanceTimersByTime(60_000); });
    expect(subscribe).toHaveBeenCalledTimes(0);
    expect(scan).toHaveBeenCalledTimes(0);
    view.rerender({admin:false});
    expect(scan).toHaveBeenCalledTimes(0);
  });

  it('shares one subscription and one scan per burst across both admin surfaces', () => {
    const {client, subscribe, scan, wrapper} = setup();
    const view = renderHook(({admin}: {admin: boolean}) => [useCatalogHealth(admin), useCatalogHealth(admin)], {wrapper, initialProps: {admin:true}});
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledTimes(1);
    act(() => { for (let index=0; index<20; index++) client.setQueryData(['desktop-catalog'], {index}); });
    expect(scan).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(250));
    expect(scan).toHaveBeenCalledTimes(2);
    view.rerender({admin:true});
    expect(scan).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('discards pending work and stale privileged state on role failure, logout or account change', () => {
    const {client, cache, subscribe, scan, wrapper} = setup();
    const query = cache.build(client, {queryKey:['desktop-catalog']});
    vi.spyOn(query, 'getObserversCount').mockReturnValue(1);
    query.setState({data:{fallback:true},error:new Error('Provider error'),fetchStatus:'fetching'});
    const view = renderHook(({admin}: {admin: boolean}) => useCatalogHealth(admin), {wrapper, initialProps: {admin:true}});
    expect(view.result.current).toMatchObject({fallback:true,loading:true,failed:[query]});
    act(() => client.setQueryData(['desktop-catalog'], {fallback:false}));
    expect(vi.getTimerCount()).toBe(1);
    view.rerender({admin:false});
    expect(view.result.current).toEqual({fallback:false,loading:false,failed:[]});
    expect(vi.getTimerCount()).toBe(0);
    const previousScans = scan.mock.calls.length;
    act(() => { client.setQueryData(['desktop-catalog'], {fallback:true}); vi.advanceTimersByTime(60_000); });
    expect(scan).toHaveBeenCalledTimes(previousScans);
    view.rerender({admin:true});
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(scan).toHaveBeenCalledTimes(previousScans + 1);
  });

  it('defers all cosmetic scans while hidden and refreshes immediately on resume', () => {
    const {client, subscribe, scan, wrapper} = setup();
    renderHook(() => [useCatalogHealth(true),useCatalogHealth(true)], {wrapper});
    act(() => client.setQueryData(['desktop-catalog'], {fallback:true}));
    visibility('hidden');
    expect(vi.getTimerCount()).toBe(0);
    act(() => { for (let index=0;index<20;index++) client.setQueryData(['desktop-catalog'], {index}); vi.advanceTimersByTime(60_000); });
    expect(scan).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    visibility('visible');
    expect(scan).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('visible cosmetic countdowns', () => {
  it('stops wakeups while hidden, refreshes on resume and stops after its absolute deadline', () => {
    const renderClock = vi.fn();
    const view = renderHook(() => { const now=useVisibleCountdown(160_000,true); renderClock(now); return now; });
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(1_000));
    expect(view.result.current).toBe(101_000);
    visibility('hidden');
    const renders=renderClock.mock.calls.length;
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(120_000));
    expect(renderClock).toHaveBeenCalledTimes(renders);
    visibility('visible');
    expect(view.result.current).toBe(221_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start hidden or disabled clocks and cleans up when the deadline changes', () => {
    visibility('hidden');
    const view=renderHook(({deadline,enabled}) => useVisibleCountdown(deadline,enabled), {initialProps:{deadline:160_000,enabled:true}});
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(10_000));
    visibility('visible');
    expect(view.result.current).toBe(110_000);
    expect(vi.getTimerCount()).toBe(1);
    view.rerender({deadline:120_000,enabled:true});
    expect(vi.getTimerCount()).toBe(1);
    view.rerender({deadline:120_000,enabled:false});
    expect(vi.getTimerCount()).toBe(0);
    view.unmount();
    visibility('hidden'); visibility('visible');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('updates episode retry labels immediately after returning from a hidden window', () => {
    const retry=vi.fn();
    render(<DesktopEpisodeStatus retry={retry} enabled fetching={false} hasTitles hasEntries errorAt={100_000}
      error={{code:'rate-limited',provider:'jikan',message:'Wait',retryable:true,retryAt:130_000}}/>);
    expect((screen.getByRole('button',{name:'Retry in 30s'}) as HTMLButtonElement).disabled).toBe(true);
    visibility('hidden');
    act(() => vi.advanceTimersByTime(35_000));
    expect(retry).not.toHaveBeenCalled();
    visibility('visible');
    expect((screen.getByRole('button',{name:'Refresh episode titles'}) as HTMLButtonElement).disabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a relative error deadline fixed when no error timestamp was provided', () => {
    const retry=vi.fn();
    render(<DesktopEpisodeStatus retry={retry} enabled fetching={false} hasTitles hasEntries
      error={{code:'rate-limited',provider:'jikan',message:'Wait',retryable:true,retryAfterMs:30_000}}/>);
    expect((screen.getByRole('button',{name:'Retry in 30s'}) as HTMLButtonElement).disabled).toBe(true);
    act(() => vi.advanceTimersByTime(10_000));
    expect((screen.getByRole('button',{name:'Retry in 20s'}) as HTMLButtonElement).disabled).toBe(true);
    act(() => vi.advanceTimersByTime(20_000));
    expect((screen.getByRole('button',{name:'Refresh episode titles'}) as HTMLButtonElement).disabled).toBe(false);
    expect(retry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
