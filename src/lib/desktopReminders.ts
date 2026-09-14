import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

export const DESKTOP_SCHEDULE_REMINDERS_KEY = 'streamnyaa.desktop.scheduleReminders.v1';
export const DESKTOP_REMINDER_OFFSET_MINUTES = 10;
export const DESKTOP_REMINDER_POLL_MS = 45_000;
const DESKTOP_REMINDER_FIRE_GRACE_MS = 10 * 60 * 1000;
const DESKTOP_REMINDERS_EVENT = 'streamnyaa.desktop.scheduleReminders.changed';
export const DESKTOP_UPCOMING_WATCHES_KEY = 'streamnyaa.desktop.upcomingWatches.v1';
const DESKTOP_UPCOMING_WATCHES_EVENT = 'streamnyaa.desktop.upcomingWatches.changed';

export type DesktopNotificationPermission = 'granted' | 'default' | 'denied' | 'unsupported' | 'error';

export type DesktopScheduleReminder = {
  id: string;
  animeId?: string | number;
  title: string;
  episode?: number | string;
  airingAt: number;
  reminderOffsetMinutes: number;
  createdAt: number;
  firedAt?: number;
  delivery: 'system';
};

export type DesktopUpcomingAnimeWatch = {
  id: string;
  animeId?: string;
  anilistId?: string;
  malId?: string;
  title: string;
  createdAt: number;
  airingAt?: number;
  episode?: number;
};

function upcomingWatchId(anime: any) {
  const animeId = String(anime?.anilist_id || anime?.id || anime?.mal_id || anime?.title || '').trim();
  return animeId ? `upcoming:${animeId}` : '';
}

function normalizeUpcomingWatch(value: any): DesktopUpcomingAnimeWatch | null {
  const id = String(value?.id || '').trim();
  const title = String(value?.title || '').trim();
  if (!id || !title) return null;
  const airingAt = Number(value?.airingAt || 0);
  const episode = Number(value?.episode || 0);
  return {
    id,
    animeId: String(value?.animeId || '').trim() || undefined,
    anilistId: String(value?.anilistId || '').trim() || undefined,
    malId: String(value?.malId || '').trim() || undefined,
    title,
    createdAt: Number.isFinite(Number(value?.createdAt)) ? Number(value.createdAt) : Date.now(),
    airingAt: Number.isFinite(airingAt) && airingAt > 0 ? airingAt : undefined,
    episode: Number.isFinite(episode) && episode > 0 ? episode : undefined,
  };
}

export function readDesktopUpcomingAnimeWatches(): DesktopUpcomingAnimeWatch[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DESKTOP_UPCOMING_WATCHES_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(normalizeUpcomingWatch).filter((item): item is DesktopUpcomingAnimeWatch => Boolean(item))
      : [];
  } catch {
    return [];
  }
}

function writeDesktopUpcomingAnimeWatches(watches: DesktopUpcomingAnimeWatch[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DESKTOP_UPCOMING_WATCHES_KEY, JSON.stringify(watches));
    window.dispatchEvent(new CustomEvent(DESKTOP_UPCOMING_WATCHES_EVENT));
  } catch {
    // Release watches are best-effort and must not block navigation.
  }
}

export function subscribeDesktopUpcomingAnimeWatches(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key === DESKTOP_UPCOMING_WATCHES_KEY) listener();
  };
  window.addEventListener(DESKTOP_UPCOMING_WATCHES_EVENT, listener);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(DESKTOP_UPCOMING_WATCHES_EVENT, listener);
    window.removeEventListener('storage', handleStorage);
  };
}

export function isDesktopUpcomingAnimeWatched(anime: any) {
  const id = upcomingWatchId(anime);
  return Boolean(id && readDesktopUpcomingAnimeWatches().some((watch) => watch.id === id));
}

