import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Loader2 } from 'lucide-react';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import { fetchSchedule } from '../api/jikan';

function scheduleDays() {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    date.setHours(0, 0, 0, 0);
    const start = Math.floor(date.getTime() / 1000);
    date.setHours(23, 59, 59, 999);
    const end = Math.floor(date.getTime() / 1000);
    return {
      start,
      end,
      label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'long' }),
      date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    };
  });
}

export default function DesktopSchedule() {
  const [selectedDay, setSelectedDay] = useState(0);
  const days = useMemo(scheduleDays, []);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time', []);
  const active = days[selectedDay];
  const scheduleQuery = useQuery({
    queryKey: ['desktop-schedule', active.start, active.end],
    queryFn: () => fetchSchedule(1, active.start, active.end),
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });
  const items = scheduleQuery.data?.data || [];

  return (
    <div className="px-6 py-6">
      <Seo title="Airing Schedule | StreamNyaa Desktop" description="Desktop anime schedule." canonicalPath="/schedule" robots="noindex, nofollow" />

      <section className="rounded-lg border border-white/8 bg-[linear-gradient(135deg,rgba(225,29,72,0.13),rgba(255,255,255,0.035)_44%,rgba(0,0,0,0.16))] p-6 shadow-2xl shadow-black/25">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-primary/30 bg-primary/12 text-primary">
              <CalendarDays className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Calendar</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-white">Airing schedule</h1>
              <p className="mt-1 text-sm text-white/56">Times are shown in {timezone}.</p>
            </div>
          </div>
          <div className="flex gap-2 text-xs font-black text-white/58">
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">{items.length} titles</span>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">{active.label}</span>
          </div>
        </div>
      </section>

      <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
        {days.map((day, index) => (
          <button
            key={day.start}
            type="button"
            onClick={() => setSelectedDay(index)}
            className={`min-w-[120px] rounded-xl border px-4 py-3 text-left transition-colors ${
              selectedDay === index
                ? 'border-primary bg-primary text-white'
                : 'border-white/10 bg-white/[0.045] text-white/62 hover:border-primary/50 hover:text-white'
            }`}
          >
            <span className="block text-sm font-black">{day.label}</span>
            <span className="mt-1 block text-xs opacity-72">{day.date}</span>
          </button>
        ))}
      </div>

      <section className="mt-7">
        {scheduleQuery.isLoading ? (
          <div className="flex items-center justify-center rounded-3xl border border-white/8 bg-white/[0.04] py-20 text-white/60">
            <Loader2 className="mr-3 h-6 w-6 animate-spin text-primary" />
            Loading schedule...
          </div>
        ) : items.length ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
            {items.map((anime: any) => {
              const date = new Date(anime.airingAt * 1000);
              const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={anime.scheduleId || `${anime.mal_id}-${anime.airingEpisode}`} className="relative">
                  <AnimeCard anime={anime} />
                  <div className="absolute left-2 top-2 z-20 rounded bg-black/78 px-2 py-1 text-[11px] font-black text-white backdrop-blur">
                    {time} - Ep {anime.airingEpisode}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/8 bg-white/[0.04] px-6 py-16 text-center text-white/56">
            No airing anime found for this day.
          </div>
        )}
      </section>
    </div>
  );
}
