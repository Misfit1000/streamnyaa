import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { buildSourceIdentity, normalizeSourceTitle, type SourceIdentity } from './desktopSourceIdentity';
import { desktopCanonicalAnimeId, readDesktopAvailabilityRecords, recordDesktopAvailability, type DesktopAvailabilityRecord } from './desktopAvailability';

export const DESKTOP_SCHEDULE_REMINDERS_KEY = 'streamnyaa.desktop.scheduleReminders.v1';
export const DESKTOP_REMINDER_OFFSET_MINUTES = 10;
export const DESKTOP_REMINDER_POLL_MS = 45_000;
const DESKTOP_REMINDER_FIRE_GRACE_MS = 10 * 60 * 1000;
const DESKTOP_REMINDERS_EVENT = 'streamnyaa.desktop.scheduleReminders.changed';
export const DESKTOP_UPCOMING_WATCHES_KEY = 'streamnyaa.desktop.upcomingWatches.v1';
const DESKTOP_UPCOMING_WATCHES_EVENT = 'streamnyaa.desktop.upcomingWatches.changed';
export const DESKTOP_RELEASE_SUBSCRIPTIONS_KEY = 'streamnyaa.desktop.releaseSubscriptions.v2';
export const DESKTOP_RELEASE_EPISODES_KEY = 'streamnyaa.desktop.releaseEpisodes.v2';
const RELEASE_EVENT = 'streamnyaa.desktop.releaseSubscriptions.changed';

export type DesktopReleaseSubscription = {
  id: string; title: string; sourceIdentity: SourceIdentity; anilistId?: number; malId?: number;
  createdAt: number; oneShotEpisode?: number; reminderOffsetMinutes: number;
};
export type DesktopReleaseEpisode = {
  key: string; animeId: string; episode: number; airingAt: number; previousAiringAt?: number;
  beforeNotifiedAt?: number; airedNotifiedAt?: number; availableNotifiedAt?: number; blocked: boolean;
};
type NativeReminderState = { version: 2; subscriptions: DesktopReleaseSubscription[]; episodes: DesktopReleaseEpisode[]; availability: DesktopAvailabilityRecord[] };

