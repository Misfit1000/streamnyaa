import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

export const DESKTOP_SCHEDULE_REMINDERS_KEY = 'streamnyaa.desktop.scheduleReminders.v1';
export const DESKTOP_REMINDER_OFFSET_MINUTES = 10;
export const DESKTOP_REMINDER_POLL_MS = 45_000;
const DESKTOP_REMINDER_FIRE_GRACE_MS = 10 * 60 * 1000;
const DESKTOP_REMINDERS_EVENT = 'streamnyaa.desktop.scheduleReminders.changed';

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
      `${reminder.title} is airing soon`,
      `${episodeText} starts in about ${reminder.reminderOffsetMinutes} minutes.`,
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
