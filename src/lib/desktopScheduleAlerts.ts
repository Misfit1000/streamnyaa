import { useStore } from '../store/useStore';
import { desktopCanonicalAnimeId } from './desktopAvailability';
import { loadDesktopWatchedSeries, subscribeDesktopWatchProgress } from './desktop';
import { loadDesktopScheduleUpdatePreferences, mergeDesktopScheduleUpdates, scheduleRevisionKey, subscribeDesktopScheduleUpdates, type DesktopScheduleUpdate } from './scheduleRevisions';
export const SCHEDULE_ALERT_STATE_KEY = 'streamnyaa.desktop.schedule-alert-state.v1';
const eventName = 'streamnyaa-schedule-tracks';
type AlertState = { version: number; tracks: any[]; changes: DesktopScheduleUpdate[]; error?: string | null };
export function readScheduleAlertState(): AlertState {
  try { const state = JSON.parse(localStorage.getItem(SCHEDULE_ALERT_STATE_KEY) || 'null');
    return state?.version === 1 && Array.isArray(state.tracks) && Array.isArray(state.changes) ? state : { version: 1, tracks: [], changes: [] };
  } catch { return { version: 1, tracks: [], changes: [] }; }
}
export function scheduleUpdateIsPersonal(update: DesktopScheduleUpdate, list: any[] = [...useStore.getState().myList, ...useStore.getState().likedAnimes], history = loadDesktopWatchedSeries()) {
  return list.some(item => Boolean(update.anilistId && String(item.anilist_id) === String(update.anilistId)
    || update.malId && String(item.mal_id) === String(update.malId)))
    || history.some(record => {
      const id = String(record.animeId || '');
      if (id.includes(':')) return [update.anilistId ? `anilist:${update.anilistId}` : '', update.malId ? `mal:${update.malId}` : ''].includes(id);
      // Old History IDs lack a provider. Require the exact installment title too.
      const title = (value: string) => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
      return Boolean(id && [update.anilistId, update.malId].includes(id) && title(record.title) === title(update.title));
    });
}
export function subscribeScheduleTracks(listener: () => void) {
  window.addEventListener(eventName, listener); return () => window.removeEventListener(eventName, listener);
}
export function mergeScheduleTracks(base: any[], tracks: any[]) {
  const merged = new Map(base.map(item => [scheduleRevisionKey(item), { ...item, releaseTrack: item.releaseTrack || 'original' }]));
  for (const track of tracks) {
    const counterpart = base.find(item => item.anilist_id && item.anilist_id === track.anilist_id || item.mal_id && item.mal_id === track.mal_id);
    const key = scheduleRevisionKey(track); if (!key) continue;
    merged.set(key, { ...counterpart, ...track, rescheduled: track.scheduleStatus === 'rescheduled',
      delayed: track.scheduleStatus === 'delayed', postponed: track.scheduleStatus === 'postponed',
      cancelled: track.scheduleStatus === 'cancelled', images: counterpart?.images || track.images });
  }
  return [...merged.values()];
}
export function scheduleDisplayTime(item: any) {
  const current = Number(item.airingAt) || 0;
  const prior = Number(item.previousAiringAt) || 0;
  return current || (prior > 1e12 ? prior / 1000 : prior);
}
export async function startScheduleAlertBridge() {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  const listen = window.__TAURI__?.event?.listen;
  if (!invoke || !listen) return () => {};
  let disposed = false; let timer: number | undefined; let lastConfig = '';
  const apply = (state: AlertState) => {
    if (disposed || state?.version !== 1) return;
    const snapshot = { version: 1, tracks: state.tracks, changes: state.changes, error: state.error };
    try {
      localStorage.setItem(SCHEDULE_ALERT_STATE_KEY, JSON.stringify(snapshot));
      mergeDesktopScheduleUpdates(state.changes);
    } catch { /* Durable native alerts continue; retain the last usable UI snapshot. */ }
    window.dispatchEvent(new Event(eventName));
  };
  const configure = async (imported?: AlertState) => {
    const prefs = loadDesktopScheduleUpdatePreferences(); const store = useStore.getState();
    const personalItems: any[] = [...store.myList, ...store.likedAnimes];
    const ids = new Set(personalItems.flatMap(item => [desktopCanonicalAnimeId(item),
      item.anilist_id ? `anilist:${item.anilist_id}` : '', item.mal_id ? `mal:${item.mal_id}` : '']).filter(Boolean));
    const history = loadDesktopWatchedSeries();
    for (const track of readScheduleAlertState().tracks) if (scheduleUpdateIsPersonal({ ...track, anilistId: track.anilist_id, malId: track.mal_id }, [...store.myList, ...store.likedAnimes], history)) ids.add(desktopCanonicalAnimeId(track));
    const preferences = { personal: prefs.personal, global: prefs.global, personalIds: [...ids].sort() };
    const config = JSON.stringify(preferences);
    if (config === lastConfig && !imported) return;
    const state = await invoke<AlertState>('configure_desktop_schedule_alerts', { preferences, imported });
    lastConfig = config; apply(state);
  };
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(() => void configure().catch(() => undefined), 500); };
  const unlisten = await listen<AlertState>('streamnyaa-schedule-alerts', event => { apply(event.payload); schedule(); });
  const unsubPrefs = subscribeDesktopScheduleUpdates(schedule), unsubStore = useStore.subscribe(schedule), unsubHistory = subscribeDesktopWatchProgress(schedule);
  const imported = () => { void configure(readScheduleAlertState()).catch(() => undefined); };
  window.addEventListener('streamnyaa.desktop.reminders.imported', imported);
  try { apply(await invoke<AlertState>('get_desktop_schedule_alerts', {})); await configure(); }
  catch { /* Existing saved schedule remains usable; ordinary sign-in is independent. */ }
  return () => { disposed = true; clearTimeout(timer); unlisten(); unsubPrefs(); unsubStore(); unsubHistory(); window.removeEventListener('streamnyaa.desktop.reminders.imported', imported); };
}
