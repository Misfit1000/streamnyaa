import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarDays, Heart, Loader2 } from 'lucide-react';
import AnimeCard from '../components/AnimeCard';
import Seo from '../components/Seo';
import { fetchSchedule } from '../api/jikan';
import { animeIdentity } from '../lib/animeIdentity';
import { useStore } from '../store/useStore';

const SCHEDULE_REMINDERS_KEY = 'streamnyaa.desktop.scheduleReminders.v1';
const DEFAULT_REMINDER_OFFSET_MINUTES = 10;
const REMINDER_POLL_MS = 45_000;
const REMINDER_FIRE_GRACE_MS = 10 * 60 * 1000;

type ScheduleNotificationPermission = 'granted' | 'default' | 'denied' | 'unsupported';
type ScheduleReminderDelivery = 'system' | 'in-app';

type ScheduleReminder = {
  id: string;
  animeId?: string | number;
  title: string;
  episode?: number | string;
  airingAt: number;
  reminderOffsetMinutes: number;
  createdAt: number;
  firedAt?: number;
  delivery: ScheduleReminderDelivery;
};

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
    return {
      kind: 'rescheduled',
      label: 'Rescheduled',
      headline: 'RESCHEDULED',
      detail: airingMs ? 'Airing time has changed.' : 'Waiting for an updated airing time.',
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

function scheduleStatePanelClass(kind: ScheduleBroadcastState['kind']) {
  if (kind === 'cancelled' || kind === 'suspended') {
    return 'border-red-300/35 bg-red-950/75 text-red-50 shadow-red-950/35';
  }
  if (kind === 'delayed' || kind === 'postponed' || kind === 'hiatus') {
    return 'border-amber-300/35 bg-amber-950/75 text-amber-50 shadow-amber-950/30';
  }
  if (kind === 'rescheduled') {
    return 'border-sky-300/30 bg-sky-950/75 text-sky-50 shadow-sky-950/30';
  }
  return 'border-white/12 bg-black/70 text-white shadow-black/30';
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

function reminderFromAnime(anime: any, delivery: ScheduleReminderDelivery = 'in-app'): ScheduleReminder | null {
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
    delivery,
  };
}

function normalizeReminderDelivery(value: any): ScheduleReminderDelivery {
  if (value === 'system' || value === 'in-app') return value;
  return getScheduleNotificationPermission() === 'granted' ? 'system' : 'in-app';
}

function normalizeReminder(value: any): ScheduleReminder | null {
  if (!value || typeof value !== 'object') return null;
  const airingAt = Number(value.airingAt || 0);
  if (!Number.isFinite(airingAt) || airingAt <= 0) return null;
  const id = String(value.id || '').trim();
  const title = String(value.title || '').trim();
  if (!id || !title) return null;
  return {
    id,
    animeId: value.animeId,
    title,
    episode: value.episode,
    airingAt,
    reminderOffsetMinutes: Number.isFinite(Number(value.reminderOffsetMinutes))
      ? Number(value.reminderOffsetMinutes)
      : DEFAULT_REMINDER_OFFSET_MINUTES,
    createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : Date.now(),
    firedAt: Number.isFinite(Number(value.firedAt)) ? Number(value.firedAt) : undefined,
    delivery: normalizeReminderDelivery(value.delivery),
  };
}

function readScheduleReminders(): ScheduleReminder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SCHEDULE_REMINDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeReminder).filter(Boolean) as ScheduleReminder[];
  } catch {
    return [];
  }
}

function writeScheduleReminders(reminders: ScheduleReminder[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SCHEDULE_REMINDERS_KEY, JSON.stringify(reminders));
  } catch {
    // A failed write should not break the schedule page.
  }
}

function getScheduleNotificationPermission(): ScheduleNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window) || typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'default';
}

async function requestReminderPermission(): Promise<ScheduleNotificationPermission> {
  const current = getScheduleNotificationPermission();
  if (current !== 'default') return current;
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') return 'granted';
    if (result === 'denied') return 'denied';
    return 'default';
  } catch {
    return getScheduleNotificationPermission();
  }
}

function shouldFireReminder(reminder: ScheduleReminder, now: number) {
  if (reminder.firedAt) return false;
  const triggerAt = reminder.airingAt - reminder.reminderOffsetMinutes * 60 * 1000;
  return now >= triggerAt && now < reminder.airingAt + REMINDER_FIRE_GRACE_MS;
}

function showSystemReminder(reminder: ScheduleReminder) {
  if (reminder.delivery !== 'system' || getScheduleNotificationPermission() !== 'granted') return false;
  try {
    const episodeText = reminder.episode ? `Episode ${reminder.episode}` : 'New episode';
    new Notification(`${reminder.title} is airing soon`, {
      body: `${episodeText} starts in about ${reminder.reminderOffsetMinutes} minutes.`,
      tag: reminder.id,
      silent: false,
    });
    return true;
  } catch {
    return false;
  }
}

