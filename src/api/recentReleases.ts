import {fetchDesktopMetadataApi,isDesktopApp} from '../lib/desktop';
import {sharedPublicResponse} from '../lib/publicBrowserCache';
import {isRecentReleasePage,type RecentReleasePage,type ReleaseTrack} from '../lib/recentReleases';
export type RecentReleaseRequest={before:number;track:ReleaseTrack;adult:boolean;type?:string;status?:string;genre?:string;year?:number};
export type ReleasePageParam={cursor?:string;build?:string};
export async function fetchRecentReleases(request:RecentReleaseRequest,page:ReleasePageParam={},signal?:AbortSignal):Promise<RecentReleasePage>{
 const params=new URLSearchParams({before:String(request.before),track:request.track,adult:request.adult?'1':'0'});
 if(!isDesktopApp())params.set('contentPolicy','2');
 for(const [key,value] of Object.entries({...request,...page}))if(!['before','track','adult'].includes(key)&&value)params.set(key,String(value));
 let data:unknown;
 if(isDesktopApp()){
  const response=await fetchDesktopMetadataApi({provider:'releases',path:`/recent?${params}`,ttl_seconds:60},{signal,priority:'background',deadlineMs:30000});data=response.data;
 }else{
  const response=await sharedPublicResponse(`recent-releases:v2:${params}`,60000,owned=>fetch(`/api/stream-sources?provider=releases&${params}`,{signal:owned}),signal,isRecentReleasePage);
  data=await response.json();if(!response.ok)throw Object.assign(Error('Recent release information could not refresh.'),{statusCode:response.status,...([400,404,409].includes(response.status)?{code:'invalid',retryable:false}:{}),retryAt:(data as any)?.retryAt});
 }
 if(!isRecentReleasePage(data)||data.before!==request.before||data.track!==request.track)throw Error('The release feed returned invalid timing information.');
 return data;
}
export function releaseAnime(row:RecentReleasePage['data'][number]):any{
 return{...row,id:row.anilist_id||row.mal_id,recentFeedKind:'aired',genres:Array.isArray(row.genres)?row.genres.map((g:any)=>typeof g==='string'?{name:g}:g):[],
  latestEpisode:row.broadcastLatestEpisode||row.airingEpisode,homeAvailabilityLabel:undefined};
}
