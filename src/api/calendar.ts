import { sharedPublicResponse } from '../lib/publicBrowserCache';
import { isPublicCalendar, type PublicCalendar } from '../lib/calendarModel';

export async function fetchPublicCalendar(start: number,end: number,cursor: string|undefined,signal?:AbortSignal):Promise<PublicCalendar>{
  const params=new URLSearchParams({provider:'calendar',start:String(start),end:String(end),ttl:'180',...(cursor?{cursor}:{})});
  const response=await sharedPublicResponse(`calendar:v1:${start}:${end}:${cursor||''}`,900_000,
    owned=>fetch(`/api/stream-sources?${params}`,{signal:owned}),signal,
    (value:any)=>isPublicCalendar(value)&&!value.stale
      &&Object.entries(value.providers||{}).every(([provider,state]:[string,any])=>state.fetchedAt+(provider==='anilist'?180_000:900_000)>Date.now()));
  const result=await response.json();
  if(!response.ok)throw Object.assign(new Error(result?.error||'The schedule could not refresh.'),{retryAt:result?.retryAt,provider:'calendar'});
  if(!isPublicCalendar(result))throw Error('The schedule response was incomplete.');
  return result;
}
