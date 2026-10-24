import { beforeEach, expect, it, vi } from 'vitest';
const graph=vi.hoisted(()=>vi.fn());
vi.mock('../../src/api/jikan',()=>({fetchAniList:graph,mapAnilistToJikan:(m:any)=>({anilist_id:m.id,mal_id:m.idMal,title:m.title.english,isAdult:m.isAdult,countryOfOrigin:m.countryOfOrigin,status:m.status,type:m.format,genres:(m.genres||[]).map((name:string)=>({name}))})}));
import { catalogRequest,catalogOptions,fetchCatalogPage,catalogNextPage,uniqueMedia } from '../../src/api/webCatalog';
beforeEach(()=>{graph.mockReset();});
const media=(id:number)=>({id,idMal:id+100,title:{english:`Title ${id}`},isAdult:false,status:'RELEASING',format:'TV',genres:['Action']});
it('uses the same feed identity for Home and View All, including content preferences',()=>{
 const home=catalogRequest(new URLSearchParams('sort=trending'),false),view=catalogRequest(new URLSearchParams('sort=trending&status=airing'),false);
 expect(catalogOptions(home).queryKey).not.toEqual(catalogOptions({...home,adult:true}).queryKey);
 // Explicit airing and the Trending default have identical transport eligibility.
 expect(catalogOptions(home).queryKey).toEqual(catalogOptions(view).queryKey);
 expect(catalogOptions(home).queryKey).toEqual(catalogOptions({...home,hideChinese:false}).queryKey);
});
it('SFW excludes Hentai at the provider while retaining mature Ecchi, and Chinese filtering reuses the raw page',async()=>{
 const rows=[{...media(1),genres:['Ecchi'],isAdult:true},{...media(2),genres:['Hentai'],isAdult:true},{...media(3),countryOfOrigin:'CN'}];
 graph.mockResolvedValue(new Response(JSON.stringify({data:{Page:{pageInfo:{currentPage:1,hasNextPage:false},media:rows}}})));
 const request=catalogRequest(new URLSearchParams(),false,false),page=await fetchCatalogPage(request,1);
 expect(page.data.map(row=>row.anilist_id)).toEqual([1,3]);expect(graph.mock.calls[0][0].variables.excluded).toEqual(['Hentai']);expect(graph.mock.calls[0][0].query).not.toContain('isAdult:$adult');
 const selected=catalogOptions({...request,hideChinese:true}).select!({pages:[page],pageParams:[1]});expect(selected.pages[0].data.map(row=>row.anilist_id)).toEqual([1]);
});
it('recent pagination uses genuine episode records and a stable cutoff',async()=>{
 const before=1700000000,request=catalogRequest(new URLSearchParams(`sort=recent&before=${before}`),false),signal=new AbortController().signal;
 graph.mockImplementation(async(body:any)=>new Response(JSON.stringify({data:{Page:{pageInfo:{currentPage:body.variables.page,hasNextPage:body.variables.page===1},airingSchedules:[{id:body.variables.page,episode:body.variables.page,airingAt:before-10,media:media(body.variables.page)}]}}})));
 const first=await fetchCatalogPage(request,1,signal),second=await fetchCatalogPage(request,2,signal);
 expect(first.nextPage).toBe(2);expect(second.nextPage).toBeUndefined();expect(second.data[0]).toMatchObject({latestEpisode:2,recentFeedKind:'aired'});
 expect(graph.mock.calls[0][0].query).toContain('airingSchedules');expect(graph.mock.calls[1][0].variables.before).toBe(before);expect(graph.mock.calls[0][2].signal).toBe(signal);
});
it('does not mislabel an invalid response or repeated provider page as fresh empty results',async()=>{
 graph.mockResolvedValue(new Response(JSON.stringify({errors:[{message:'Unavailable'}]})));
 await expect(fetchCatalogPage(catalogRequest(new URLSearchParams(),false),1)).rejects.toThrow('incomplete');
 const page={data:[],page:1,nextPage:2,fetchedAt:1,fingerprint:'same'};
 expect(catalogNextPage({...page,page:2,nextPage:3},[page,{...page,page:2,nextPage:3}])).toBeUndefined();
 expect(uniqueMedia([{anilist_id:1},{mal_id:1},{anilist_id:1}])).toHaveLength(2);
});
