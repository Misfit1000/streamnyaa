import {calendarIdentityCoverage,isCalendarRecord,reconcileCalendarRecords,type CalendarRecord} from './calendarModel.js';
export const RELEASE_POLICY_VERSION=1;
export type ReleaseTrack='sub'|'dub';
export type RecentRelease=CalendarRecord&{releaseEpisode:number;releaseTrack:ReleaseTrack;releaseAt:number;originalAiringAt?:number;timingBasis:'confirmed-sub'|'estimated-sub'|'confirmed-dub';releasePolicyVersion:1};
export type RecentReleasePage={version:1;before:number;track:ReleaseTrack;data:RecentRelease[];page:number;nextCursor?:string;buildCursor?:string;snapshot?:string;complete:boolean;stale:boolean;fetchedAt:number;retryAt?:number;initialSnapshot?:boolean;nextBoundaryAt?:number};
const ms=(n:unknown)=>{const value=Number(n);return value>1e12?value:value*1000;};
function usable(row:CalendarRecord){
 const status=String(row.scheduleStatus).toLowerCase(),at=ms(row.airingAt),previous=ms(row.previousAiringAt);
 if(/cancel|suspend|hiatus|break/.test(status))return false;
 return at>0&&(!/delay|postpon/.test(status)||previous>0&&at>previous);
}
/** Timing evidence only; this never establishes that a torrent can play. */
export function recentReleaseCandidates(input:CalendarRecord[],before:number,track:ReleaseTrack='sub',allowEstimates=true){
 const rows=reconcileCalendarRecords([],input),{unresolved}=calendarIdentityCoverage(rows),groups=new Map<string,CalendarRecord[]>();
 for(const row of rows){if(unresolved.has(row))continue;const key=`${row.canonicalId}:${row.airingEpisode}`;groups.set(key,[...(groups.get(key)||[]),row]);}
 const broadcasts=new Map<string,number>();
 for(const row of rows)if(row.releaseTrack==='original'&&ms(row.airingAt)<=before*1000)broadcasts.set(row.canonicalId,Math.max(broadcasts.get(row.canonicalId)||0,row.airingEpisode));
 const eligible:RecentRelease[]=[],boundaries:number[]=[];
 for(const values of groups.values()){
  const original=values.find(row=>row.releaseTrack==='original'),selected=values.find(row=>row.releaseTrack===track);
  // An explicit blocked track cannot be replaced with an estimated time.
  if(selected&&!usable(selected)||!selected&&(!original||!usable(original)||track==='dub'||!allowEstimates))continue;
  const at=selected?ms(selected.airingAt):ms(original!.airingAt)+45*60_000;
  if(!Number.isFinite(at)||at<=0)continue;
  if(at>before*1000){boundaries.push(at);continue;}
  if(at<(before-7*86400)*1000)continue;
  const metadata=original||selected!;
  const row={...metadata,...selected,images:metadata.images||selected?.images,image:metadata.image||selected?.image,
   score:metadata.score??selected?.score,type:metadata.type||selected?.type,genres:metadata.genres||selected?.genres,isAdult:metadata.isAdult??selected?.isAdult,
   title:metadata.title||selected!.title,airingAt:original?.airingAt||selected!.airingAt,releaseTrack:track,releaseEpisode:metadata.airingEpisode,releaseAt:at,
   broadcastLatestEpisode:broadcasts.get(metadata.canonicalId),originalAiringAt:original?ms(original.airingAt):undefined,timingBasis:selected?track==='dub'?'confirmed-dub':'confirmed-sub':'estimated-sub',releasePolicyVersion:1} as RecentRelease;
  eligible.push(row);
 }
 eligible.sort((a,b)=>b.releaseAt-a.releaseAt||b.releaseEpisode-a.releaseEpisode||a.canonicalId.localeCompare(b.canonicalId));
 const titles=new Set<string>();
 return{data:eligible.filter(row=>{if(titles.has(row.canonicalId))return false;titles.add(row.canonicalId);return true;}),nextBoundaryAt:boundaries.length?Math.min(...boundaries):undefined};
}
export function releaseTimingLabel(value:any){return value?.timingBasis==='estimated-sub'?'Estimated Sub window':value?.timingBasis==='confirmed-dub'?'Dub time passed':value?.timingBasis==='confirmed-sub'?'Sub time passed':'';}
export function isRecentReleasePage(value:any):value is RecentReleasePage{
 return value?.version===1&&['sub','dub'].includes(value.track)&&Number.isSafeInteger(value.before)&&typeof value.complete==='boolean'&&typeof value.stale==='boolean'&&Number.isFinite(value.fetchedAt)&&Number.isSafeInteger(value.page)&&value.page>0
  &&Array.isArray(value.data)&&value.data.length<=24&&value.data.every((row:any)=>isCalendarRecord(row)&&/^(anilist|mal):[1-9]\d*$/.test(row.canonicalId)&&Number.isSafeInteger(row.releaseEpisode)&&Number(row.releaseEpisode)>0&&Number.isFinite(row.releaseAt)&&Number(row.releaseAt)<=value.before*1000&&row.releasePolicyVersion===1&&['confirmed-sub','estimated-sub','confirmed-dub'].includes(String(row.timingBasis)));
}
