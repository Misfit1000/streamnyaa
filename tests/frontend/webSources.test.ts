import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../../src/api/nyaa',async original=>({...await original<typeof import('../../src/api/nyaa')>(),searchNyaa:vi.fn()}));
import {searchNyaa,type NyaaItem} from '../../src/api/nyaa';
import {buildSourceIdentity} from '../../src/lib/desktopSourceIdentity';
import {batchSearchText,classifyWebSources,discoverWebSources,torrentFileUrl,webAudioMatches,webSourcePlan} from '../../src/lib/webSources';
import {isHentaiTitle,titleSourceProvider} from '../../src/lib/webSourceProvider';
it('classifies Hentai explicitly, never Ecchi or an adult flag alone, and keeps adult searches gated',()=>{
 expect(isHentaiTitle({genres:[{name:'Hentai'}]})).toBe(true);expect(titleSourceProvider({genres:[{name:'Ecchi'}],isAdult:true})).toBe('nyaa');
 expect(webSourcePlan({query:'Fixture title',provider:'sukebei',adultAllowed:false})).toEqual([]);
 expect(webSourcePlan({identity,episode:2,provider:'sukebei',adultAllowed:true}).every(job=>job.category==='1_1')).toBe(true);
 expect(torrentFileUrl('https://sukebei.nyaa.si/view/123')).toBe('https://sukebei.nyaa.si/download/123.torrent');
 expect(torrentFileUrl('https://sukebei.nyaa.si.attacker.test/view/123')).toBeUndefined();
});
afterEach(()=>{vi.clearAllMocks();vi.useRealTimers();});
const identity=buildSourceIdentity({mal_id:1,title:'Example Anime',title_english:'Example English',type:'TV'});
const item=(title:string,id=1):NyaaItem=>({title,infoHash:String(id).padStart(40,'a'),link:`https://nyaa.si/view/${id}`,magnet:'magnet:?xt=urn:btih:'+String(id).padStart(40,'a'),size:'1 GiB',rawSize:1e9,seeders:'20',rawSeeders:20,leechers:'0',categoryId:'1_2',category:'Anime',pubDate:''});
const result=(items:NyaaItem[])=>Object.assign(items,{complete:true,stale:false,fetchedAt:Date.now()});
it('uses all canonical aliases and title-scoped pack discovery without injecting quality or audio',()=>{
 const jobs=webSourcePlan({identity,episode:2});
 expect(jobs.slice(0,3).some(job=>job.scope==='title')).toBe(true);
 expect(jobs.some(job=>job.query==='Example English 02')).toBe(true);
 expect(jobs.some(job=>job.category==='1_3')).toBe(true);
 expect(jobs.every(job=>!job.query.includes('1080p'))).toBe(true);
 const movie=buildSourceIdentity({mal_id:2,type:'MOVIE',title:'Demon Slayer: Infinity Castle'});
 expect(webSourcePlan({identity:movie,episode:1}).every(job=>job.scope==='title'&&!job.episode)).toBe(true);
 expect(webSourcePlan({query:'Example Anime 01-10'}).every(job=>job.scope==='title')).toBe(true);
 expect(webSourcePlan({query:'Soundtrack 2',category:'2_0'}).every(job=>job.scope==='title')).toBe(true);
 expect(classifyWebSources([item('Example soundtrack')])).toHaveLength(1);
});
it('separates matching episodes, uncertain seasons and uninspected batches from conflicting releases',()=>{
 const sequel=buildSourceIdentity({mal_id:2,title:'Example Anime Season 2',type:'TV'});
 const sources=classifyWebSources([item('Example Anime S02E02',1),item('Example Anime - 02',2),item('Example Anime S01E02',3),item('Example Anime Season 2 01-10 Batch',4),item('Example Anime Season 1 Batch',5),item('Example Anime S02E03',6),item('Example Anime S02E02 NCOP',7)],sequel,2);
 expect(sources.map(value=>value.matchTier)).toEqual(expect.arrayContaining(['exact','uncertain','batch']));
 expect(sources.filter(source=>source.matchTier!=='conflict')).toHaveLength(3);expect(sources.filter(source=>source.matchTier==='conflict')).toHaveLength(3);
 expect(sources.find(value=>value.matchTier==='batch')?.matchReason).toContain('not inspected');
 expect(classifyWebSources([item('Unrelated Anime - 02')])[0].matchTier).toBe('search');
});
it('keeps dual audio in both audio views without substituting sub-only releases for dub',()=>{
 expect(webAudioMatches('Example Dual-Audio','sub')).toBe(true);expect(webAudioMatches('Example Dual Audio','dub')).toBe(true);
 expect(webAudioMatches('Example subbed','dub')).toBe(false);expect(webAudioMatches('Example English Dub','sub')).toBe(false);
});
it('retains season/movie numbering and permits only known release links for torrent downloads',()=>{
 for(const title of ['Example Season 2','Example Part 2','Example Movie 1'])expect(batchSearchText(title)).toBe(title);
 expect(batchSearchText('Example S02E03')).toBe('Example S02');expect(batchSearchText('Example - 03')).toBe('Example');
 expect(torrentFileUrl('https://nyaa.si/view/12')).toBe('https://nyaa.si/download/12.torrent');
 expect(torrentFileUrl('https://nyaa.si.evil.test/view/12')).toBeUndefined();
});
it('does not stop after the first alias succeeds and resumes pending lanes with retained results',async()=>{
 vi.mocked(searchNyaa).mockImplementation(async query=>result([item(`${query} [1080p]`,query.includes('English')?2:1)]));
 const first=await discoverWebSources({identity,episode:2},{requestLimit:2});
 expect(first.items).toHaveLength(2);expect(first.complete).toBe(false);expect(first.pending?.length).toBeGreaterThan(0);
 const pending=first.pending![0];vi.mocked(searchNyaa).mockClear();
 vi.mocked(searchNyaa).mockRejectedValue(Object.assign(Error('Throttled'),{retryAt:Date.now()+90000}));
 const failed=await discoverWebSources({identity,episode:2},{previous:first,requestLimit:1});
 expect(failed.items).toEqual(first.items);expect(failed.retryAt).toBeGreaterThan(Date.now());
 expect(searchNyaa).toHaveBeenCalledWith(pending.query,pending.category,'0',String(pending.page),expect.objectContaining({intent:{scope:pending.scope}}));
});
it('uses title intent for the pack lane and clears failure state only after successful recovery',async()=>{
 const job=webSourcePlan({identity,episode:2}).find(job=>job.scope==='title')!;
 vi.mocked(searchNyaa).mockResolvedValue(result([item('Example Anime 01-10 Batch')]));
 const found=await discoverWebSources({identity,episode:2},{previous:{items:[],complete:false,pending:[job],stale:true,partialReason:'provider-failure'},requestLimit:1});
 expect(searchNyaa).toHaveBeenCalledWith(job.query,job.category,'0',String(job.page),expect.objectContaining({maxAgeMs:300000,intent:{scope:'title'}}));
 expect(found.items[0].matchTier).toBe('batch');expect(found.complete).toBe(false);expect(found.pending?.[0].page).toBe(2);expect(found.stale).toBe(false);
});
it('never converts cancellation into a fresh empty result',async()=>{
 const controller=new AbortController();vi.mocked(searchNyaa).mockImplementation(async()=>{controller.abort();throw new DOMException('Cancelled','AbortError');});
 await expect(discoverWebSources({identity,episode:2},{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
});
it('bounds a hanging browser consumer and keeps successful earlier results',async()=>{
 vi.useFakeTimers();const previous={items:classifyWebSources([item('Example Anime - 02')],identity,2),complete:false,pending:webSourcePlan({identity,episode:2}).slice(0,1)};
 vi.mocked(searchNyaa).mockImplementation(async(_q,_c,_f,_p,options)=>new Promise((_,reject)=>options?.signal?.addEventListener('abort',()=>reject(options.signal?.reason),{once:true})));
 const pending=discoverWebSources({identity,episode:2},{previous,requestLimit:1});
 await vi.advanceTimersByTimeAsync(8001);const result=await pending;
 expect(result.items).toEqual(previous.items);expect(result.complete).toBe(false);expect(result.partialReason).toBe('provider-failure');
});