function showTestSystemNotification() {
  if (getScheduleNotificationPermission() !== 'granted') return false;
  try {
    new Notification('StreamNyaa reminders are working.', {
      body: 'System notifications can appear for saved airing reminders.',
      tag: 'streamnyaa-schedule-test-notification',
      silent: false,
    });
    return true;
  } catch {
    return false;
  }
}

function scheduleNotificationStatusMessage(permission: ScheduleNotificationPermission, hasInAppReminder: boolean) {
  if (permission === 'granted') return 'System notifications enabled';
  if (permission === 'denied') {
    return hasInAppReminder
      ? 'In-app reminders only while StreamNyaa is open'
      : 'Notifications blocked in Windows/browser settings';
  }
  if (permission === 'unsupported') return 'Notifications unsupported; using in-app reminders';
  return 'Reminders work while StreamNyaa is open. System notifications require Windows/browser permission.';
}

function formatAiringTime(ms: number) {
  if (!ms) return 'Unknown time';
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [fallbackReminder, setFallbackReminder] = useState<ScheduleReminder | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<ScheduleNotificationPermission>(() =>
    getScheduleNotificationPermission(),
  );
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
  const hasInAppReminder = useMemo(() => activeReminders.some((reminder) => reminder.delivery === 'in-app'), [activeReminders]);
  const notificationStatusMessage = useMemo(
    () => scheduleNotificationStatusMessage(notificationPermission, hasInAppReminder),
    [hasInAppReminder, notificationPermission],
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SCHEDULE_REMINDERS_KEY) setReminders(readScheduleReminders());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const refreshPermission = () => setNotificationPermission(getScheduleNotificationPermission());
    window.addEventListener('focus', refreshPermission);
    document.addEventListener('visibilitychange', refreshPermission);
    return () => {
      window.removeEventListener('focus', refreshPermission);
      document.removeEventListener('visibilitychange', refreshPermission);
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    if (fallbackReminder) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [fallbackReminder, notice]);

  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      setReminders((current) => {
        let changed = false;
        const next = current.map((reminder) => {
          if (!shouldFireReminder(reminder, now)) return reminder;
          const systemShown = showSystemReminder(reminder);
          if (!systemShown) {
            setNotice({
              tone: 'info',
              message: `${reminder.title}${reminder.episode ? ` episode ${reminder.episode}` : ''} is airing soon.`,
            });
          }
          changed = true;
          return { ...reminder, firedAt: now };
        });
        if (changed) writeScheduleReminders(next);
        return changed ? next : current;
      });
    };
    checkReminders();
    const interval = window.setInterval(checkReminders, REMINDER_POLL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const toggleScheduleList = (anime: any) => {
    const id = animeIdentity(anime);
    if (isInMyList(id)) removeFromMyList(id);
    else addToMyList(anime);
  };

  const saveScheduleReminder = (reminder: ScheduleReminder, message: string, tone: ScheduleNotice['tone'] = 'success') => {
    setFallbackReminder(null);
    setReminders((current) => {
      const next = [...current.filter((item) => item.id !== reminder.id), reminder].sort((a, b) => a.airingAt - b.airingAt);
      writeScheduleReminders(next);
      return next;
    });
    setNotice({ tone, message });
  };

  const saveFallbackReminder = () => {
    if (!fallbackReminder) return;
    saveScheduleReminder(
      fallbackReminder,
      `In-app reminder saved for ${fallbackReminder.title}. It will show while StreamNyaa is open.`,
      'info',
    );
  };

  const testNotification = async () => {
    const permission = await requestReminderPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      const shown = showTestSystemNotification();
      setNotice({
        tone: shown ? 'success' : 'info',
        message: shown
          ? 'Test notification sent.'
          : 'System notifications are enabled, but this test could not be shown. In-app reminders will still work.',
      });
      return;
    }
    if (permission === 'denied') {
      setNotice({ tone: 'error', message: 'Notifications are blocked. Enable them in Windows/browser settings.' });
      return;
    }
    if (permission === 'unsupported') {
      setNotice({
        tone: 'info',
        message: 'System notifications are unavailable. In-app reminders will show while StreamNyaa is open.',
      });
      return;
    }
    setNotice({
      tone: 'info',
      message: 'Notification permission was not enabled. In-app reminders can still show while StreamNyaa is open.',
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
      if (fallbackReminder?.id === reminder.id) setFallbackReminder(null);
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
      if (permission === 'denied') {
        setFallbackReminder({ ...reminder, delivery: 'in-app' });
        setNotice({
          tone: 'info',
          message: 'Notifications are blocked. You can still use in-app reminders while StreamNyaa is open.',
        });
        return;
      }
      if (permission === 'granted') {
        saveScheduleReminder(
          { ...reminder, delivery: 'system' },
          `System reminder set for ${reminder.title} ${reminderOffsetLabel(reminder)}.`,
        );
        return;
      }
      saveScheduleReminder(
        { ...reminder, delivery: 'in-app' },
        permission === 'unsupported'
          ? `In-app reminder saved for ${reminder.title}; system notifications are unavailable.`
          : `In-app reminder saved for ${reminder.title}; system notifications were not enabled.`,
        'info',
      );
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
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary shadow-lg shadow-primary/10">
              <CalendarDays className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Calendar</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-white">Airing schedule</h1>
              <p className="mt-1 text-sm text-white/56">Times are shown in {timezone}.</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 text-xs font-black text-white/58">
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
            <span className="basis-full text-right text-[11px] font-bold normal-case tracking-normal text-white/40">
              Reminders work while StreamNyaa is open. System notifications require Windows/browser permission.
            </span>
          </div>
        </div>
      </section>

      {notice ? (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold shadow-lg ${
            notice.tone === 'error'
              ? 'border-red-400/25 bg-red-500/10 text-red-100 shadow-red-950/20'
              : notice.tone === 'success'
                ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100 shadow-emerald-950/20'
                : 'border-white/12 bg-white/[0.06] text-white/78 shadow-black/20'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{notice.message}</span>
            {fallbackReminder ? (
              <button
                type="button"
                onClick={saveFallbackReminder}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-black transition-transform hover:-translate-y-0.5"
              >
                Save in-app reminder
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="sn-scroll-rail mt-6 flex gap-3 pb-2">
        {days.map((day, index) => (
          <button
            key={day.start}
            type="button"
            onClick={() => setSelectedDay(index)}
            className={`min-w-[120px] rounded-xl px-4 py-3 text-left transition-all hover:-translate-y-0.5 ${
              selectedDay === index
                ? 'bg-primary text-white shadow-lg shadow-primary/12'
                : 'bg-white/[0.045] text-white/62 hover:bg-white/[0.07] hover:text-white'
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
          <div className="sn-glass-panel p-5">
            <div className="mb-4 flex items-center text-sm font-black text-white/58">
              <Loader2 className="mr-3 h-5 w-5 animate-spin text-primary" />
              Loading airing schedule...
            </div>
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
                    const reminderDelivery = activeReminder?.delivery;
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
                              reminderDelivery === 'system'
                                ? 'border-primary/45 bg-primary/22 text-primary shadow-lg shadow-primary/20'
                                : reminderDelivery === 'in-app'
                                  ? 'border-amber-300/35 bg-amber-400/18 text-amber-100 shadow-lg shadow-amber-950/20'
                                : 'border-white/10 bg-black/60 text-white/70 hover:border-primary/30 hover:bg-primary/14 hover:text-white'
                            }`}
                            aria-label={
                              notified
                                ? reminderDelivery === 'system'
                                  ? `System reminder enabled for ${safeReminderTitle(anime)}`
                                  : `In-app reminder enabled for ${safeReminderTitle(anime)}`
                                : canAddReminder
                                  ? `Remind me before ${safeReminderTitle(anime)} airs`
                                  : `Reminder unavailable for ${safeReminderTitle(anime)}`
                            }
                            aria-pressed={notified}
                            title={
                              notified
                                ? reminderDelivery === 'system'
                                  ? 'System reminder enabled'
                                  : 'In-app reminder will show while StreamNyaa is open'
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
                        <div className="absolute left-2 top-2 z-20 rounded-lg border border-white/10 bg-black/72 px-2 py-1 text-[11px] font-black text-white backdrop-blur">
                          {time} - Ep {anime.airingEpisode}
                        </div>
                        {broadcastState.prominent ? (
                          <div
                            className={`pointer-events-none absolute inset-x-3 top-1/2 z-[25] -translate-y-1/2 rounded-2xl border px-3 py-3 text-center shadow-2xl backdrop-blur-md ${scheduleStatePanelClass(broadcastState.kind)}`}
                          >
                            <div className="text-2xl font-black uppercase tracking-[0.2em]">{broadcastState.headline || broadcastState.label}</div>
                            {broadcastState.detail ? (
                              <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] opacity-80">{broadcastState.detail}</div>
                            ) : null}
                          </div>
                        ) : null}
                        <div
                          className={`absolute bottom-2 right-2 z-20 rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] backdrop-blur ${scheduleStateBadgeClass(broadcastState.kind)}`}
                        >
                          {broadcastState.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sn-empty-state px-6 py-16 text-center">
            <p className="text-lg font-black text-white">No episodes scheduled for this day.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/52">Check another day or view upcoming releases from Explore.</p>
          </div>
        )}
      </section>
    </div>
  );
}