function nativeInvoke() { return typeof window === 'undefined' ? undefined : window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke; }
function readArray<T>(key: string): T[] {
  try { const value = JSON.parse(window.localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
export function readDesktopReleaseSubscriptions(): DesktopReleaseSubscription[] {
  if (typeof window === 'undefined') return [];
  return readArray<DesktopReleaseSubscription>(DESKTOP_RELEASE_SUBSCRIPTIONS_KEY).filter(value => value && /^(anilist|mal):[1-9]\d*$/.test(value.id)
    && value.sourceIdentity?.animeId === value.id && typeof value.title === 'string' && Number.isFinite(value.createdAt)).slice(0, 200);
}
export function readDesktopReleaseEpisodes(): DesktopReleaseEpisode[] {
  return typeof window === 'undefined' ? [] : readArray<DesktopReleaseEpisode>(DESKTOP_RELEASE_EPISODES_KEY)
    .filter(value => value && /^(anilist|mal):[1-9]\d*$/.test(value.animeId) && Number.isInteger(value.episode) && value.episode > 0 && Number.isFinite(value.airingAt)).slice(0, 1200);
}
function releaseChanged() { window.dispatchEvent(new CustomEvent(RELEASE_EVENT)); }
export function subscribeDesktopReleaseSubscriptions(listener: () => void) {
  const storage = (event: StorageEvent) => { if ([DESKTOP_RELEASE_SUBSCRIPTIONS_KEY, DESKTOP_RELEASE_EPISODES_KEY].includes(event.key || '')) listener(); };
  window.addEventListener(RELEASE_EVENT, listener); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(RELEASE_EVENT, listener); window.removeEventListener('storage', storage); };
}
function applyNativeReminderState(state: NativeReminderState) {
  if (state?.version !== 2 || !Array.isArray(state.subscriptions) || !Array.isArray(state.episodes)) return;
  window.localStorage.setItem(DESKTOP_RELEASE_SUBSCRIPTIONS_KEY, JSON.stringify(state.subscriptions));
  window.localStorage.setItem(DESKTOP_RELEASE_EPISODES_KEY, JSON.stringify(state.episodes));
  state.availability?.forEach(record => recordDesktopAvailability(record, false));
  releaseChanged();
}
export async function writeDesktopReleaseSubscriptions(subscriptions: DesktopReleaseSubscription[]) {
  const invoke = nativeInvoke();
  if (invoke) {
    const state = await invoke<NativeReminderState>('sync_desktop_reminder_subscriptions', { subscriptions });
    applyNativeReminderState(state);
  } else {
    window.localStorage.setItem(DESKTOP_RELEASE_SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions)); releaseChanged();
  }
}
export function releaseSubscriptionForAnime(anime: any, oneShotEpisode?: number): DesktopReleaseSubscription | null {
  const id = desktopCanonicalAnimeId(anime);
  if (!id) return null;
  const identity = buildSourceIdentity(anime);
  return { id, title: String(anime.title_english || anime.title || anime.title_romaji || 'Anime').trim(),
    sourceIdentity: { ...identity, animeId: id, aliases: identity.aliases.slice(0,20).map(value=>value.slice(0,500)), installmentAliases: identity.installmentAliases.slice(0,20).map(value=>value.slice(0,500)) },
    anilistId: Number(anime.anilist_id || anime.anilistId) || undefined, malId: Number(anime.mal_id || anime.malId) || undefined,
    createdAt: Date.now(), oneShotEpisode, reminderOffsetMinutes: DESKTOP_REMINDER_OFFSET_MINUTES };
}
export async function toggleDesktopReleaseSubscription(anime: any) {
  const sub = releaseSubscriptionForAnime(anime);
  if (!sub) return { saved: false, removed: false, permission: 'error' as DesktopNotificationPermission };
  const current = readDesktopReleaseSubscriptions();
  if (current.some(value => value.id === sub.id)) {
    await writeDesktopReleaseSubscriptions(current.filter(value => value.id !== sub.id));
    return { saved: false, removed: true, permission: await getDesktopNotificationPermission() };
  }
  const permission = await requestDesktopNotificationPermission();
  if (permission !== 'granted') return { saved: false, removed: false, permission };
  await writeDesktopReleaseSubscriptions([...current, sub]);
  await reconcileDesktopReminderSchedule([anime]);
  return { saved: true, removed: false, permission };
}

/** Reconcile by qualified identity. Legacy ambiguous IDs wait for one unique catalog match. */
export async function reconcileDesktopReminderSchedule(items: any[]) {
  const invoke = nativeInvoke();
  const current = readDesktopReleaseSubscriptions();
  const legacy = readDesktopScheduleReminders().filter(value => !value.firedAt);
  const migrated = new Map<string, string>();
  for (const reminder of legacy) {
    const upcoming = readDesktopUpcomingAnimeWatches().find(value => `${value.id}:airing` === reminder.id);
    const matches = items.filter(anime => upcoming?.anilistId ? String(anime.anilist_id || anime.anilistId) === upcoming.anilistId
      : upcoming?.malId ? String(anime.mal_id || anime.malId) === upcoming.malId
        : [anime.anilist_id || anime.anilistId,anime.mal_id || anime.malId].some(id=>id && String(id) === String(reminder.animeId))
          && normalizeSourceTitle(String(anime.title_english || anime.title || anime.title_romaji || '')) === normalizeSourceTitle(reminder.title));
    const identities = new Set(matches.map(desktopCanonicalAnimeId));
    if (identities.size !== 1 || !matches.length) continue;
    const anime = matches[0]; const episode = Number(reminder.episode);
    if (!Number.isInteger(episode) || episode <= 0) continue;
    const sub = releaseSubscriptionForAnime(anime);
    if (!sub) continue;
    sub.reminderOffsetMinutes = reminder.reminderOffsetMinutes;
    if (!current.some(value => value.id === sub.id)) current.push(sub);
    migrated.set(reminder.id, sub.id);
  }
  if (migrated.size) await writeDesktopReleaseSubscriptions(current);
  const schedule: Array<{animeId:string;episode:number;airingAt:number;blocked:boolean;reminderOffsetMinutes?:number}> = items.flatMap(anime => {
    // Existing release bells follow the original broadcast. Dub/Sub revisions
    // have their own track-qualified schedule-change alerts.
    if (anime.releaseTrack && anime.releaseTrack !== 'original') return [];
    const id = desktopCanonicalAnimeId(anime);
    const sub = current.find(value => value.id === id);
    const episode = Number(anime.airingEpisode || anime.episode || anime.nextAiringEpisode?.episode);
    const raw = Number(anime.airingAt || anime.nextAiringEpisode?.airingAt);
    const airingAt = raw > 1e12 ? raw : raw * 1000;
    if (!sub || !Number.isInteger(episode) || episode <= 0 || !Number.isFinite(airingAt) || airingAt <= 0 || sub.oneShotEpisode && sub.oneShotEpisode !== episode) return [];
    const text = ['scheduleStatus','airingStatus','broadcastStatus','episodeStatus','releaseStatus','delayStatus','status','message','notice'].map(key => String(anime[key] || '')).join(' ');
    const blocked = ['cancelled','canceled','isCancelled','isCanceled','postponed','isPostponed','isDelayed','delayed'].some(key => anime[key]) || /cancel|postpone|suspend|hiatus|delay/i.test(text);
    return [{ animeId:id, episode, airingAt, blocked }];
  });
  // Preserve exact scheduled episodes from legacy records even when the latest schedule moved on.
  for (const reminder of legacy.filter(value => migrated.has(value.id))) {
    const id = migrated.get(reminder.id)!;
    const existing=schedule.find(value => value.animeId === id && value.episode === Number(reminder.episode));
    if (existing) existing.reminderOffsetMinutes=reminder.reminderOffsetMinutes;
    else schedule.push({ animeId:id, episode:Number(reminder.episode), airingAt:reminder.airingAt, blocked:false,reminderOffsetMinutes:reminder.reminderOffsetMinutes });
  }
  if (invoke && schedule.length) await invoke('reconcile_desktop_reminder_schedule', { items: schedule });
  if (migrated.size) writeDesktopScheduleReminders(readDesktopScheduleReminders().filter(value => !migrated.has(value.id)));
}

/** Native timers keep working while the window is hidden; this bridge only mirrors durable state. */
export async function startDesktopReminderBridge() {
  const invoke = nativeInvoke(); const listen = window.__TAURI__?.event?.listen;
  if (!invoke || !listen) return () => {};
  const unlisten = await listen<NativeReminderState>('streamnyaa-reminders-changed', event => applyNativeReminderState(event.payload));
  const unavailability = await listen<DesktopAvailabilityRecord>('streamnyaa-source-availability', event => recordDesktopAvailability(event.payload, false));
  const local = readDesktopReleaseSubscriptions();
  const localAvailability = readDesktopAvailabilityRecords();
  const hadLocal = window.localStorage.getItem(DESKTOP_RELEASE_SUBSCRIPTIONS_KEY) !== null;
  const permission = async () => { const granted = await getDesktopNotificationPermission(); await invoke('set_desktop_reminder_permission', { granted: granted === 'granted' }); };
  const syncAvailability = async (records: DesktopAvailabilityRecord[]) => {
    for (const record of records) await invoke('record_desktop_source_availability', { record });
  };
  const importReminders = () => { void (async () => {
    const records = readDesktopAvailabilityRecords();
    const state = await invoke<NativeReminderState>('sync_desktop_reminder_subscriptions', { subscriptions: readDesktopReleaseSubscriptions(), episodes: readDesktopReleaseEpisodes() });
    applyNativeReminderState(state);
    await syncAvailability(records);
  })().catch(() => undefined); };
  try {
    const native = await invoke<NativeReminderState>('get_desktop_reminder_state', {});
    if (hadLocal) {
      const state = await invoke<NativeReminderState>('sync_desktop_reminder_subscriptions', { subscriptions: local, episodes: readDesktopReleaseEpisodes() });
      applyNativeReminderState(state);
    } else applyNativeReminderState(native);
    await syncAvailability(localAvailability);
    await permission();
  } catch (error) { unlisten(); unavailability(); throw error; }
  window.addEventListener('focus', permission);
  window.addEventListener('streamnyaa.desktop.reminders.imported', importReminders);
  return () => { unlisten(); unavailability(); window.removeEventListener('focus', permission); window.removeEventListener('streamnyaa.desktop.reminders.imported', importReminders); };
}

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
  const animeId = desktopCanonicalAnimeId(anime);
  return animeId ? `upcoming:${animeId}` : '';
}

