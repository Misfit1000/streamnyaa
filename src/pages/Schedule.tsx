import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSchedule } from '../api/jikan';
import AnimeCard from '../components/AnimeCard';
import { Loader2, Calendar } from 'lucide-react';

export default function Schedule() {
  const [selectedDay, setSelectedDay] = useState(0); // 0 = today, 1 = tomorrow, etc.
  
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
  });

  return (
    <div className="container mx-auto px-4 md:px-10 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Calendar className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-black text-foreground">Airing Schedule</h1>
      </div>

      <div className="flex overflow-x-auto pb-4 mb-8 gap-2 scrollbar-hide">
        {days.map((day, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedDay(idx)}
            className={`flex flex-col items-center min-w-[100px] px-4 py-3 rounded-xl transition-all whitespace-nowrap border ${
              selectedDay === idx 
                ? 'bg-primary border-primary text-primary-foreground' 
                : 'bg-secondary/50 border-border hover:bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="font-bold text-sm">{day.label}</span>
            <span className={`text-xs mt-1 ${selectedDay === idx ? 'opacity-90' : 'opacity-60'}`}>{day.date}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-32">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : data?.data?.length === 0 ? (
        <div className="text-center py-32 bg-secondary/20 rounded-3xl border border-border">
          <p className="text-muted-foreground text-lg">No anime airing on this day.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {data?.data.map((schedule: any) => {
            const date = new Date(schedule.airingAt * 1000);
            const timeString = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            
            return (
              <div key={schedule.scheduleId} className="relative flex flex-col group">
                <AnimeCard anime={schedule} />
                <div className="absolute top-2 left-2 z-10 bg-black/80 backdrop-blur-md text-white text-xs font-bold px-2 py-1 rounded-md border border-white/10 shadow-lg group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {timeString} • Ep {schedule.airingEpisode}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
