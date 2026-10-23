import {afterEach,it,expect,vi} from 'vitest';
import {fetchRecentReleases} from '../../src/api/recentReleases';
import {sharedPublicResponse} from '../../src/lib/publicBrowserCache';
afterEach(()=>{vi.unstubAllGlobals();delete window.__TAURI__;delete window.__STREAMNYAA_DESKTOP__;});
const before=Math.floor(Date.now()/1000);
const page=(cutoff:number)=>({version:1,before:cutoff,track:'sub',page:1,data:[],complete:false,stale:false,fetchedAt:Date.now(),buildCursor:'1:0'});
it('admits the real release client through the public cache and retains building continuation',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify(page(before)),{headers:{'Cache-Control':'no-store'}}));vi.stubGlobal('fetch',fetch);
 expect(await fetchRecentReleases({before,track:'sub',adult:false})).toMatchObject({buildCursor:'1:0',complete:false});
 expect(String(fetch.mock.calls[0][0])).toContain('provider=releases');
 await fetchRecentReleases({before,track:'sub',adult:false},{build:'1:0'});expect(String(fetch.mock.calls[1][0])).toContain('build=1%3A0');
});
it('does not cache an incomplete release response or admit private namespaces',async()=>{
 const cutoff=before-1,fetch=vi.fn(async()=>new Response(JSON.stringify(page(cutoff)),{headers:{'Cache-Control':'no-store'}}));vi.stubGlobal('fetch',fetch);
 for(let i=0;i<2;i++)await fetchRecentReleases({before:cutoff,track:'sub',adult:false});expect(fetch).toHaveBeenCalledTimes(2);
 await expect(sharedPublicResponse('admin:releases',60000,fetch)).rejects.toThrow('Only public');
});
