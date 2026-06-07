import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarDays, Heart, Loader2 } from 'lucide-react';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import { fetchSchedule } from '../api/jikan';
import { animeIdentity } from '../lib/animeIdentity';
import { useStore } from '../store/useStore';

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
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(() => new Set());
  const { isInMyList, addToMyList, removeFromMyList } = useStore();
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
  const visibleItems = useMemo(
    () => (favoritesOnly ? items.filter((anime: any) => isInMyList(animeIdentity(anime))) : items),
    [favoritesOnly, isInMyList, items],
  );
  const groupedItems = useMemo(() => {
    if (!visibleItems.length) return [];
    if (selectedDay !== 0) return [{ title: active.label, items: visibleItems }];
    const now = Date.now();
    const upcoming = visibleItems.filter((anime: any) => Number(anime.airingAt || 0) * 1000 > now);
    const aired = visibleItems.filter((anime: any) => Number(anime.airingAt || 0) * 1000 <= now);
    return [
      { title: 'Airing Soon', items: upcoming },
      { title: 'Already Aired', items: aired },
    ].filter((group) => group.items.length);
  }, [active.label, selectedDay, visibleItems]);

  const toggleScheduleList = (anime: any) => {
    const id = animeIdentity(anime);
    if (isInMyList(id)) removeFromMyList(id);
    else addToMyList(anime);
  };

  const toggleNotification = (anime: any) => {
    const id = `${animeIdentity(anime)}:${anime?.airingEpisode || ''}`;
    setNotifiedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="px-6 py-6">
      <Seo title="Airing Schedule | StreamNyaa Desktop" description="Desktop anime schedule." canonicalPath="/schedule" robots="noindex, nofollow" />

      <section className="desktop-premium-surface overflow-hidden rounded-2xl p-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.055] text-primary shadow-lg shadow-black/18">
              <CalendarDays className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Calendar</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-white">Airing schedule</h1>
              <p className="mt-1 text-sm text-white/56">Times are shown in {timezone}.</p>
            </div>
          </div>
          <div className="flex gap-2 text-xs font-black text-white/58">
            <button
              type="button"
              onClick={() => setFavoritesOnly((value) => !value)}
              className={`rounded-full border px-3 py-1.5 transition-colors ${
                favoritesOnly
                  ? 'border-transparent bg-primary text-white shadow-lg shadow-primary/12'
                  : 'border-white/10 bg-white/[0.05] text-white/58 hover:border-white/18 hover:text-white'
              }`}
            >
              Favorites only
            </button>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">{items.length} titles</span>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">{active.label}</span>
          </div>
        </div>
      </section>

      <div className="mt-6 flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
        {days.map((day, index) => (
          <button
            key={day.start}
            type="button"
            onClick={() => setSelectedDay(index)}
            className={`min-w-[120px] rounded-xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5 ${
              selectedDay === index
                ? 'border-transparent bg-primary text-white shadow-lg shadow-primary/12'
                : 'border-white/10 bg-white/[0.045] text-white/62 hover:border-white/18 hover:bg-white/[0.07] hover:text-white'
            }`}
          >
            <span className="block text-sm font-black">{day.label}</span>
            <span className="mt-1 block text-xs opacity-72">{day.date}</span>
            {index === 0 ? <span className="mt-2 inline-flex rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]">Today</span> : null}
          </button>
        ))}
      </div>

      <section className="mt-7">
        {scheduleQuery.isLoading ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center text-sm font-black text-white/58">
              <Loader2 className="mr-3 h-5 w-5 animate-spin text-primary" />
              Loading airing schedule...
            </div>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="aspect-[2/3] animate-pulse rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))]" />
              ))}
            </div>
          </div>
        ) : groupedItems.length ? (
          <div className="space-y-8">
            {groupedItems.map((group) => (
              <div key={group.title}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">{group.title}</h2>
                  <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-black text-white/42">{group.items.length} titles</span>
                </div>
                <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
                  {group.items.map((anime: any) => {
                    const date = new Date(anime.airingAt * 1000);
                    const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                    const inList = isInMyList(animeIdentity(anime));
                    const notified = notifiedIds.has(`${animeIdentity(anime)}:${anime.airingEpisode || ''}`);
                    return (
                      <div key={anime.scheduleId || `${anime.mal_id}-${anime.airingEpisode}`} className="relative">
                        <AnimeCard anime={anime} />
                        <div className="absolute right-2 top-2 z-30 flex gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleScheduleList(anime);
                            }}
                            className={`grid h-8 w-8 place-items-center rounded-lg border backdrop-blur transition-colors ${
                              inList
                                ? 'border-primary/35 bg-primary/22 text-primary'
                                : 'border-white/10 bg-black/60 text-white/70 hover:bg-white/12 hover:text-white'
                            }`}
                            aria-label={inList ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <Heart className={`h-4 w-4 ${inList ? 'fill-current' : ''}`} />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleNotification(anime);
                            }}
                            className={`grid h-8 w-8 place-items-center rounded-lg border backdrop-blur transition-colors ${
                              notified
                                ? 'border-amber-300/35 bg-amber-300/18 text-amber-300'
                                : 'border-white/10 bg-black/60 text-white/70 hover:bg-white/12 hover:text-white'
                            }`}
                            aria-label={notified ? 'Remove airing reminder' : 'Mark for airing reminder'}
                          >
                            <Bell className={`h-4 w-4 ${notified ? 'fill-current' : ''}`} />
                          </button>
                        </div>
                        <div className="absolute left-2 top-2 z-20 rounded-lg border border-white/10 bg-black/72 px-2 py-1 text-[11px] font-black text-white backdrop-blur">
                          {time} - Ep {anime.airingEpisode}
                        </div>
                        <div className="absolute bottom-2 right-2 z-20 rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/72 backdrop-blur">
                          {date.getTime() > Date.now() ? 'Airing soon' : 'Aired'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.06] bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025)_52%,rgba(244,63,94,0.045))] px-6 py-16 text-center shadow-xl shadow-black/18">
            <p className="text-lg font-black text-white">No episodes scheduled for this day.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Check another day or view upcoming releases from Explore.</p>
          </div>
        )}
      </section>
    </div>
  );
}
