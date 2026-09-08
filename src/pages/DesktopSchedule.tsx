import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bell, CalendarDays, ChevronRight, Heart, History, Loader2, TriangleAlert } from 'lucide-react';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import DesktopLoadingProgress from '../components/DesktopLoadingProgress';
import { desktopWeekQuery } from '../lib/desktopScheduleQuery';
import { animeIdentity } from '../lib/animeIdentity';
import { desktopWatchOrBrowsePath } from '../lib/desktopAnimeRoute';
import {
  desktopWatchedSeriesMatchesAnime,
  loadDesktopWatchedSeries,
  subscribeDesktopWatchProgress,
} from '../lib/desktop';
import {
  DESKTOP_REMINDER_OFFSET_MINUTES as DEFAULT_REMINDER_OFFSET_MINUTES,
  type DesktopNotificationPermission as ScheduleNotificationPermission,
  type DesktopScheduleReminder as ScheduleReminder,
  getDesktopNotificationPermission as getScheduleNotificationPermission,
  readDesktopScheduleReminders as readScheduleReminders,
  requestDesktopNotificationPermission as requestReminderPermission,
  sendDesktopReminderTest as showTestSystemNotification,
  subscribeDesktopScheduleReminders,
  writeDesktopScheduleReminders as writeScheduleReminders,
} from '../lib/desktopReminders';
import { useStore } from '../store/useStore';
import { readDesktopScheduleUpdates, subscribeDesktopScheduleUpdates } from '../lib/scheduleRevisions';
import {
  desktopScheduleCacheKey,
  readDesktopSchedule,
  writeDesktopSchedule,
} from '../lib/desktopScheduleCache';

type ScheduleNotice = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

type ScheduleBroadcastState = {
  kind: 'normal' | 'delayed' | 'cancelled' | 'postponed' | 'rescheduled' | 'hiatus' | 'suspended' | 'tba';
  label: string;
  headline?: string;
  detail?: string;
  prominent: boolean;
  blocksReminder: boolean;
};

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

function safeReminderTitle(anime: any) {
  return String(anime?.title_english || anime?.title || anime?.title_japanese || 'This anime').trim();
}