function upcomingWatchMatches(watch: DesktopUpcomingAnimeWatch, anime: any) {
  const anilist=String(anime?.anilist_id || anime?.anilistId || '');
  const mal=String(anime?.mal_id || anime?.malId || '');
  const pairs=[[watch.anilistId,anilist],[watch.malId,mal]].filter(([left,right])=>left && right);
  if (pairs.length) return pairs.every(([left,right])=>left===right);
  if (watch.anilistId || watch.malId) return false;
  if (watch.animeId?.includes(':')) return watch.animeId === desktopCanonicalAnimeId(anime);
  return Boolean(watch.animeId && [anilist,mal].includes(watch.animeId)
    && normalizeSourceTitle(watch.title)===normalizeSourceTitle(String(anime?.title_english || anime?.title || anime?.title_romaji || '')));
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
  return Boolean(id && readDesktopUpcomingAnimeWatches().some((watch) => watch.id === id || upcomingWatchMatches(watch,anime)))
    || readDesktopReleaseSubscriptions().some(value => value.id === desktopCanonicalAnimeId(anime));
}

export async function toggleDesktopUpcomingAnimeWatch(anime: any) {
  const id = upcomingWatchId(anime);
  const title = String(anime?.title_english || anime?.title || anime?.title_romaji || 'Upcoming anime').trim();
  if (!id) return { saved: false, removed: false, permission: 'error' as DesktopNotificationPermission };
  const current = readDesktopUpcomingAnimeWatches();
  const existing=current.find(watch=>watch.id===id || upcomingWatchMatches(watch,anime));
  if (existing) {
    writeDesktopUpcomingAnimeWatches(current.filter((watch) => watch.id !== existing.id));
    writeDesktopScheduleReminders(readDesktopScheduleReminders().filter((reminder) => reminder.id !== `${existing.id}:airing`));
    if (nativeInvoke()) await writeDesktopReleaseSubscriptions(readDesktopReleaseSubscriptions().filter(value => value.id !== desktopCanonicalAnimeId(anime)));
    return { saved: false, removed: true, permission: await getDesktopNotificationPermission() };
  }
  if (readDesktopReleaseSubscriptions().some(value => value.id === desktopCanonicalAnimeId(anime))) {
    await writeDesktopReleaseSubscriptions(readDesktopReleaseSubscriptions().filter(value => value.id !== desktopCanonicalAnimeId(anime)));
    return { saved: false, removed: true, permission: await getDesktopNotificationPermission() };
  }
  const permission = await requestDesktopNotificationPermission();
  if (permission !== 'granted') return { saved: false, removed: false, permission };
  const rawAiringAt = Number(anime?.nextAiringEpisode?.airingAt || anime?.airingAt || 0);
  const airingAt = rawAiringAt > 1_000_000_000_000 ? rawAiringAt : rawAiringAt > 0 ? rawAiringAt * 1000 : undefined;
  const episode = Number(anime?.nextAiringEpisode?.episode || anime?.airingEpisode || 1);
  const next: DesktopUpcomingAnimeWatch = {
    id,
    animeId: desktopCanonicalAnimeId(anime) || undefined,
    anilistId: String(anime?.anilist_id || anime?.anilistId || '').trim() || undefined,
    malId: String(anime?.mal_id || anime?.malId || '').trim() || undefined,
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
  if (nativeInvoke()) {
    const subscription = releaseSubscriptionForAnime(anime);
    if (subscription) {
      subscription.reminderOffsetMinutes = 0;
      await writeDesktopReleaseSubscriptions([...readDesktopReleaseSubscriptions().filter(value => value.id !== subscription.id), subscription]);
      await reconcileDesktopReminderSchedule([anime]);
    }
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
    const matches=scheduleItems.filter(anime=>upcomingWatchMatches(watch,anime));
    const match=new Set(matches.map(desktopCanonicalAnimeId)).size===1 ? matches[0] : undefined;
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
  if (current !== 'default') {
    const invoke = nativeInvoke();
    if (invoke) void invoke('set_desktop_reminder_permission', { granted: current === 'granted' }).catch(() => undefined);
    return current;
  }
  try {
    const result = await requestPermission();
    const permission = result === 'granted' || result === 'denied' ? result : 'default';
    const invoke = nativeInvoke();
    if (invoke) void invoke('set_desktop_reminder_permission', { granted: permission === 'granted' }).catch(() => undefined);
    return permission;
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
