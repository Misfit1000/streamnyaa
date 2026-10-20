import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Calendar, Loader2 } from 'lucide-react';
import { fetchPublicCalendar } from '../api/calendar';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import AdSenseAd from '../components/AdSenseAd';
import { useStore } from '../store/useStore';
import { airingAtMs, groupScheduleEpisodes, scheduleBroadcastState, scheduleDelayLabel, scheduleNextRelease, scheduleSections, scheduleTrackLabel } from '../lib/schedulePresentation';
import { reconcileCalendarRecords } from '../lib/calendarModel';
import '../styles/web-calendar.css';

const dateLabel=(ms:number)=>new Date(ms).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
export default function Schedule(){
  const [selectedDay,setSelectedDay]=useState(0),[clock,setClock]=useState(Date.now());
  const nsfwMode=useStore(state=>state.nsfwMode);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),60_000);return()=>clearInterval(timer);},[]);
  const today=new Date(clock).toDateString();
  const days=useMemo(()=>Array.from({length:7},(_,index)=>{const date=new Date(clock);date.setDate(date.getDate()+index);date.setHours(0,0,0,0);const start=date.getTime();date.setDate(date.getDate()+1);return{start,end:date.getTime(),label:index===0?'Today':index===1?'Tomorrow':new Date(start).toLocaleDateString(undefined,{weekday:'long'}),date:new Date(start).toLocaleDateString(undefined,{month:'short',day:'numeric'})};}),[today]);
  const start=days[0].start/1000,end=days[6].end/1000,active=days[selectedDay];
  const query=useInfiniteQuery({queryKey:['schedule-public',start,end],initialPageParam:undefined as string|undefined,
    queryFn:({pageParam,signal})=>fetchPublicCalendar(start,end,pageParam,signal),getNextPageParam:last=>last.cursor,
    staleTime:180_000,retry:false,meta:{publicProvider:'calendar'}});
  // Bound the initial foreground pass; remaining discovery is explicit.
  useEffect(()=>{if(query.hasNextPage&&!query.isFetching&&query.data.pages.length<2)void query.fetchNextPage();},[query.data,query.hasNextPage,query.isFetching]);
  const rows=useMemo(()=>query.data?.pages.reduce((saved,page)=>reconcileCalendarRecords(saved,page.data),[] as any[])||[],[query.data]);
  const sections=scheduleSections(rows,{weekStart:days[0].start,weekEnd:days[6].end,dayStart:active.start,dayEnd:active.end,today:selectedDay===0,dayLabel:active.label,now:clock},row=>nsfwMode||!row.isAdult);
  const latest=query.data?.pages.at(-1),stale=Boolean(latest?.stale||query.isError);
  return <div className="container mx-auto px-4 py-10 md:px-10">
    <Seo title="Anime Airing Schedule | StreamNyaa" description="Anime episode schedules, release tracks and confirmed schedule changes in your local timezone." canonicalPath="/schedule"/>
    <div className="mb-8 flex items-center gap-3"><Calendar className="h-8 w-8 text-primary"/><div><h1 className="text-3xl font-black">Airing Schedule</h1>
      <p className="mt-1 text-sm text-muted-foreground">Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local timezone'}</p>
      {latest&&<p className="mt-1 text-xs text-muted-foreground">{stale?'Last reported information':'Last checked'} · {dateLabel(latest.fetchedAt)}</p>}</div></div>
    <div className="mb-8 flex gap-2 overflow-x-auto pb-4" role="tablist" aria-label="Schedule day">
      {days.map((day,index)=><button key={day.start} id={`web-calendar-day-${index}`} role="tab" aria-controls="web-calendar-results" aria-selected={selectedDay===index} tabIndex={selectedDay===index?0:-1}
        onKeyDown={event=>{const next=event.key==='ArrowRight'?(index+1)%7:event.key==='ArrowLeft'?(index+6)%7:event.key==='Home'?0:event.key==='End'?6:-1;if(next>=0){event.preventDefault();setSelectedDay(next);document.getElementById(`web-calendar-day-${next}`)?.focus();}}}
        onClick={()=>setSelectedDay(index)} className={`flex min-w-[100px] flex-col items-center whitespace-nowrap rounded-xl border px-4 py-3 transition-colors ${selectedDay===index?'border-primary bg-primary text-primary-foreground':'border-border bg-secondary/50 text-muted-foreground hover:bg-secondary'}`}><span className="text-sm font-bold">{day.label}</span><span className="mt-1 text-xs opacity-60">{day.date}</span></button>)}
    </div><AdSenseAd/>
    {stale&&<p role="status" className="mb-4 text-sm text-amber-200">Some schedule information could not refresh. Saved confirmed changes remain visible. <button className="underline" disabled={query.isFetching} onClick={()=>void query.refetch()}>Retry</button></p>}
    {query.isPending?<div className="flex justify-center py-24"><Loader2 className="h-10 w-10 animate-spin text-primary" aria-label="Loading schedule"/></div>
      :<div id="web-calendar-results" role="tabpanel" aria-labelledby={`web-calendar-day-${selectedDay}`}>
      {sections.map(section=><section key={section.title} className="mb-8">{sections.length>1||section.title==='Schedule changes'?<h2 className="mb-4 text-lg font-bold">{section.title}</h2>:null}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 md:gap-6 lg:grid-cols-5">{groupScheduleEpisodes(section.items).map(({key,anime,tracks})=>{
          const next=scheduleNextRelease(tracks,clock), unresolved=!anime.mal_id;
          return <article key={key} className="web-calendar-card min-w-0"><div className="relative"><AnimeCard anime={anime} delayLabel={scheduleDelayLabel(tracks)} destination={unresolved?`/search?q=${encodeURIComponent(anime.title)}`:undefined}/>
            <span className="pointer-events-none absolute left-2 top-2 z-20 max-w-[calc(100%-48px)] rounded-md border border-white/10 bg-black/85 px-2 py-1 text-[11px] font-bold text-white">{next?new Date(next).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}):'Awaiting new date'} · Ep {anime.airingEpisode}</span></div>
            <div className="web-calendar-tracks">{tracks.map(track=>{const status=scheduleBroadcastState(track),at=airingAtMs(track),previous=airingAtMs({airingAt:track.previousAiringAt});return <div key={track.scheduleId||track.releaseTrack} className="web-calendar-track"><span className="web-calendar-track-label">{scheduleTrackLabel(track)}</span><div>
              {status.prominent?<><strong className={status.kind==='delayed'?'text-primary':'text-amber-200'}>{status.label}</strong>{previous>0&&<del className="block opacity-60">{dateLabel(previous)}</del>}<span className="block">{at?dateLabel(at):['cancelled','suspended'].includes(status.kind)?'': 'Awaiting new date'}</span><details><summary>Details</summary><p>{track.scheduleReason||status.detail}</p><p className="opacity-60">{stale?'Last reported':'Last checked'} · {dateLabel(Number(track.scheduleFetchedAt)||latest!.fetchedAt)}</p></details></>:<time dateTime={at?new Date(at).toISOString():undefined}>{at?dateLabel(at):'Time to be announced'}</time>}
            </div></div>;})}{unresolved&&<p className="text-[10px] text-muted-foreground">Provider listing · title page not yet linked</p>}</div>
          </article>;})}</div></section>)}
      {!sections.length&&<p className="rounded-2xl border border-border bg-secondary/20 px-6 py-16 text-center text-muted-foreground">{query.isError?'The schedule is temporarily unavailable.':latest?.complete?'No confirmed releases on this day.':'No releases loaded for this day yet. More schedule information may remain.'}</p>}
      {query.hasNextPage&&<button className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-bold" disabled={query.isFetching} onClick={()=>void query.fetchNextPage()}>{query.isFetching?'Loading…':'Load remaining schedule information'}</button>}
    </div>}
  </div>;
}