function airingAtMs(anime: any) {
  const raw = Number(anime?.airingAt || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1_000_000_000_000 ? raw : raw * 1000;
}

function scheduleStatusBlob(anime: any) {
  const candidates = [
    anime?.scheduleStatus,
    anime?.airingStatus,
    anime?.broadcastStatus,
    anime?.episodeStatus,
    anime?.releaseStatus,
    anime?.delayStatus,
    anime?.status,
    anime?.airingMessage,
    anime?.broadcastMessage,
    anime?.message,
    anime?.notice,
    anime?.notes,
  ];
  return candidates
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ')
    .toLowerCase();
}

function scheduleBroadcastState(anime: any, airingMs = airingAtMs(anime)): ScheduleBroadcastState {
  const statusText = scheduleStatusBlob(anime);
  const explicitCancelled = anime?.cancelled || anime?.canceled || anime?.isCancelled || anime?.isCanceled;
  const explicitDelayed = anime?.delayed || anime?.isDelayed;
  const explicitPostponed = anime?.postponed || anime?.isPostponed;
  const explicitRescheduled = anime?.rescheduled || anime?.isRescheduled;

  if (explicitCancelled || /\b(cancelled|canceled|cancelation|cancellation)\b/.test(statusText)) {
    return {
      kind: 'cancelled',
      label: 'Cancelled',
      headline: 'CANCELLED',
      detail: 'This airing is not expected to release as scheduled.',
      prominent: true,
      blocksReminder: true,
    };
  }

  if (/\b(hiatus|on hiatus)\b/.test(statusText)) {
    return {
      kind: 'hiatus',
      label: 'On hiatus',
      headline: 'ON HIATUS',
      detail: 'Broadcast is paused until a new date is announced.',
      prominent: true,
      blocksReminder: true,
    };
  }

  if (/\b(suspended|suspension)\b/.test(statusText)) {
    return {
      kind: 'suspended',
      label: 'Suspended',
      headline: 'SUSPENDED',
      detail: 'Broadcast is temporarily suspended.',
      prominent: true,
      blocksReminder: true,
    };
  }

  if (explicitPostponed || /\b(postponed|postpone|pushed back)\b/.test(statusText)) {
    return {
      kind: 'postponed',
      label: 'Postponed',
      headline: 'POSTPONED',
      detail: airingMs ? 'A new airing time may replace this slot.' : 'Waiting for a new airing time.',
      prominent: true,
      blocksReminder: !airingMs,
    };
  }

  if (explicitRescheduled || /\b(rescheduled|reschedule|moved to|new time)\b/.test(statusText)) {
    const previousAiringMs = airingAtMs({ airingAt: anime?.previousAiringAt });
    return {
      kind: 'rescheduled',
      label: 'Rescheduled',
      headline: 'RESCHEDULED',
      detail: previousAiringMs && airingMs
        ? `Moved from ${formatAiringTime(previousAiringMs)} to ${formatAiringTime(airingMs)}.`
        : airingMs
          ? 'Airing time has changed.'
          : 'Waiting for an updated airing time.',
      prominent: true,
      blocksReminder: !airingMs,
    };
  }

  if (explicitDelayed || /\b(delayed|delay|late|pushed)\b/.test(statusText)) {
    return {
      kind: 'delayed',
      label: 'Delayed',
      headline: 'DELAYED',
      detail: airingMs ? 'This episode is marked delayed; check the updated time.' : 'No reliable airing time yet.',
      prominent: true,
      blocksReminder: !airingMs,
    };
  }

  if (!airingMs) {
    return {
      kind: 'tba',
      label: 'TBA',
      detail: 'Airing time has not been announced.',
      prominent: false,
      blocksReminder: true,
    };
  }

  return {
    kind: 'normal',
    label: new Date(airingMs).getTime() > Date.now() ? 'Airing soon' : 'Aired',
    prominent: false,
    blocksReminder: false,
  };
}

function scheduleStateAccentClass(kind: ScheduleBroadcastState['kind']) {
  if (kind === 'cancelled' || kind === 'suspended') return 'border-red-400/70 text-red-100';
  if (kind === 'rescheduled') return 'border-sky-300/55 text-sky-100';
  return 'border-primary/70 text-primary';
}

function scheduleStateBadgeClass(kind: ScheduleBroadcastState['kind']) {
  if (kind === 'cancelled' || kind === 'suspended') return 'border-red-300/25 bg-red-500/18 text-red-100';
  if (kind === 'delayed' || kind === 'postponed' || kind === 'hiatus') return 'border-amber-300/25 bg-amber-400/16 text-amber-100';
  if (kind === 'rescheduled') return 'border-sky-300/20 bg-sky-400/14 text-sky-100';
  return 'border-white/10 bg-black/60 text-white/72';
}

function reminderIdForAnime(anime: any) {
  const animeId = animeIdentity(anime) || safeReminderTitle(anime);
  const episode = anime?.airingEpisode || anime?.episode || 'unknown';
  const airingAt = airingAtMs(anime);
  return `${animeId}:episode-${episode}:${airingAt || 'unknown'}`;
}

function reminderFromAnime(anime: any): ScheduleReminder | null {
  const airingAt = airingAtMs(anime);
  if (!airingAt) return null;
  return {
    id: reminderIdForAnime(anime),
    animeId: anime?.mal_id || anime?.id,
    title: safeReminderTitle(anime),
    episode: anime?.airingEpisode || anime?.episode,
    airingAt,
    reminderOffsetMinutes: DEFAULT_REMINDER_OFFSET_MINUTES,
    createdAt: Date.now(),
    delivery: 'system',
  };
}

function scheduleNotificationStatusMessage(permission: ScheduleNotificationPermission) {
  if (permission === 'granted') return 'Windows notifications enabled';
  if (permission === 'denied') return 'Notifications blocked in Windows settings';
  if (permission === 'error') return 'Notification service needs attention';
  if (permission === 'unsupported') return 'Native notifications unavailable';
  return 'Enable a bell to allow Windows notifications';
}

function formatAiringTime(ms: number) {
  if (!ms) return 'Unknown time';
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scheduleArtwork(anime: any) {
  return anime?.images?.webp?.large_image_url
    || anime?.images?.jpg?.large_image_url
    || anime?.cover_image
    || anime?.coverImage?.extraLarge
    || anime?.coverImage?.large
    || anime?.image
    || '';
}

function reminderOffsetLabel(reminder: ScheduleReminder) {
  return `${reminder.reminderOffsetMinutes} minutes before airing`;
}

export default function DesktopSchedule() {
  const [selectedDay, setSelectedDay] = useState(0);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [reminders, setReminders] = useState<ScheduleReminder[]>(() => readScheduleReminders());
  const [pendingReminderId, setPendingReminderId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ScheduleNotice | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<ScheduleNotificationPermission>('default');
  const [scheduleUpdates, setScheduleUpdates] = useState(() => readDesktopScheduleUpdates());
  const [watchedSeries, setWatchedSeries] = useState(() => loadDesktopWatchedSeries());
  const { isInMyList, addToMyList, removeFromMyList, nsfwMode } = useStore();
  const days = useMemo(scheduleDays, []);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time', []);
  const active = days[selectedDay];
  const hasWatchHistory = watchedSeries.length > 0;
  const scheduleQuery = useQuery(desktopWeekQuery());
  const items = (scheduleQuery.data?.data || []).filter((item: any) => Number(item.airingAt) >= active.start && Number(item.airingAt) <= active.end);
  const watchedWeekQuery = scheduleQuery;
  const watchedWeekItems = useMemo(
    () => (watchedWeekQuery.data?.data || [])
      .filter((anime: any) => watchedSeries.some((record) => desktopWatchedSeriesMatchesAnime(record, anime)))
      .sort((left: any, right: any) => airingAtMs(left) - airingAtMs(right)),
    [watchedSeries, watchedWeekQuery.data?.data],
  );
  const watchedSeriesWithoutRelease = useMemo(
    () => watchedSeries.filter(
      (record) => !watchedWeekItems.some((anime: any) => desktopWatchedSeriesMatchesAnime(record, anime)),
    ),
    [watchedSeries, watchedWeekItems],
  );
  const visibleItems = useMemo(
    () => (favoritesOnly ? items.filter((anime: any) => isInMyList(animeIdentity(anime))) : items),
    [favoritesOnly, isInMyList, items],
  );
  const groupedItems = useMemo(() => {
    if (!visibleItems.length) return [];
    if (selectedDay !== 0) return [{ title: active.label, items: visibleItems }];
    const now = Date.now();
    const upcoming = visibleItems.filter((anime: any) => airingAtMs(anime) > now);
    const aired = visibleItems.filter((anime: any) => airingAtMs(anime) <= now);
    return [
      { title: 'Airing Soon', items: upcoming },
      { title: 'Already Aired', items: aired },
    ].filter((group) => group.items.length);
  }, [active.label, selectedDay, visibleItems]);
  const reminderIds = useMemo(() => new Set(reminders.map((reminder) => reminder.id)), [reminders]);
  const activeReminders = useMemo(
    () =>
      reminders
        .filter((reminder) => !reminder.firedAt && reminder.airingAt > Date.now())
        .sort((a, b) => a.airingAt - b.airingAt),
    [reminders],
  );
  const firedReminderCount = useMemo(() => reminders.filter((reminder) => reminder.firedAt).length, [reminders]);
  const nextReminder = activeReminders[0];
  const notificationStatusMessage = useMemo(
    () => scheduleNotificationStatusMessage(notificationPermission),
    [notificationPermission],
  );

  useEffect(() => {
    return subscribeDesktopScheduleReminders(() => setReminders(readScheduleReminders()));
  }, []);

  useEffect(() => subscribeDesktopWatchProgress(() => {
    setWatchedSeries(loadDesktopWatchedSeries());
  }), []);

  useEffect(() => subscribeDesktopScheduleUpdates(() => {
    setScheduleUpdates(readDesktopScheduleUpdates());
  }), []);

  useEffect(() => {
    const refreshPermission = () => {
      void getScheduleNotificationPermission().then(setNotificationPermission);
    };
    refreshPermission();
    window.addEventListener('focus', refreshPermission);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshPermission();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', refreshPermission);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const toggleScheduleList = (anime: any) => {
    const id = animeIdentity(anime);
    if (isInMyList(id)) removeFromMyList(id);
    else addToMyList(anime);
  };

  const saveScheduleReminder = (reminder: ScheduleReminder, message: string, tone: ScheduleNotice['tone'] = 'success') => {
    setReminders((current) => {
      const next = [...current.filter((item) => item.id !== reminder.id), reminder].sort((a, b) => a.airingAt - b.airingAt);
      writeScheduleReminders(next);
      return next;
    });
    setNotice({ tone, message });
  };

  const testNotification = async () => {
    const permission = await requestReminderPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      const shown = await showTestSystemNotification();
      setNotice({
        tone: shown ? 'success' : 'error',
        message: shown
          ? 'Test notification sent to Windows.'
          : 'Windows could not show the test notification. Check system notification settings.',
      });
      return;
    }
    if (permission === 'denied') {
      setNotice({ tone: 'error', message: 'Notifications are blocked. Enable StreamNyaa in Windows notification settings.' });
      return;
    }
    if (permission === 'unsupported') {
      setNotice({
        tone: 'info',
        message: 'Native notifications are unavailable in this runtime. Install and open the desktop app.',
      });
      return;
    }
    if (permission === 'error') {
      setNotice({
        tone: 'error',
        message: 'Windows notification access could not be initialized. Restart the installed app and try again.',
      });
      return;
    }
    setNotice({
      tone: 'info',
      message: 'Notification permission was not enabled, so no reminder was saved.',
    });
  };

  const toggleNotification = async (anime: any) => {
    const broadcastState = scheduleBroadcastState(anime);
    if (broadcastState.blocksReminder) {
      setNotice({
        tone: 'error',
        message: `Reminder unavailable: ${safeReminderTitle(anime)} is marked ${broadcastState.label.toLowerCase()}.`,
      });
      return;
    }
    const reminder = reminderFromAnime(anime);
    if (!reminder) {
      setNotice({ tone: 'error', message: 'This episode does not have a usable airing time yet.' });
      return;
    }
    const isActive = reminderIds.has(reminder.id);
    if (isActive) {
      const next = reminders.filter((item) => item.id !== reminder.id);
      setReminders(next);
      writeScheduleReminders(next);
      setNotice({ tone: 'success', message: `Reminder removed for ${reminder.title}.` });
      return;
    }
    if (reminder.airingAt <= Date.now()) {
      setNotice({ tone: 'error', message: 'This episode has already aired, so a reminder was not added.' });
      return;
    }
    setPendingReminderId(reminder.id);
    try {
      const permission = await requestReminderPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        saveScheduleReminder(
          { ...reminder, delivery: 'system' },
          `Windows reminder set for ${reminder.title} ${reminderOffsetLabel(reminder)}.`,
        );
        return;
      }
      setNotice({
        tone: 'error',
        message: permission === 'unsupported'
          ? 'Native notifications are available only in the installed desktop app. No reminder was saved.'
          : permission === 'error'
            ? 'Windows notification access could not be initialized. Restart the installed app and try again.'
            : 'Notifications are blocked. Enable StreamNyaa in Windows settings, then try again.',
      });
    } finally {
      setPendingReminderId(null);
    }
  };

  const clearFiredReminders = () => {
    const next = reminders.filter((reminder) => !reminder.firedAt);
    setReminders(next);
    writeScheduleReminders(next);
    setNotice({ tone: 'success', message: 'Expired reminders cleared.' });
  };
  const scheduleAlertCount = useMemo(
    () => visibleItems.filter((anime: any) => scheduleBroadcastState(anime).prominent).length,
    [visibleItems],
  );

  return (
    <div className="sn-page py-6">
      <Seo title="Airing Schedule | StreamNyaa Desktop" description="Desktop anime schedule." canonicalPath="/schedule" robots="noindex, nofollow" />

      <section className="sn-hero-panel overflow-hidden p-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/12 text-primary shadow-none shadow-primary/10">
              <CalendarDays className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold text-primary">Calendar</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-white">Airing schedule</h1>
              <p className="mt-1 text-sm text-white/56">Times are shown in {timezone}.</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold text-white/58">
            <button
              type="button"
              onClick={() => setFavoritesOnly((value) => !value)}
              className={`sn-category-chip px-3 py-1.5 ${
                favoritesOnly
                  ? 'sn-category-chip-active'
                  : ''
              }`}
            >
              Favorites only
            </button>
            <span className="sn-category-chip px-3 py-1.5">
              {activeReminders.length} reminder{activeReminders.length === 1 ? '' : 's'}
            </span>
            {nextReminder ? (
              <span className="sn-category-chip max-w-[260px] truncate px-3 py-1.5" title={`${nextReminder.title} - ${formatAiringTime(nextReminder.airingAt)}`}>
                Next: {formatAiringTime(nextReminder.airingAt)}
              </span>
            ) : null}
            {firedReminderCount ? (
              <button type="button" onClick={clearFiredReminders} className="sn-category-chip px-3 py-1.5 hover:text-white">
                Clear fired
              </button>
            ) : null}
            {scheduleAlertCount ? (
              <span className="sn-category-chip border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-amber-100">
                {scheduleAlertCount} schedule alert{scheduleAlertCount === 1 ? '' : 's'}
              </span>
            ) : null}
            <span className="sn-category-chip px-3 py-1.5">{items.length} titles</span>
            <span className="sn-category-chip px-3 py-1.5">{active.label}</span>
            {scheduleQuery.isFetching && !scheduleQuery.isLoading ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-white/42">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                Refreshing
              </span>
            ) : null}
            <span
              className={`sn-category-chip px-3 py-1.5 ${
                notificationPermission === 'denied'
                  ? 'border-amber-300/20 bg-amber-400/10 text-amber-100'
                  : notificationPermission === 'granted'
                    ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                    : ''
              }`}
            >
              {notificationStatusMessage}
            </span>
            <button type="button" onClick={testNotification} className="sn-category-chip px-3 py-1.5 hover:text-white">
              Test notification
            </button>
            <span className="basis-full text-right text-[11px] font-semibold normal-case tracking-normal text-white/40">
              Saved bells use native Windows notifications outside the app window while StreamNyaa is running.
            </span>
          </div>
        </div>
      </section>

      {notice ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold shadow-none ${
            notice.tone === 'error'
              ? 'border-red-400/25 bg-red-500/10 text-red-100 shadow-red-950/20'
              : notice.tone === 'success'
                ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100 shadow-emerald-950/20'
                : 'border-white/12 bg-white/[0.06] text-white/78 shadow-black/20'
          }`}
          role="status"
          aria-live="polite"
        >
          <span>{notice.message}</span>
        </div>
      ) : null}

      {scheduleUpdates.length ? (
        <section className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.035] p-4" aria-labelledby="recent-schedule-alerts">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-400/12 text-amber-200">
                <TriangleAlert className="h-4 w-4" />
              </span>
              <div>
                <h2 id="recent-schedule-alerts" className="text-sm font-semibold text-white">Recent delay and cancellation alerts</h2>
                <p className="mt-0.5 text-xs text-white/46">Confirmed delays and cancellations appear here; changed times are labeled separately as rescheduled.</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-white/42">{scheduleUpdates.length} update{scheduleUpdates.length === 1 ? '' : 's'}</span>
          </div>
          <div className="sn-scroll-rail mt-3 flex gap-2 pb-1">
            {scheduleUpdates.slice(0, 8).map((update) => (
              <div key={update.id} className="w-[280px] shrink-0 rounded-lg bg-black/28 px-3 py-3 ring-1 ring-inset ring-white/[0.06]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-white">{update.title}</span>
                  <span className={`shrink-0 text-[10px] font-semibold ${update.kind === 'cancelled' ? 'text-red-200' : 'text-amber-200'}`}>
                    {update.kind === 'cancelled' ? 'Cancelled' : 'Delayed'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/50">
                  Episode {update.episode}{update.kind === 'delayed' ? ` · ${formatAiringTime(update.airingAt)}` : ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="sn-scroll-rail mt-6 flex gap-3 pb-2">
        {days.map((day, index) => (
          <button
            key={day.start}
            type="button"
            onClick={() => setSelectedDay(index)}
            className={`min-w-[120px] rounded-xl px-4 py-3 text-left transition-all hover:-translate-y-0.5 ${
              selectedDay === index
                ? 'bg-primary text-white shadow-none shadow-primary/12'
                : 'bg-white/[0.045] text-white/62 hover:bg-white/[0.07] hover:text-white'
            }`}
          >
            <span className="block text-sm font-semibold">{day.label}</span>
            <span className="mt-1 block text-xs opacity-72">{day.date}</span>
            {index === 0 ? <span className="mt-2 inline-flex rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-semibold">Today</span> : null}
          </button>
        ))}
      </div>

      <section className="mt-6 overflow-hidden rounded-xl bg-[linear-gradient(120deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025)_58%,rgba(153,0,24,0.12))] p-5 shadow-sm ring-1 ring-inset ring-white/[0.07]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/14 text-primary">
              <History className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">From your watch history</h2>
              <p className="text-xs text-white/48">Upcoming episodes from anime you have started, updated automatically.</p>
            </div>
          </div>
          {watchedSeries.length ? (
            <span className="text-xs font-semibold text-white/46">
              {watchedSeries.length} tracked / {watchedWeekItems.length} airing this week
            </span>
          ) : null}
        </div>

        {!hasWatchHistory ? (
          <p className="mt-4 text-sm text-white/48">Watch an episode and its next scheduled release will appear here automatically.</p>
        ) : watchedWeekQuery.isLoading ? (
          <DesktopLoadingProgress className="mt-4" variant="inline" label="Matching your watch history" percent={48} detail="Checking upcoming episodes for saved series." />
        ) : watchedWeekQuery.isError && !watchedWeekQuery.data ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-4 py-3 ring-1 ring-inset ring-white/[0.07]">
            <p className="text-sm text-white/58">Upcoming episodes couldn’t refresh yet. Your watch history is unchanged.</p>
            <button
              type="button"
              onClick={() => watchedWeekQuery.refetch()}
              disabled={watchedWeekQuery.isFetching}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/[0.07] px-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.11] disabled:opacity-50"
            >
              <Loader2 className={`h-4 w-4 ${watchedWeekQuery.isFetching ? 'animate-spin' : ''}`} />
              Retry
            </button>
          </div>
        ) : (
          <>
            {watchedWeekItems.length ? (
              <div className="sn-scroll-rail mt-4 flex gap-3 pb-1">
                {watchedWeekItems.map((anime: any) => {
              const artwork = scheduleArtwork(anime);
              const airingMs = airingAtMs(anime);
              return (
                <Link
                  key={`watched-${anime.scheduleId || animeIdentity(anime)}`}
                  to={desktopWatchOrBrowsePath(anime)}
                  className="group relative h-[118px] w-[280px] shrink-0 overflow-hidden rounded-xl bg-black/35 shadow-none shadow-black/20 ring-1 ring-inset ring-white/[0.08] transition duration-200 hover:-translate-y-0.5 hover:ring-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  {artwork ? (
                    <img
                      src={artwork}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover opacity-72 transition duration-300 group-hover:scale-[1.025] group-hover:opacity-82"
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  ) : null}
                  <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,7,10,0.94),rgba(7,7,10,0.62)_58%,rgba(7,7,10,0.18))]" />
                  <span className="absolute inset-x-0 bottom-0 p-4">
                    <span className="block line-clamp-1 text-sm font-semibold text-white">{safeReminderTitle(anime)}</span>
                    <span className="mt-1 block text-xs text-white/58">Episode {anime.airingEpisode || 'TBA'} · {formatAiringTime(airingMs)}</span>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                      Open anime <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </Link>
              );
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/48">None of your watched anime have an episode scheduled in the next seven days.</p>
            )}

            {watchedSeriesWithoutRelease.length ? (
              <div className="mt-5 border-t border-white/[0.07] pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-white/76">No release announced this week</h3>
                <span className="text-xs text-white/38">Still tracked automatically</span>
              </div>
              <div className="sn-scroll-rail mt-3 flex gap-2 pb-1">
                {watchedSeriesWithoutRelease.map((record) => (
                  <Link
                    key={`tracked-${record.animeId}-${record.title}`}
                    to={desktopWatchOrBrowsePath({ id: record.animeId, mal_id: record.animeId, title: record.title })}
                    className="group flex h-16 w-[230px] shrink-0 items-center gap-3 rounded-lg bg-black/28 px-3 ring-1 ring-inset ring-white/[0.07] transition hover:bg-white/[0.055] hover:ring-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/65"
                  >
                    <span className="h-11 w-8 shrink-0 overflow-hidden rounded-md bg-white/[0.05]">
                      {record.poster ? (
                        <img
                          src={record.poster}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(event) => { event.currentTarget.style.display = 'none'; }}
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block line-clamp-2 text-xs font-semibold leading-4 text-white/78 group-hover:text-white">{record.title}</span>
                      <span className="mt-1 block text-[11px] text-white/40">Last watched episode {record.lastEpisode || 'unknown'}</span>
                    </span>
                  </Link>
                ))}
              </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="mt-7">
        {scheduleQuery.isError ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3" role="status">
            <div>
              <p className="text-sm font-semibold text-amber-100">Schedule couldn’t refresh</p>
              <p className="mt-0.5 text-xs text-white/50">
                {scheduleQuery.data
                  ? 'The last verified schedule is still shown below.'
                  : 'Your saved screens remain available while the schedule reconnects.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => scheduleQuery.refetch()}
              disabled={scheduleQuery.isFetching}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/[0.07] px-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.11] disabled:opacity-50"
            >
              <Loader2 className={`h-4 w-4 ${scheduleQuery.isFetching ? 'animate-spin' : ''}`} />
              Retry
            </button>
          </div>
        ) : null}
        {scheduleQuery.isLoading ? (
          <div className="sn-glass-panel p-5">
            <DesktopLoadingProgress variant="inline" label="Loading the airing schedule" percent={44} detail="Normalizing broadcast times for your time zone." />
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="sn-poster-card animate-pulse bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))]" />
              ))}
            </div>
          </div>
        ) : groupedItems.length ? (
          <div className="space-y-8">
            {groupedItems.map((group) => (
              <div key={group.title}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">{group.title}</h2>
                  <span className="sn-category-chip px-3 py-1.5 text-xs">{group.items.length} titles</span>
                </div>
                <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
                  {group.items.map((anime: any) => {
                    const airingMs = airingAtMs(anime);
                    const date = new Date(airingMs);
                    const time = airingMs ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'TBA';
                    const broadcastState = scheduleBroadcastState(anime, airingMs);
                    const inList = isInMyList(animeIdentity(anime));
                    const reminder = reminderFromAnime(anime);
                    const reminderId = reminder?.id || reminderIdForAnime(anime);
                    const activeReminder = reminders.find((item) => item.id === reminderId);
                    const notified = Boolean(activeReminder);
                    const canAddReminder = Boolean(reminder && reminder.airingAt > Date.now() && !broadcastState.blocksReminder);
                    const reminderPending = pendingReminderId === reminderId;
                    const reminderUnavailableTitle = broadcastState.blocksReminder
                      ? `Reminder unavailable: ${broadcastState.label}`
                      : reminder && reminder.airingAt <= Date.now()
                        ? 'This episode has already aired'
                        : 'Reminder unavailable until release time is known';
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
                            disabled={reminderPending || (!notified && !canAddReminder)}
                            className={`grid h-8 w-8 place-items-center rounded-lg border backdrop-blur transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:cursor-not-allowed disabled:opacity-45 ${
                              notified
                                ? 'border-primary/45 bg-primary/22 text-primary shadow-none shadow-primary/20'
                                : 'border-white/10 bg-black/60 text-white/70 hover:border-primary/30 hover:bg-primary/14 hover:text-white'
                            }`}
                            aria-label={
                              notified
                                ? `Windows reminder enabled for ${safeReminderTitle(anime)}`
                                : canAddReminder
                                  ? `Remind me before ${safeReminderTitle(anime)} airs`
                                  : `Reminder unavailable for ${safeReminderTitle(anime)}`
                            }
                            aria-pressed={notified}
                            title={
                              notified
                                ? 'Windows reminder enabled'
                                : canAddReminder
                                  ? `Remind ${DEFAULT_REMINDER_OFFSET_MINUTES} minutes before airing`
                                  : reminderUnavailableTitle
                            }
                          >
                            {reminderPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Bell className={`h-4 w-4 ${notified ? 'fill-current' : ''}`} />
                            )}
                          </button>
                        </div>
                        <div className="absolute left-2 top-2 z-20 rounded-lg border border-white/10 bg-black/72 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
                          {time} - Ep {anime.airingEpisode}
                        </div>
                        {broadcastState.prominent ? (
                          <div
                            className="pointer-events-none absolute inset-x-3 top-[46%] z-[25] flex -translate-y-1/2 items-center gap-2"
                            title={broadcastState.detail}
                          >
                            <span className="h-px min-w-3 flex-1 bg-gradient-to-r from-transparent via-primary/65 to-primary/20" />
                            <span className={`rounded-md border bg-[#08080b]/92 px-4 py-2 text-xs font-semibold tracking-wider backdrop-blur-sm ${scheduleStateAccentClass(broadcastState.kind)}`}>
                              {broadcastState.headline || broadcastState.label}
                            </span>
                            <span className="h-px min-w-3 flex-1 bg-gradient-to-l from-transparent via-primary/65 to-primary/20" />
                          </div>
                        ) : (
                          <div
                            className={`absolute bottom-2 right-2 z-20 rounded-lg border px-2 py-1 text-[10px] font-semibold backdrop-blur ${scheduleStateBadgeClass(broadcastState.kind)}`}
                          >
                            {broadcastState.label}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : scheduleQuery.isError && !scheduleQuery.data ? (
          <div className="sn-empty-state px-6 py-16 text-center">
            <p className="text-lg font-semibold text-white">Schedule is temporarily unavailable.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Retry when your connection is ready. StreamNyaa will keep this page intact.</p>
          </div>
        ) : (
          <div className="sn-empty-state px-6 py-16 text-center">
            <p className="text-lg font-semibold text-white">No episodes scheduled for this day.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Check another day or view upcoming releases from Explore.</p>
          </div>
        )}
      </section>
    </div>
  );
}
