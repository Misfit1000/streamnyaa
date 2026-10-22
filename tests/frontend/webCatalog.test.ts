import { beforeEach, expect, it, vi } from 'vitest';
const graph=vi.hoisted(()=>vi.fn());
vi.mock('../../src/api/jikan',()=>({fetchAniList:graph,mapAnilistToJikan:(m:any)=>({anilist_id:m.id,mal_id:m.idMal,title:m.title.english,isAdult:m.isAdult,status:m.status,type:m.format,genres:(m.genres||[]).map((name:string)=>({name}))})}));
import { catalogRequest,catalogOptions,fetchCatalogPage,catalogNextPage,uniqueMedia } from '../../src/api/webCatalog';
beforeEach(()=>{graph.mockReset();});
const media=(id:number)=>({id,idMal:id+100,title:{english:`Title ${id}`},isAdult:false,status:'RELEASING',format:'TV',genres:['Action']});
it('uses the same feed identity for Home and View All, including content preferences',()=>{
 const home=catalogRequest(new URLSearchParams('sort=trending'),false),view=catalogRequest(new URLSearchParams('sort=trending&status=airing'),false);
 expect(catalogOptions(home).queryKey).not.toEqual(catalogOptions({...home,adult:true}).queryKey);
 // Explicit airing and the Trending default have identical transport eligibility.
 expect(catalogOptions(home).queryKey).toEqual(catalogOptions(view).queryKey);
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
