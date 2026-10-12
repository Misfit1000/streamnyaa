import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/api/jikan',()=>({fetchAnimeDetails:vi.fn(),fetchAnimeEpisodeWindow:vi.fn()}));
vi.mock('../../src/api/nyaa',()=>({searchNyaa:vi.fn()}));
import {fetchAnimeDetails,fetchAnimeEpisodeWindow} from '../../src/api/jikan';
import {preloadDesktopWatchData} from '../../src/lib/desktopRoutePreload';
import {desktopQueryClient} from '../../src/lib/desktopQueryClient';
import {desktopAnimeQueryKey} from '../../src/lib/desktopRequests';
beforeEach(()=>{desktopQueryClient.clear();vi.clearAllMocks();});
it('reuses a prefetched episode window with the actual Watch query identity',async()=>{
 vi.mocked(fetchAnimeDetails).mockResolvedValue({data:{mal_id:54321,title:'Example'}} as any);
 vi.mocked(fetchAnimeEpisodeWindow).mockResolvedValue({data:[{mal_id:101,title:'Episode'}]} as any);
 await preloadDesktopWatchData('/watch/54321-example?mid=54321&ep=101');
 const result=await desktopQueryClient.fetchQuery({queryKey:['episodes','54321',2,3],queryFn:()=>fetchAnimeEpisodeWindow('54321',2),staleTime:600000});
 expect(fetchAnimeEpisodeWindow).toHaveBeenCalledTimes(1);
 expect(result.data[0].mal_id).toBe(101);
});
it('does not seed caches or request episodes after hover intent is abandoned', async () => {
 let release!: (value: any) => void;
 vi.mocked(fetchAnimeDetails).mockImplementation(() => new Promise(resolve => { release = resolve; }));
 const controller = new AbortController();
 const pending = preloadDesktopWatchData('/watch/98765-example?mid=98765&ep=2', true, controller.signal);
 expect(vi.mocked(fetchAnimeDetails).mock.calls[0][1]).toMatchObject({ priority: 'prefetch', signal: controller.signal });
 controller.abort();
 release({ data: { mal_id: 98765, title: 'Example' } });
 await pending;
 expect(fetchAnimeEpisodeWindow).not.toHaveBeenCalled();
 expect(desktopQueryClient.getQueryData(desktopAnimeQueryKey('98765-example', '', '98765'))).toBeUndefined();
});
it('preserves provider retrieval timestamps when seeding hover caches', async () => {
 vi.mocked(fetchAnimeDetails).mockResolvedValue({ data: { mal_id: 98764, title: 'Example' }, streamnyaa: { fetchedAt: 1700000000000 } } as any);
 vi.mocked(fetchAnimeEpisodeWindow).mockResolvedValue({ data: [], fetchedAt: 1700000000100 } as any);
 await preloadDesktopWatchData('/watch/98764-example?mid=98764&ep=2', false, new AbortController().signal);
 expect(desktopQueryClient.getQueryState(desktopAnimeQueryKey('98764-example', '', '98764'))?.dataUpdatedAt).toBe(1700000000000);
 expect(desktopQueryClient.getQueryState(['episodes', '98764', 1, 3])?.dataUpdatedAt).toBe(1700000000100);
});
it('does not replace newer foreground data with a late stale hover response', async () => {
 let release!: (value: any) => void;
 vi.mocked(fetchAnimeDetails).mockImplementation(() => new Promise(resolve => { release = resolve; }));
 vi.mocked(fetchAnimeEpisodeWindow).mockResolvedValue({ data: [] } as any);
 const key = desktopAnimeQueryKey('98763-example', '', '98763');
 const pending = preloadDesktopWatchData('/watch/98763-example?mid=98763&ep=2', false, new AbortController().signal);
 desktopQueryClient.setQueryData(key, { data: { mal_id: 98763, title: 'New data' } }, { updatedAt: 1800000000000 });
 release({ data: { mal_id: 98763, title: 'Old data' }, streamnyaa: { fetchedAt: 1700000000000 } });
 await pending;
 expect(desktopQueryClient.getQueryData<any>(key)?.data.title).toBe('New data');
});
