import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSchedule } from '../api/jikan';
import AnimeCard from '../components/AnimeCard';
import { Loader2, Calendar } from 'lucide-react';
import Seo from '../components/Seo';
import AdSenseAd from '../components/AdSenseAd';
import { isDesktopApp } from '../lib/desktop';

export default function Schedule() {
  const desktop = isDesktopApp();
  const [selectedDay, setSelectedDay] = useState(0); // 0 = today, 1 = tomorrow, etc.
  const localTimezone = useMemo(() => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time';
  }, []);
  
  const days = useMemo(() => {
    const d = [];
    for(let i=0; i<7; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        // start of day
        date.setHours(0,0,0,0);
        const start = Math.floor(date.getTime() / 1000);
        // end of day
        date.setHours(23,59,59,999);
        const end = Math.floor(date.getTime() / 1000);
        
        d.push({
            label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'long' }),
            date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            start,
            end
        });
    }
    return d;
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['schedule', days[selectedDay].start, days[selectedDay].end],
    queryFn: () => fetchSchedule(1, days[selectedDay].start, days[selectedDay].end),
    placeholderData: (previous) => previous,
  });
  const scheduleItems = data?.data || [];

  return (
    <div className="container mx-auto px-4 py-10 md:px-10">
      <Seo
        title="Anime Airing Schedule | StreamNyaa"
        description="Check the StreamNyaa anime airing schedule with local timezone episode times, title pages, and current anime discovery links."
        canonicalPath="/schedule"
      />
      <div className={`${desktop ? 'mb-8 rounded-3xl border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-6 shadow-2xl shadow-black/20' : 'mb-8'}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8 text-primary" />
            <div>
              <h1 className={`text-3xl font-black ${desktop ? 'text-white' : 'text-foreground'}`}>Airing Schedule</h1>
              <p className={`mt-1 text-sm ${desktop ? 'text-white/56' : 'text-muted-foreground'}`}>Times shown in your local timezone: {localTimezone}</p>
              <p className={`mt-1 text-xs ${desktop ? 'text-white/38' : 'text-muted-foreground'}`}>Last updated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</p>
            </div>
          </div>
          {desktop ? (
            <div className="flex flex-wrap gap-2 text-xs font-black text-white/60">
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">{scheduleItems.length} airing titles</span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">{days[selectedDay].label}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex overflow-x-auto pb-4 mb-8 gap-2 scrollbar-hide">
        {days.map((day, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedDay(idx)}
            className={`flex flex-col items-center min-w-[100px] px-4 py-3 rounded-xl transition-all whitespace-nowrap border ${
              selectedDay === idx 
                ? 'bg-primary border-primary text-primary-foreground' 
                : desktop
                  ? 'border-white/12 bg-white/[0.05] text-white/58 hover:border-white/24 hover:bg-white/[0.08] hover:text-white'
                  : 'bg-secondary/50 border-border hover:bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="font-bold text-sm">{day.label}</span>
            <span className={`text-xs mt-1 ${selectedDay === idx ? 'opacity-90' : 'opacity-60'}`}>{day.date}</span>
          </button>
        ))}
      </div>

      {!desktop ? <AdSenseAd /> : null}

      {isLoading ? (
        <div className="flex justify-center items-center py-32">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : scheduleItems.length === 0 ? (
        <div className="text-center py-32 bg-secondary/20 rounded-3xl border border-border">
          <p className="text-muted-foreground text-lg">No anime airing on this day.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {scheduleItems.map((schedule: any) => {
            const date = new Date(schedule.airingAt * 1000);
            const timeString = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
            
            return (
              <div key={schedule.scheduleId} className="relative flex flex-col group">
                <AnimeCard anime={schedule} />
                <div className="absolute top-2 left-2 z-10 bg-black/80 backdrop-blur-md text-white text-xs font-bold px-2 py-1 rounded-md border border-white/10 shadow-lg group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {timeString} - Ep {schedule.airingEpisode}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
