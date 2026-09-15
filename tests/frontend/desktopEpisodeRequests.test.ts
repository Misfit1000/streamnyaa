import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let api: typeof import('../../src/api/jikan');
let invoke: ReturnType<typeof vi.fn>;
const page = (n: number, last = 1) => ({data:[{mal_id:n,title:`Title ${n}`,aired:'2020-01-01'}],pagination:{last_visible_page:last,has_next_page:last>1}});
const response = (data: unknown) => ({data,cache_status:'network',fetched_at:Date.now()});
beforeEach(async () => {
  vi.resetModules(); localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-15T00:00:00Z'));
  window.__STREAMNYAA_DESKTOP__=true;
  invoke=vi.fn(); window.__TAURI__={core:{invoke}};
  api=await import('../../src/api/jikan');
});
afterEach(()=>{vi.useRealTimers();delete window.__TAURI__;delete window.__STREAMNYAA_DESKTOP__;});
it('rejects noncanonical identities and invalid pagination before native requests',async()=>{
  await expect(api.fetchAnimeEpisodes('anilist:1')).rejects.toMatchObject({code:'invalid'});
  await expect(api.fetchAnimeEpisodes('1',0)).rejects.toMatchObject({code:'invalid'});
  expect(invoke).not.toHaveBeenCalled();
});
it('keeps saved episode titles after an empty upstream response',async()=>{
  invoke.mockResolvedValueOnce(response(page(1)));
  await api.fetchAnimeEpisodes('1001');
  vi.setSystemTime(Date.now()+601_000);
  invoke.mockResolvedValueOnce(response({data:[],pagination:{last_visible_page:1}}));
  const result=await api.fetchAnimeEpisodes('1001');
  expect(result.data[0].title).toBe('Title 1');expect(result.streamnyaa.status).toBe('stale');
});
it('retains the requested page when only the final page fails',async()=>{
  invoke.mockResolvedValueOnce(response(page(1,3))).mockRejectedValueOnce({code:'error',provider:'jikan',message:'Unavailable',statusCode:504,retryable:true});
  const result=await api.fetchAnimeEpisodeWindow('1002');
  expect(result.data[0].mal_id).toBe(1);expect(result.latestPageResolved).toBe(false);
});
it('respects throttling without trying alternate page URLs',async()=>{
  invoke.mockRejectedValue({code:'rate-limited',provider:'jikan',message:'Wait',statusCode:429,retryAfterMs:60_000,retryable:true});
  await expect(api.fetchAnimeEpisodes('1003')).rejects.toMatchObject({code:'rate-limited',retryAfterMs:60_000});
  await expect(api.fetchAnimeEpisodes('1003')).rejects.toMatchObject({code:'rate-limited'});
  expect(invoke).toHaveBeenCalledTimes(1);
});
it('does not turn cancellation into cached success or an empty catalog',async()=>{
  const controller=new AbortController();controller.abort();
  await expect(api.fetchAnimeEpisodes('1004',1,{signal:controller.signal})).rejects.toMatchObject({code:'cancelled'});
  expect(invoke).not.toHaveBeenCalled();
});
it('keeps a genuine empty result distinct from a transport error',async()=>{
  invoke.mockResolvedValue(response({data:[],pagination:{last_visible_page:1}}));
  expect((await api.fetchAnimeEpisodes('1005')).streamnyaa.status).toBe('authoritative');
});