export async function toggleDesktopUpcomingAnimeWatch(anime: any) {
  const id = upcomingWatchId(anime);
  const title = String(anime?.title_english || anime?.title || anime?.title_romaji || 'Upcoming anime').trim();
  if (!id) return { saved: false, removed: false, permission: 'error' as DesktopNotificationPermission };
  const current = readDesktopUpcomingAnimeWatches();
  if (current.some((watch) => watch.id === id)) {
    writeDesktopUpcomingAnimeWatches(current.filter((watch) => watch.id !== id));
    writeDesktopScheduleReminders(readDesktopScheduleReminders().filter((reminder) => reminder.id !== `${id}:airing`));
    return { saved: false, removed: true, permission: await getDesktopNotificationPermission() };
  }
  const permission = await requestDesktopNotificationPermission();
  if (permission !== 'granted') return { saved: false, removed: false, permission };
  const rawAiringAt = Number(anime?.nextAiringEpisode?.airingAt || anime?.airingAt || 0);
  const airingAt = rawAiringAt > 1_000_000_000_000 ? rawAiringAt : rawAiringAt > 0 ? rawAiringAt * 1000 : undefined;
  const episode = Number(anime?.nextAiringEpisode?.episode || anime?.airingEpisode || 1);
  const next: DesktopUpcomingAnimeWatch = {
    id,
    animeId: String(anime?.anilist_id || anime?.id || anime?.mal_id || '').trim() || undefined,
    anilistId: String(anime?.anilist_id || anime?.id || '').trim() || undefined,
    malId: String(anime?.mal_id || '').trim() || undefined,
    title,
    createdAt: Date.now(),
    airingAt,
    episode: Number.isFinite(episode) && episode > 0 ? episode : 1,
  };
  writeDesktopUpcomingAnimeWatches([...current, next]);
  if (airingAt) {
    const reminders = readDesktopScheduleReminders();
    writeDesktopScheduleReminders([
      ...reminders.filter((reminder) => reminder.id !== `${id}:airing`),
      {
        id: `${id}:airing`,
        animeId: next.animeId,
        title,
        episode: next.episode,
        airingAt,
        reminderOffsetMinutes: 0,
        createdAt: Date.now(),
        delivery: 'system',
      },
    ]);
  }
  return { saved: true, removed: false, permission };
}

export function resolveDesktopUpcomingAnimeWatches(scheduleItems: any[]) {
  const current = readDesktopUpcomingAnimeWatches();
  if (!current.length) return 0;
  const reminders = readDesktopScheduleReminders();
  let resolved = 0;
  const nextWatches = current.map((watch) => {
    if (watch.airingAt) return watch;
    const match = scheduleItems.find((anime) => {
      const ids = [anime?.anilist_id, anime?.id, anime?.mal_id].filter(Boolean).map(String);
      if ([watch.animeId, watch.anilistId, watch.malId].filter(Boolean).some((id) => ids.includes(String(id)))) return true;
      return String(anime?.title || '').trim().toLowerCase() === watch.title.toLowerCase();
    });
    const rawAiringAt = Number(match?.airingAt || match?.nextAiringEpisode?.airingAt || 0);
    if (!rawAiringAt) return watch;
    const airingAt = rawAiringAt > 1_000_000_000_000 ? rawAiringAt : rawAiringAt * 1000;
    const episode = Number(match?.airingEpisode || match?.nextAiringEpisode?.episode || 1);
    reminders.push({
      id: `${watch.id}:airing`,
      animeId: watch.animeId,
      title: watch.title,
      episode,
      airingAt,
      reminderOffsetMinutes: 0,
      createdAt: Date.now(),
      delivery: 'system',
    });
    resolved += 1;
    return { ...watch, airingAt, episode };
  });
  if (resolved) {
    writeDesktopUpcomingAnimeWatches(nextWatches);
    writeDesktopScheduleReminders(reminders.filter((reminder, index, all) => index === all.findIndex((item) => item.id === reminder.id)));
  }
  return resolved;
}

