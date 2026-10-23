import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
function recorder() {
  const state = { status: 0, body: null as any, headers: {} as Record<string, string> };
  const response = { setHeader(key: string, value: string) { state.headers[key] = value; }, status(value: number) { state.status = value; return this; }, json(value: any) { state.body = value; return this; } };
  return { state, response };
}
beforeEach(() => { vi.resetModules(); vi.stubEnv('ANIMESCHEDULE_TOKEN', 'test-only-application-token'); vi.stubEnv('ANIMESCHEDULE_API_TOKEN', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('authenticated Calendar metadata gateway', () => {
  it('preserves Jikan retrieval age and marks cached outage responses stale', async () => {
    vi.useFakeTimers();vi.setSystemTime(1700000000000);
    const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({data:[{mal_id:1,title:'Episode title'}],pagination:{last_visible_page:1}}))).mockRejectedValue(new Error('Connection timed out'));
    vi.stubGlobal('fetch',fetch);
    const {default:handler}=await import('../../api/stream-sources');
    const request={method:'GET',query:{provider:'jikan',ttl:'60',path:'/anime/52991/episodes'}};
    const first=recorder();await handler(request,first.response);
    expect(first.state.body.streamnyaa).toEqual({provider:'tenrai',adapterVersion:1,fetchedAt:1700000000000,stale:false});
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    vi.setSystemTime(1700000030000);const hit=recorder();await handler(request,hit.response);
    expect(hit.state.headers['X-StreamNyaa-Fetched-At']).toBe('1700000000000');expect(fetch).toHaveBeenCalledOnce();
    vi.setSystemTime(1700000061000);const stale=recorder();await handler(request,stale.response);
    expect(stale.state.body).toMatchObject({data:[{title:'Episode title'}],streamnyaa:{fetchedAt:1700000000000,stale:true}});
  });
  it('keeps credentials on the server and preserves the original retrieval time through cache hits and stale replies', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1700000000000);
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ route: 'example', status: 'Delayed' }]))).mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    const { default: handler } = await import('../../api/stream-sources');
    const request = { method: 'GET', query: { provider: 'animeschedule', ttl: '60', path: '/timetables/all?year=2026&week=42&tz=UTC' } };
    const first = recorder(); await handler(request, first.response);
    expect(first.state.body.streamnyaa).toEqual({ fetchedAt: 1700000000000, stale: false });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only-application-token');
    expect(JSON.stringify(first.state.body)).not.toContain('test-only-application-token');
    vi.setSystemTime(1700000030000); const hit = recorder(); await handler(request, hit.response);
    expect(fetch).toHaveBeenCalledTimes(1); expect(hit.state.body.streamnyaa.fetchedAt).toBe(1700000000000);
    vi.setSystemTime(1700000061000); const stale = recorder(); await handler(request, stale.response);
    expect(stale.state.body.streamnyaa).toEqual({ fetchedAt: 1700000000000, stale: true });
  });
  it('rejects token-less access and private provider routes without sending a request', async () => {
    vi.stubEnv('ANIMESCHEDULE_TOKEN', ''); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { default: handler } = await import('../../api/stream-sources');
    for (const path of ['/timetables/all', '/oauth2/token', '/user']) {
      const result = recorder(); await handler({ method: 'GET', query: { provider: 'animeschedule', path } }, result.response);
      expect(result.state.status).toBe(path === '/timetables/all' ? 500 : 400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([['unauthorized', 401], ['', 200], ['<html>failure</html>', 200]])('does not hide an unusable upstream reply as successful empty data (%s)', async (body, status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })));
    const { default: handler } = await import('../../api/stream-sources');
    const result = recorder(); await handler({ method: 'GET', query: { provider: 'animeschedule', path: '/timetables/dub' } }, result.response);
    expect(result.state.status).toBe(status === 401 ? 401 : 502); expect(result.state.body.error).toMatch(/HTTP 401|empty|invalid JSON/);
  });
});
