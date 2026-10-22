import { afterEach, expect, it, vi } from 'vitest';
import { fetchPublicCalendar } from '../../src/api/calendar';
afterEach(()=>vi.unstubAllGlobals());
it('Calendar v2 cache admits the real transport, keeps the priority day and reuses a fresh reply',async()=>{
 const now=Date.now(),start=Math.floor(now/86400_000)*86400,end=start+7*86400;
 const payload={version:1,data:[],providers:{anilist:{fetchedAt:now,stale:false}},complete:true,stale:false,fetchedAt:now,pendingIdentities:0};
 const fetcher=vi.fn(async()=>new Response(JSON.stringify(payload),{headers:{'Content-Type':'application/json','X-StreamNyaa-Fetched-At':String(now)}}));vi.stubGlobal('fetch',fetcher);
 expect(await fetchPublicCalendar(start,end,undefined,undefined,start+86400)).toEqual(payload);
 const url=new URL(String(fetcher.mock.calls[0][0]),'https://fixture.test');expect(url.searchParams.get('progressive')).toBe('1');expect(url.searchParams.get('priorityDay')).toBe(String(start+86400));
 expect(await fetchPublicCalendar(start,end,undefined,undefined,start+86400)).toEqual(payload);expect(fetcher).toHaveBeenCalledTimes(1);
});
