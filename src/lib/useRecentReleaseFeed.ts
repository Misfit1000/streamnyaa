import {useEffect,useMemo,useRef,useState} from 'react';
import {useInfiniteQuery,useQueryClient} from '@tanstack/react-query';
import {fetchRecentReleases,releaseAnime,type ReleasePageParam,type RecentReleaseRequest} from '../api/recentReleases';
import {recentFeedBound} from '../api/desktopRecentSchedule';
import {releaseTimingLabel,type RecentReleasePage} from './recentReleases';
import {isDesktopApp,loadDesktopAudioPreference,subscribeDesktopAudioPreference} from './desktop';
export function useReleaseTrack(){
 const read=()=>isDesktopApp()&&loadDesktopAudioPreference()==='dub-only'?'dub' as const:'sub' as const;
 const [track,setTrack]=useState(read);useEffect(()=>subscribeDesktopAudioPreference(()=>setTrack(read())),[]);return track;
}
export function releaseFeedItems(pages:RecentReleasePage[]){
 let first=0;pages.forEach((page,i)=>{if(page.page===1)first=i;});
 const seen=new Set<string>();return pages.slice(first).flatMap(page=>page.data).filter(row=>{if(seen.has(row.canonicalId))return false;seen.add(row.canonicalId);return true;});
}
export function useRecentReleaseFeed(input:Omit<RecentReleaseRequest,'before'>&{before?:number;enabled?:boolean}){
 const [anchor,setAnchor]=useState(()=>input.before||recentFeedBound()),[visible,setVisible]=useState(()=>document.visibilityState!=='hidden');
 const enabled=input.enabled!==false;
 const request=useMemo<RecentReleaseRequest>(()=>({before:input.before||anchor,track:input.track,adult:input.adult,type:input.type||'',genre:input.genre||'',status:input.status||'',year:input.year}),[input.before,anchor,input.track,input.adult,input.type,input.genre,input.status,input.year]);
 const client=useQueryClient();
 const recovery=useRef<()=>void>(()=>{});
 const query=useInfiniteQuery({queryKey:['recent-releases',1,request],initialPageParam:{} as ReleasePageParam,
  queryFn:({pageParam,signal})=>fetchRecentReleases(request,pageParam,signal),
  getNextPageParam:(last,pages)=>last.nextCursor?{cursor:last.nextCursor}:last.buildCursor&&!pages.slice(0,-1).some(page=>page.buildCursor===last.buildCursor)?{build:last.buildCursor}:undefined,
  meta:{publicProvider:'releases',recover:()=>recovery.current()},enabled,retry:false,staleTime:60000,refetchOnWindowFocus:false,refetchOnReconnect:true});
 recovery.current=()=>{void (query.data?.pages.at(-1)?.buildCursor&&query.hasNextPage?query.fetchNextPage({cancelRefetch:false}):query.refetch({cancelRefetch:false}));};
 const scope=JSON.stringify({...request,before:0});
 const restored=useMemo(()=>client.getQueryCache().findAll({queryKey:['recent-releases',1]}).filter(value=>JSON.stringify({...value.queryKey[2] as object,before:0})===scope&&value.state.data).sort((a,b)=>b.state.dataUpdatedAt-a.state.dataUpdatedAt)[0]?.state.data as typeof query.data,[client,scope]);
 const saved=useRef<{scope:string;data:NonNullable<typeof query.data>}|null>(restored?{scope,data:restored}:null);
 if(query.data)saved.current={scope,data:query.data};
 const working=query.data||(saved.current?.scope===scope?saved.current.data:undefined);
 const rawLatest=working?.pages.at(-1),latest=rawLatest&&rawLatest.before!==request.before?{...rawLatest,stale:true}:rawLatest;
 const items=useMemo(()=>releaseFeedItems(working?.pages||[]).map(row=>({...releaseAnime(row),homeAvailabilityLabel:releaseTimingLabel(row)})),[working]);
 useEffect(()=>{const change=()=>setVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
 useEffect(()=>{
  if(!enabled||!visible||navigator.onLine===false||query.isFetching||query.isError||!latest?.buildCursor||latest.stale&&!latest.initialSnapshot||!query.hasNextPage||(query.data?.pages.length||0)>=9)return;
  const timer=setTimeout(()=>void query.fetchNextPage({cancelRefetch:false}),500);return()=>clearTimeout(timer);
 },[enabled,visible,latest,query.isFetching,query.isError,query.hasNextPage,query.data?.pages.length]);
 useEffect(()=>{
  if(!enabled||!visible||input.before)return;
  const boundary=latest?.nextBoundaryAt||Infinity,at=Math.min(boundary,request.before*1000+5*60000);
  const timer=setTimeout(()=>setAnchor(Math.floor(Date.now()/1000)),Math.max(1000,at-Date.now()+1000));return()=>clearTimeout(timer);
 },[enabled,visible,input.before,latest?.nextBoundaryAt,request.before]);
 useEffect(()=>{if(enabled&&visible&&!input.before&&Date.now()-anchor*1000>60000)setAnchor(Math.floor(Date.now()/1000));},[enabled,visible,input.before]);
 return{...query,data:working,isLoading:query.isLoading&&!items.length,isPending:query.isPending&&!items.length,items,before:request.before,latest,enabled,track:request.track,
  refresh:()=>input.before?void query.refetch():setAnchor(Math.floor(Date.now()/1000)),
  complete:latest?.complete===true,fetchedAt:latest?.fetchedAt||0,stale:latest?.stale===true};
}
