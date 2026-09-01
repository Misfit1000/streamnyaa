import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarClock, CheckCheck, ChevronRight, Globe2, UserRound, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  desktopWatchedSeriesMatchesAnime,
  loadDesktopWatchedSeries,
  subscribeDesktopWatchProgress,
} from '../lib/desktop';
import {
  readDesktopScheduleReminders,
  subscribeDesktopScheduleReminders,
} from '../lib/desktopReminders';
import {
  loadDesktopScheduleUpdatePreferences,
  markDesktopScheduleUpdatesRead,
  readDesktopScheduleUpdates,
  subscribeDesktopScheduleUpdates,
  type DesktopScheduleUpdate,
} from '../lib/scheduleRevisions';
import { useStore } from '../store/useStore';

function formatUpdateTime(value: number) {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function updateMatchesLibrary(update: DesktopScheduleUpdate, myList: any[], watchedSeries: ReturnType<typeof loadDesktopWatchedSeries>) {
  const ids = new Set([update.animeId, update.anilistId, update.malId].filter(Boolean).map(String));
  const saved = myList.some((anime) => ids.has(String(anime?.mal_id || anime?.id || '')));
  if (saved) return true;
  return watchedSeries.some((record) => desktopWatchedSeriesMatchesAnime(record, {
    id: update.anilistId || update.animeId,
    anilist_id: update.anilistId,
    mal_id: update.malId,
    title: update.title,
  }));
}

export default function DesktopNotificationCenter() {
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [updates, setUpdates] = useState(() => readDesktopScheduleUpdates());
  const [preferences, setPreferences] = useState(() => loadDesktopScheduleUpdatePreferences());
  const [reminders, setReminders] = useState(() => readDesktopScheduleReminders());
  const [watchedSeries, setWatchedSeries] = useState(() => loadDesktopWatchedSeries());
  const myList = useStore((state) => state.myList);

  useEffect(() => subscribeDesktopScheduleUpdates(() => {
    setUpdates(readDesktopScheduleUpdates());
    setPreferences(loadDesktopScheduleUpdatePreferences());
  }), []);

  useEffect(() => subscribeDesktopScheduleReminders(() => setReminders(readDesktopScheduleReminders())), []);
  useEffect(() => subscribeDesktopWatchProgress(() => setWatchedSeries(loadDesktopWatchedSeries())), []);
  useEffect(() => setOpen(false), [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeFromOutside);
    window.addEventListener('keydown', closeFromKeyboard);
    return () => {
      document.removeEventListener('mousedown', closeFromOutside);
      window.removeEventListener('keydown', closeFromKeyboard);
    };
  }, [open]);

  const classifiedUpdates = useMemo(() => updates.map((update) => ({
    update,
    personal: updateMatchesLibrary(update, myList, watchedSeries),
  })), [myList, updates, watchedSeries]);
  const visibleUpdates = useMemo(() => classifiedUpdates.filter(({ personal }) => (
    personal ? preferences.personal : preferences.global
  )), [classifiedUpdates, preferences.global, preferences.personal]);
  const unreadCount = visibleUpdates.filter(({ update }) => update.detectedAt > preferences.lastReadAt).length;
  const upcomingReminders = useMemo(() => reminders
    .filter((reminder) => !reminder.firedAt && reminder.airingAt > Date.now())
    .sort((left, right) => left.airingAt - right.airingAt)
    .slice(0, 3), [reminders]);

  const toggleOpen = () => {
    setOpen((current) => {
      const next = !current;
      if (next && unreadCount) {
        const saved = markDesktopScheduleUpdatesRead();
        setPreferences(saved);
      }
      return next;
    });
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        title="Notifications"
        className="sn-icon-action relative h-10 w-10 rounded-full"
        onClick={toggleOpen}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          className="absolute right-0 top-12 z-50 w-[390px] overflow-hidden rounded-xl border border-white/[0.09] bg-[#101014] shadow-sm"
          role="dialog"
          aria-label="Notifications"
        >
          <header className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-white">Updates</h2>
              <p className="mt-0.5 text-xs text-white/48">Delays, cancellations, and airing reminders</p>
            </div>
            <div className="flex items-center gap-1">
              <CheckCheck className="h-4 w-4 text-emerald-300" aria-label="Updates read" />
              <button type="button" onClick={() => setOpen(false)} className="sn-icon-action h-9 w-9" aria-label="Close notifications">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="custom-scrollbar max-h-[min(68vh,560px)] overflow-y-auto p-3">
            <div className="flex items-center justify-between gap-3 px-1 pb-2">
              <h3 className="text-sm font-semibold text-white/82">Airing alerts</h3>
              <Link to="/desktop-settings#updates" className="text-xs font-semibold text-primary hover:text-primary/80">Manage</Link>
            </div>
            {visibleUpdates.length ? (
              <div className="space-y-1.5">
                {visibleUpdates.slice(0, 6).map(({ update, personal }) => (
                  <Link
                    key={update.id}
                    to="/schedule"
                    className="flex gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${personal ? 'bg-primary/14 text-primary' : 'bg-white/[0.07] text-white/62'}`}>
                      {personal ? <UserRound className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white">{update.title}</span>
                        <span className="shrink-0 text-[10px] font-semibold text-white/38">{personal ? 'Personal' : 'Global'}</span>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-white/54">
                        Episode {update.episode} {update.kind === 'cancelled' ? 'was cancelled' : `was delayed to ${formatUpdateTime(update.airingAt)}`}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-white/[0.035] px-3 py-4 text-sm text-white/48">No delay or cancellation alerts.</p>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.07] px-1 pb-2 pt-4">
              <h3 className="text-sm font-semibold text-white/82">Upcoming reminders</h3>
              <Link to="/schedule" className="text-xs font-semibold text-primary hover:text-primary/80">Calendar</Link>
            </div>
            {upcomingReminders.length ? (
              <div className="space-y-1.5">
                {upcomingReminders.map((reminder) => (
                  <Link key={reminder.id} to="/schedule" className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-white/[0.055]">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/14 text-primary">
                      <CalendarClock className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{reminder.title}</span>
                      <span className="mt-0.5 block text-xs text-white/48">Episode {reminder.episode || 'TBA'} · {formatUpdateTime(reminder.airingAt)}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/28" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-white/[0.035] px-3 py-4 text-sm text-white/48">No upcoming reminders.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
