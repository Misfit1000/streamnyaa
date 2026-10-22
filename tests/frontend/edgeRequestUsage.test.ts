import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/accountApi', () => ({ accountApiFetch: api, accountApiUrl: (path: string) => path }));
const session = (id = 'a') => ({ access_token: `token-${id}`, user: { id, email: `${id}@example.test` } });
const entry = (id: number) => ({ id: String(id), title: `Anime ${id}`, magnet: `magnet:${id}`, action: 'open', createdAt: '2026-09-22T00:00:00Z' });
const ok = () => new Response(JSON.stringify({ ok: true }));

beforeEach(() => { vi.resetModules(); api.mockReset(); localStorage.clear(); });
afterEach(() => vi.useRealTimers());

describe('history request reduction', () => {
  it('uploads 30 entries once, persists acknowledgements, and isolates accounts', async () => {
    localStorage.setItem('streamnyaa.downloadHistory', JSON.stringify(Array.from({ length: 30 }, (_, i) => entry(i))));
    api.mockImplementation(async () => ok());
    const { syncLocalDownloadHistoryToAccount: sync } = await import('../../src/lib/activity');
    await Promise.all([sync(session()), sync(session())]);
    expect(api).toHaveBeenCalledTimes(1);
    expect(JSON.parse(api.mock.calls[0][1].body).entries).toHaveLength(30);
    vi.resetModules();
    await (await import('../../src/lib/activity')).syncLocalDownloadHistoryToAccount(session());
    expect(api).toHaveBeenCalledTimes(1);
    await sync(session('b'));
    expect(api).toHaveBeenCalledTimes(1);
  });

  it.each([500, 200])('does not acknowledge failed or local-only responses (%s)', async (status) => {
    localStorage.setItem('streamnyaa.downloadHistory', JSON.stringify([entry(1)]));
    api.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, localOnly: true }), { status })).mockImplementation(async () => ok());
    const { syncLocalDownloadHistoryToAccount: sync } = await import('../../src/lib/activity');
    await sync(session()); await sync(session()); await sync(session());
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('includes changes saved during an upload in a subsequent batch', async () => {
    let finish!: (response: Response) => void;
    api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockImplementation(async () => ok());
    localStorage.setItem('streamnyaa.downloadHistory', JSON.stringify([entry(1)]));
    const { syncLocalDownloadHistoryToAccount: sync, saveDownloadHistory } = await import('../../src/lib/activity');
    const first = sync(session());
    const second = saveDownloadHistory({ title: 'New', magnet: 'magnet:new', action: 'open' }, session());
    finish(ok());
    await Promise.all([first, second]);
    expect(api).toHaveBeenCalledTimes(2);
    expect(JSON.parse(api.mock.calls[1][1].body).entries).toHaveLength(1);
  });

  it('coalesces concurrent reads without sharing data between accounts', async () => {
    api.mockImplementation(async () => new Response('[]'));
    const { fetchAccountDownloadHistory: read } = await import('../../src/lib/activity');
    await Promise.all([read(session()), read(session()), read(session('b'))]);
    expect(api).toHaveBeenCalledTimes(2);
  });
});

describe('public configuration cache', () => {
  it('coalesces requests, survives reload, and refreshes after expiry', async () => {
    vi.useFakeTimers();
    const config = { supabaseUrl: 'https://example.supabase.co', publishableKey: 'public-key' };
    api.mockImplementation(async () => new Response(JSON.stringify(config)));
    let auth = await import('../../src/lib/supabaseAuth');
    expect(await Promise.all([auth.getAuthConfig(), auth.getAuthConfig()])).toEqual([config, config]);
    expect(api).toHaveBeenCalledTimes(1);
    vi.resetModules(); auth = await import('../../src/lib/supabaseAuth');
    expect(await auth.getAuthConfig()).toEqual(config);
    expect(api).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_600_001);
    await auth.getAuthConfig();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('recovers after temporary failure without persisting fallback as fresh', async () => {
    vi.useFakeTimers();
    api.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(new Response(JSON.stringify({ supabaseUrl: 'https://example.supabase.co', publishableKey: 'public' })));
    const auth = await import('../../src/lib/supabaseAuth');
    await auth.getAuthConfig();
    expect(localStorage.getItem('streamnyaa.auth.publicConfig.v1')).toBeNull();
    vi.advanceTimersByTime(60_001);
    expect((await auth.getAuthConfig()).publishableKey).toBe('public');
  });
});
