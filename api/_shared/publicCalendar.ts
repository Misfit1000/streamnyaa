import { isCalendarRecord, normalizeScheduleTrack, reconcileCalendarRecords, type CalendarRecord, type PublicCalendar } from '../../src/lib/calendarModel.js';
import { publicSnapshot, readPublicSnapshot, readPublicSnapshots } from './publicSnapshots.js';
import { supabaseRest } from './adminAuth.js';
import type { RequestUsage } from './requestReuse.js';

function isoWeek(ms: number) {
  const date = new Date(ms); date.setUTCHours(0,0,0,0); date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));
  const year = date.getUTCFullYear(), first = new Date(Date.UTC(year,0,1));
  return { year, week: Math.ceil(((date.getTime()-first.getTime())/86400_000+1)/7) };
}
const airingQuery = `query Calendar($start:Int!,$end:Int!,$page:Int!){Page(page:$page,perPage:50){pageInfo{hasNextPage} airingSchedules(airingAt_greater:$start,airingAt_lesser:$end,sort:TIME){id episode airingAt media{id idMal title{romaji english native} episodes format status isAdult averageScore coverImage{extraLarge large} bannerImage genres}}}}`;
async function json(url: string, init: RequestInit, usage: RequestUsage, deadline: number) {
  if (Date.now() >= deadline) throw Error('Calendar pass budget reached.');
  const response = await usage.fetch(url,{...init,signal:AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-Date.now())))});
  if (!response.ok) { const header=response.headers.get('retry-after')||'',numeric=Number(header),retryAt=/^\d+$/.test(header)?Date.now()+numeric*1000:Date.parse(header)||0;
    throw Object.assign(new Error(`Calendar provider temporarily unavailable (${response.status}).`), {status:response.status,retryAt:Math.max(Date.now()+30000,retryAt)}); }
  const value = await response.json(); if (value?.errors?.length) throw Error('Calendar provider could not verify the schedule.'); return value;
}
export async function publicCalendar(req: any, usage: RequestUsage): Promise<PublicCalendar> {
  const deadline=Date.now()+18_000;
  const start=Number(req.query.start), end=Number(req.query.end);
  if (!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<=0||end<=start||end-start>8*86400||Math.abs(start-Date.now()/1000)>14*86400) throw Object.assign(Error('Calendar requires a current window of at most eight days.'),{status:400});
  const [rawPage='1',rawRoute='0']=String(req.query.cursor||'1:0').split(':');
  const page=Number(rawPage), offset=Number(rawRoute);
  if (!Number.isSafeInteger(page)||page<0||page>40||!Number.isSafeInteger(offset)||offset<0||offset>1500) throw Object.assign(Error('Invalid Calendar cursor.'),{status:400});
  const from=Math.floor(start/86400)*86400, until=Math.ceil(end/86400)*86400;
  const providers:PublicCalendar['providers']={}, incoming:CalendarRecord[]=[];
  let nextPage=0,nextOffset=offset,retryAt=0,persistenceError:string|undefined;
  if(page){
    try{
      const schedule=await publicSnapshot<any>(`calendar-anilist:${from}:${until}:${page}`,180,()=>json('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:airingQuery,variables:{start:from-1,end:until,page}})},usage,deadline),value=>Array.isArray(value?.data?.Page?.airingSchedules)&&typeof value?.data?.Page?.pageInfo?.hasNextPage==='boolean');
      const data=schedule.value?.data?.Page;if(!Array.isArray(data?.airingSchedules)||typeof data?.pageInfo?.hasNextPage!=='boolean')throw Error('Incomplete episode schedule.');
      providers.anilist={fetchedAt:schedule.fetchedAt,stale:schedule.stale};persistenceError ||= schedule.persistenceError;
      for(const item of data.airingSchedules){const media=item.media;if(!Number.isSafeInteger(media?.id)||media.id<=0||!Number.isSafeInteger(item.episode)||item.episode<=0)continue;
        const image=media.coverImage?.extraLarge||media.coverImage?.large;
        incoming.push({anilist_id:media.id,mal_id:media.idMal||undefined,canonicalId:`anilist:${media.id}`,title:media.title?.english||media.title?.romaji||'Anime',image,
          images:{jpg:{large_image_url:image},webp:{large_image_url:image}},banner_image:media.bannerImage,score:media.averageScore?media.averageScore/10:null,type:media.format,genres:media.genres,
          isAdult:Boolean(media.isAdult),airingEpisode:item.episode,airingAt:item.airingAt,releaseTrack:'original',scheduleStatus:'scheduled',scheduleFetchedAt:schedule.fetchedAt,scheduleProvider:'anilist',scheduleId:`anilist:${media.id}:episode-${item.episode}:original`});}
      nextPage=data.pageInfo.hasNextPage?page+1:0;
    }catch(error){retryAt=Math.max(retryAt,(error as any).retryAt||0);providers.anilist={fetchedAt:0,stale:true,error:(error as Error).message};}
  }
  const key=`calendar-records:${from}:${until}`, prior=await readPublicSnapshot<CalendarRecord[]>(key);
  if(prior)prior.value=Array.isArray(prior.value)?prior.value.filter(isCalendarRecord):[];
  const token=process.env.ANIMESCHEDULE_TOKEN||process.env.ANIMESCHEDULE_API_TOKEN;
  let routesRemain=false;
  if(token){
    try{
      const weeks=[isoWeek(start*1000),isoWeek((end-1)*1000)].filter((week,index,all)=>all.findIndex(other=>other.year===week.year&&other.week===week.week)===index);
      const feed:any[]=[];let fetchedAt=Date.now(),stale=false;
      const fetchSchedule=(path:string)=>json(`https://animeschedule.net/api/v3${path}`,{headers:{Accept:'application/json',Authorization:`Bearer ${token}`}},usage,deadline);
      for(const week of weeks){const snapshot=await publicSnapshot<any[]>(`animeschedule:timetables:${week.year}:${week.week}`,900,()=>fetchSchedule(`/timetables/all?year=${week.year}&week=${week.week}&tz=UTC`),Array.isArray);feed.push(...snapshot.value.slice(0,1500));fetchedAt=Math.min(fetchedAt,snapshot.fetchedAt);stale ||= snapshot.stale;persistenceError ||= snapshot.persistenceError;}
      providers.animeschedule={fetchedAt,stale};
      const relevantFeed=feed.filter(row=>{const normalized=normalizeScheduleTrack(row,row,fetchedAt);return normalized&&(normalized.airingAt>=start&&normalized.airingAt<end||Number(normalized.previousAiringAt)>=start*1000&&Number(normalized.previousAiringAt)<end*1000);});
      const routes=[...new Set(relevantFeed.sort((a,b)=>Number(/delayed|break|postpon/i.test(b.airingStatus||''))-Number(/delayed|break|postpon/i.test(a.airingStatus||''))).map(row=>String(row.route||'')).filter(route=>/^[a-z0-9-]{1,240}$/.test(route)))];
      const details=new Map<string,any>();
      const cached=await readPublicSnapshots<any>(routes.map(route=>`animeschedule:anime:${route}`));
      for(const route of routes){const detail=cached.get(`animeschedule:anime:${route}`);if(detail&&detail.fetchedAt+86400_000>Date.now()&&detail.value?.route===route)details.set(route,detail.value);}
      nextOffset=offset;
      // First paint uses the real schedule and shared identity snapshots. New
      // identity discovery belongs to bounded continuation, not that paint.
      for(const route of routes.slice(offset,offset+(req.query.cursor?6:0))){
        if (Date.now()>deadline-5000) break;
        try{if(!details.has(route)){const detail=await publicSnapshot<any>(`animeschedule:anime:${route}`,86400,()=>fetchSchedule(`/anime/${route}`),value=>value&&typeof value==='object'&&!Array.isArray(value)&&value.route===route);if(!detail.stale)details.set(route,detail.value);}}catch(error){if([403,429].includes((error as any).status))throw error;/* Unresolved identities stay provider-qualified. */}
        nextOffset++;
      }
      nextOffset=Math.min(routes.length,nextOffset);routesRemain=nextOffset<routes.length;
      for(const row of relevantFeed){const saved=prior?.value?.find(old=>old.sourceRoute===row.route);const detail=details.get(row.route)||row;
        const normalized=normalizeScheduleTrack(row,detail,fetchedAt);if(!normalized)continue;
        if(!normalized.anilist_id&&!normalized.mal_id&&saved&&(saved.anilist_id||saved.mal_id)){
          normalized.anilist_id=saved.anilist_id;normalized.mal_id=saved.mal_id;normalized.canonicalId=saved.canonicalId;normalized.scheduleId=`${saved.canonicalId}:episode-${normalized.airingEpisode}:${normalized.releaseTrack}`;
        }
        incoming.push(normalized);
      }
    }catch(error){retryAt=Math.max(retryAt,(error as any).retryAt||0);providers.animeschedule={fetchedAt:0,stale:true,error:(error as Error).message};}
  }else providers.animeschedule={fetchedAt:0,stale:true,error:'Release-track updates are not configured.'};
  if(!incoming.length&&!prior?.value?.length)throw Object.assign(Error('The airing schedule is temporarily unavailable.'),{status:503,retryAt:Date.now()+30000});
  let records=reconcileCalendarRecords(prior?.value||[],incoming);
  if(incoming.length){try{const merged=await supabaseRest('rpc/merge_calendar_snapshot',{method:'POST',signal:AbortSignal.timeout(4000),body:JSON.stringify({p_key:key,p_rows:records})});if(Array.isArray(merged))records=reconcileCalendarRecords([],merged.filter(isCalendarRecord));}catch{persistenceError='Shared Calendar persistence is temporarily unavailable.';}}
  const times=Object.values(providers).map(p=>p.fetchedAt).filter(Boolean),stale=Object.values(providers).some(p=>p.stale);
  return {version:1,data:records,providers,fetchedAt:times.length?Math.min(...times):prior?.fetchedAt||Date.now(),stale,complete:!nextPage&&!routesRemain&&!stale,
    ...((nextPage||routesRemain)?{cursor:`${nextPage}:${nextOffset}`} : {}),...(persistenceError?{persistenceError}:{}),...(stale?{retryAt:Math.max(Date.now()+60000,retryAt)}:{})};
}
