import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Calendar, Loader2 } from 'lucide-react';
import { fetchPublicCalendar } from '../api/calendar';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import AdSenseAd from '../components/AdSenseAd';
import { useStore } from '../store/useStore';
import { airingAtMs, scheduleBroadcastState, scheduleDelayLabel, scheduleNextRelease, scheduleTrackLabel } from '../lib/schedulePresentation';
import { calendarIdentityCoverage, reconcileCalendarRecords, type CalendarRecord } from '../lib/calendarModel';
import { webScheduleSections } from '../lib/webSchedulePresentation';
import '../styles/web-calendar.css';

const dateLabel = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export default function Schedule() {
  const [selectedDay, setSelectedDay] = useState(0), [clock, setClock] = useState(Date.now());
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const nsfwMode = useStore(state => state.nsfwMode);
  const hideChinese = useStore(state => state.hideChineseAnime);
  useEffect(() => {
    const update = () => { setClock(Date.now()); setVisible(document.visibilityState !== 'hidden'); };
    const timer = setInterval(update, 60_000); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  const today = new Date(clock).toDateString();
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(clock); date.setDate(date.getDate() + index); date.setHours(0, 0, 0, 0);
    const start = date.getTime(); date.setDate(date.getDate() + 1);
    return { start, end: date.getTime(), label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : new Date(start).toLocaleDateString(undefined, { weekday: 'long' }), date: new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
  }), [today]);
  const start = days[0].start / 1000, end = days[6].end / 1000, active = days[selectedDay];
  const priority = useRef(active.start / 1000); priority.current = active.start / 1000;
  const query = useInfiniteQuery({
    queryKey: ['schedule-public', start, end], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchPublicCalendar(start, end, pageParam, signal, priority.current),
    getNextPageParam: (last, pages, lastParam, params) => last.cursor && last.cursor !== lastParam && !params.includes(last.cursor) ? last.cursor : undefined,
    staleTime: 180_000, retry: false, meta: { publicProvider: 'calendar', recover: (): void => { if (query.hasNextPage) void query.fetchNextPage({ cancelRefetch: false }); else void query.refetch({ cancelRefetch: false }); } },
  });
  const latest = query.data?.pages.at(-1);
  useEffect(() => {
    if (!visible || navigator.onLine === false || !query.hasNextPage || query.isFetching || query.isError || latest?.stale && !latest.initialSnapshot) return;
    const timer = setTimeout(() => void query.fetchNextPage({ cancelRefetch: false }), 500);
    return () => clearTimeout(timer);
  }, [visible, query.hasNextPage, query.isFetching, query.isError, latest]);
  const rows = useMemo(() => query.data?.pages.reduce((saved, page) => reconcileCalendarRecords(saved, page.data), [] as CalendarRecord[]) || [], [query.data]);
  const sections = webScheduleSections(rows, { weekStart: days[0].start, weekEnd: days[6].end, dayStart: active.start, dayEnd: active.end, today: selectedDay === 0, dayLabel: active.label, now: clock }, nsfwMode,hideChinese);
  const stale = Boolean(latest?.stale || query.isError), pending = calendarIdentityCoverage(rows).pendingCount;
  const retry = () => query.hasNextPage ? void query.fetchNextPage() : void query.refetch();
  return <div className="container mx-auto px-4 py-10 md:px-10">
    <Seo title="Anime Airing Schedule | StreamNyaa" description="Anime episode schedules, release tracks and confirmed schedule changes in your local timezone." canonicalPath="/schedule" />
    <div className="mb-8 flex items-center gap-3"><Calendar className="h-8 w-8 text-primary" /><div>
      <h1 className="text-3xl font-black">Airing Schedule</h1>
      <p className="mt-1 text-sm text-muted-foreground">Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local timezone'}</p>
      {latest && <p className="mt-1 text-xs text-muted-foreground">{stale ? 'Last reported information' : 'Last checked'} · {dateLabel(latest.fetchedAt)}</p>}
    </div></div>
    <div className="mb-8 flex gap-2 overflow-x-auto pb-4" role="tablist" aria-label="Schedule day">
      {days.map((day, index) => <button key={day.start} id={`web-calendar-day-${index}`} role="tab" aria-controls="web-calendar-results" aria-selected={selectedDay === index} tabIndex={selectedDay === index ? 0 : -1}
        onKeyDown={event => { const next = event.key === 'ArrowRight' ? (index + 1) % 7 : event.key === 'ArrowLeft' ? (index + 6) % 7 : event.key === 'Home' ? 0 : event.key === 'End' ? 6 : -1; if (next >= 0) { event.preventDefault(); setSelectedDay(next); document.getElementById(`web-calendar-day-${next}`)?.focus(); } }}
        onClick={() => setSelectedDay(index)} className={`flex min-w-[100px] flex-col items-center whitespace-nowrap rounded-xl border px-4 py-3 transition-colors ${selectedDay === index ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-secondary/50 text-muted-foreground hover:bg-secondary'}`}><span className="text-sm font-bold">{day.label}</span><span className="mt-1 text-xs opacity-60">{day.date}</span></button>)}
    </div><AdSenseAd />
    <div role="status" className="mb-4 text-sm text-muted-foreground">
      {query.isFetching && !query.isPending && <p>Updating release information… Existing cards remain available.</p>}
      {pending > 0 && <p>{pending} provider {pending === 1 ? 'listing is' : 'listings are'} awaiting verified title links. They are not shown as duplicate cards.</p>}
      {stale && <p className="text-amber-200">Some information could not refresh. Saved confirmed changes remain visible. <button className="min-h-9 underline" disabled={query.isFetching} onClick={retry}>Retry</button></p>}
    </div>
    {query.isPending ? <div className="flex justify-center py-24"><Loader2 className="h-10 w-10 animate-spin text-primary" aria-label="Loading schedule" /></div>
      : <div id="web-calendar-results" role="tabpanel" aria-labelledby={`web-calendar-day-${selectedDay}`}>
        {sections.map(section => <section key={section.title} className="mb-8">
          {sections.length > 1 || section.title === 'Schedule changes' ? <h2 className="mb-4 text-lg font-bold">{section.title}</h2> : null}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 md:gap-6 lg:grid-cols-5">
            {section.groups.map(({ key, anime, tracks }) => {
              const next = scheduleNextRelease(tracks, clock);
              return <article key={key} className="web-calendar-card min-w-0">
                <div className="relative"><AnimeCard anime={anime} delayLabel={scheduleDelayLabel(tracks)} />
                  <span className="pointer-events-none absolute left-2 top-2 z-20 max-w-[calc(100%-48px)] rounded-md border border-white/10 bg-black/85 px-2 py-1 text-[11px] font-bold text-white">{next ? new Date(next).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Awaiting new date'}</span>
                </div>
                <div className="web-calendar-tracks">{tracks.map(track => {
                  const status = scheduleBroadcastState(track), at = airingAtMs(track), previous = airingAtMs({ airingAt: track.previousAiringAt });
                  return <div key={track.scheduleId} className="web-calendar-track"><span className="web-calendar-track-label">{scheduleTrackLabel(track)}<span className="block opacity-70">Ep {track.airingEpisode}</span></span><div>
                    {status.prominent ? <><strong className={status.kind === 'delayed' ? 'text-primary' : 'text-amber-200'}>{status.label}</strong>{previous > 0 && <del className="block opacity-60">{dateLabel(previous)}</del>}<span className="block">{at ? dateLabel(at) : ['cancelled', 'suspended'].includes(status.kind) ? '' : 'Awaiting new date'}</span><details><summary>Details</summary><p>{String(track.scheduleReason || status.detail || '')}</p><p className="opacity-60">Last reported · {dateLabel(track.scheduleFetchedAt)}</p></details></>
                      : <time dateTime={at ? new Date(at).toISOString() : undefined}>{at ? dateLabel(at) : 'Time to be announced'}</time>}
                  </div></div>;
                })}</div>
              </article>;
            })}
          </div>
        </section>)}
        {!sections.length && <p className="rounded-2xl border border-border bg-secondary/20 px-6 py-16 text-center text-muted-foreground">{query.isError ? 'The schedule is temporarily unavailable.' : latest?.complete && !pending ? 'No confirmed releases on this day.' : 'Confirmed title information is still incomplete for this day.'}</p>}
        {query.hasNextPage && !query.isFetching && <button className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-bold" onClick={retry}>{stale ? 'Retry remaining updates' : 'Continue updating schedule'}</button>}
      </div>}
  </div>;
}
