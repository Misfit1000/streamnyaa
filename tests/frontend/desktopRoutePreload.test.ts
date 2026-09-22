import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/api/jikan',()=>({fetchAnimeDetails:vi.fn(),fetchAnimeEpisodeWindow:vi.fn()}));
vi.mock('../../src/api/nyaa',()=>({searchNyaa:vi.fn()}));
import {fetchAnimeDetails,fetchAnimeEpisodeWindow} from '../../src/api/jikan';
import {preloadDesktopWatchData} from '../../src/lib/desktopRoutePreload';
import {desktopQueryClient} from '../../src/lib/desktopQueryClient';
beforeEach(()=>{desktopQueryClient.clear();vi.clearAllMocks();});
it('reuses a prefetched episode window with the actual Watch query identity',async()=>{
 vi.mocked(fetchAnimeDetails).mockResolvedValue({data:{mal_id:54321,title:'Example'}} as any);
 vi.mocked(fetchAnimeEpisodeWindow).mockResolvedValue({data:[{mal_id:101,title:'Episode'}]} as any);
 await preloadDesktopWatchData('/watch/54321-example?mid=54321&ep=101');
 const result=await desktopQueryClient.fetchQuery({queryKey:['episodes','54321',2,3],queryFn:()=>fetchAnimeEpisodeWindow('54321',2),staleTime:600000});
 expect(fetchAnimeEpisodeWindow).toHaveBeenCalledTimes(1);
 expect(result.data[0].mal_id).toBe(101);
});