function normalizeReminder(value: any): DesktopScheduleReminder | null {
  if (!value || typeof value !== 'object') return null;
  const airingAt = Number(value.airingAt || 0);
  const id = String(value.id || '').trim();
  const title = String(value.title || '').trim();
  if (!id || !title || !Number.isFinite(airingAt) || airingAt <= 0) return null;
  return {
    id,
    animeId: value.animeId,
    title,
    episode: value.episode,
    airingAt,
    reminderOffsetMinutes: Number.isFinite(Number(value.reminderOffsetMinutes))
      ? Number(value.reminderOffsetMinutes)
      : DESKTOP_REMINDER_OFFSET_MINUTES,
    createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : Date.now(),
    firedAt: Number.isFinite(Number(value.firedAt)) ? Number(value.firedAt) : undefined,
    delivery: 'system',
  };
}

export function readDesktopScheduleReminders(): DesktopScheduleReminder[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DESKTOP_SCHEDULE_REMINDERS_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(normalizeReminder).filter((item): item is DesktopScheduleReminder => Boolean(item))
      : [];
  } catch {
    return [];
  }
}

export function writeDesktopScheduleReminders(reminders: DesktopScheduleReminder[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DESKTOP_SCHEDULE_REMINDERS_KEY, JSON.stringify(reminders));
    window.dispatchEvent(new CustomEvent(DESKTOP_REMINDERS_EVENT));
  } catch {
    // Reminder persistence is best-effort and must not interrupt navigation.
  }
}

export function subscribeDesktopScheduleReminders(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key === DESKTOP_SCHEDULE_REMINDERS_KEY) listener();
  };
  window.addEventListener(DESKTOP_REMINDERS_EVENT, listener);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(DESKTOP_REMINDERS_EVENT, listener);
    window.removeEventListener('storage', handleStorage);
  };
}

function hasNativeNotificationRuntime() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke);
}

export async function getDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
  if (!hasNativeNotificationRuntime()) return 'unsupported';
  try {
    return (await isPermissionGranted()) ? 'granted' : 'default';
  } catch {
    return 'error';
  }
}

export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
  const current = await getDesktopNotificationPermission();
  if (current !== 'default') return current;
  try {
    const result = await requestPermission();
    return result === 'granted' || result === 'denied' ? result : 'default';
  } catch {
    return 'error';
  }
}

export async function sendDesktopNotification(title: string, body: string) {
  if (await getDesktopNotificationPermission() !== 'granted') return false;
  try {
    await sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}

export async function sendDesktopReminderTest() {
  return sendDesktopNotification(
    'StreamNyaa reminders are working',
    'Saved airing reminders will appear here even when the app window is not focused.',
  );
}

function reminderIsDue(reminder: DesktopScheduleReminder, now: number) {
  if (reminder.firedAt) return false;
  const triggerAt = reminder.airingAt - reminder.reminderOffsetMinutes * 60 * 1000;
  return now >= triggerAt && now < reminder.airingAt + DESKTOP_REMINDER_FIRE_GRACE_MS;
}

export async function deliverDueDesktopReminders(now = Date.now()) {
  const current = readDesktopScheduleReminders();
  const next = [...current];
  const delivered: string[] = [];
  const failed: string[] = [];
  let changed = false;

  for (let index = 0; index < current.length; index += 1) {
    const reminder = current[index];
    if (!reminderIsDue(reminder, now)) continue;
    const episodeText = reminder.episode ? `Episode ${reminder.episode}` : 'New episode';
    const shown = await sendDesktopNotification(
      reminder.reminderOffsetMinutes > 0 ? `${reminder.title} is airing soon` : `${reminder.title} is airing now`,
      reminder.reminderOffsetMinutes > 0
        ? `${episodeText} starts in about ${reminder.reminderOffsetMinutes} minutes.`
        : `${episodeText} is scheduled to begin now.`,
    );
    (shown ? delivered : failed).push(reminder.title);
    if (shown) {
      next[index] = { ...reminder, firedAt: now };
      changed = true;
    }
  }

  if (changed) writeDesktopScheduleReminders(next);
  return { delivered, failed };
}
