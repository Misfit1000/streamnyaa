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
  expect(invoke).toHaveBeenCalledTimes(1);
  await expect(api.fetchAnimeEpisodeTail('1002',result.latestPage)).rejects.toMatchObject({statusCode:504});
});
it('does not mark a stale tail as fresh or lose its original retrieval time',async()=>{
  invoke.mockResolvedValueOnce(response(page(1,3))).mockResolvedValueOnce(response(page(201,3)));
  const first=await api.fetchAnimeEpisodeWindow('1006');
  const tail=await api.fetchAnimeEpisodeTail('1006',3);
  vi.setSystemTime(Date.now()+601_000);
  invoke.mockRejectedValueOnce({code:'error',provider:'jikan',message:'Unavailable',statusCode:504,retryable:true});
  const savedTail=await api.fetchAnimeEpisodeTail('1006',3);
  expect(savedTail.latestPageResolved).toBe(false);
  expect(savedTail.streamnyaa.status).toBe('stale');
  const merged=api.mergeAnimeEpisodeTail(first,savedTail);
  expect(merged.complete).toBe(false);
  expect(merged.data.map((item:any)=>item.mal_id)).toEqual([1,201]);
  expect(merged.streamnyaa.fetchedAt).toBe(tail.streamnyaa.fetchedAt);
});
it('respects throttling without trying alternate page URLs',async()=>{
  invoke.mockRejectedValue({code:'rate-limited',provider:'jikan',message:'Wait',statusCode:429,retryAfterMs:60_000,retryable:true});
  await expect(api.fetchAnimeEpisodes('1003')).rejects.toMatchObject({code:'rate-limited',retryAfterMs:60_000});
  await expect(api.fetchAnimeEpisodes('1003')).rejects.toMatchObject({code:'rate-limited'});
  expect(invoke).toHaveBeenCalledTimes(1);
});
it('does not multiply the native retry budget by trying equivalent page-one URLs',async()=>{
  invoke.mockRejectedValue({code:'timeout',provider:'jikan',message:'Timed out',retryable:true});
  await expect(api.fetchAnimeEpisodes('1007')).rejects.toMatchObject({code:'timeout'});
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
it('publishes available Calendar pages before a later page fails without re-aging retained records', async () => {
  const fetchedAt = Date.now() - 30_000;
  invoke.mockResolvedValueOnce({ data: { data: { Page: { pageInfo: { hasNextPage: true, lastPage: 2 }, airingSchedules: [
    { id: 1, episode: 2, airingAt: 1700000000, media: { id: 1, idMal: 10, title: { romaji: 'Series' }, genres: [] } },
  ] } } }, cache_status: 'memory', fetched_at: fetchedAt }).mockRejectedValueOnce({ code: 'timeout', provider: 'anilist', message: 'Timed out', retryable: true, retryAt: Date.now() + 30_000 });
  const progress = vi.fn();
  const result = await api.fetchCompleteSchedule(1699999999, 1700600000, 10, {}, progress);
  expect(progress).toHaveBeenCalledTimes(1);
  expect(progress.mock.calls[0][0]).toMatchObject({ complete: false, data: [{ airingEpisode: 2 }], streamnyaa: { fetchedAt } });
  expect(result).toMatchObject({ complete: false, data: [{ airingEpisode: 2 }], streamnyaa: { fetchedAt }, retryAt: Date.now() + 30_000 });
  expect(invoke).toHaveBeenCalledTimes(2);
});
