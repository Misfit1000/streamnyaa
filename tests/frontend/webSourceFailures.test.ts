import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/desktop',()=>({isDesktopApp:()=>false,fetchDesktopSourceApi:vi.fn()}));
import { searchNyaa } from '../../src/api/nyaa';
afterEach(()=>vi.unstubAllGlobals());
it('web source failures preserve denial/throttle status and do not become successful empty results',async()=>{
 for(const status of [403,429,503]){
  const fetcher=vi.fn(async()=>new Response('Unavailable',{status,headers:{'Retry-After':'90'}}));vi.stubGlobal('fetch',fetcher);
  await expect(searchNyaa(`audit-failure-${status}`)).rejects.toMatchObject({statusCode:status,retryable:status!==403});expect(fetcher).toHaveBeenCalledTimes(1);
 }
});
it('invalid and partial-empty source replies are unavailable; a complete empty reply remains genuinely empty',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{headers:{'Content-Type':'application/json'}})));
 await expect(searchNyaa('audit-invalid')).rejects.toThrow('invalid response');
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('[]',{headers:{'Content-Type':'application/json','X-Source-Complete':'false'}})));
 await expect(searchNyaa('audit-partial')).rejects.toMatchObject({statusCode:503});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('[]',{headers:{'Content-Type':'application/json','X-Source-Complete':'true'}})));
 expect(await searchNyaa('audit-complete')).toMatchObject({length:0,complete:true});
});
