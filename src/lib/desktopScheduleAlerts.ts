import { readCachedWatchTitles } from './desktopWatchSnapshot';
import { sameScheduleAnime, scheduleArtworkCandidates } from './desktopSchedulePresentation';
import { useStore } from '../store/useStore';
import { desktopCanonicalAnimeId } from './desktopAvailability';
import { loadDesktopWatchedSeries, subscribeDesktopWatchProgress } from './desktop';
import { loadDesktopScheduleUpdatePreferences, mergeDesktopScheduleUpdates, scheduleRevisionKey, subscribeDesktopScheduleUpdates, type DesktopScheduleUpdate } from './scheduleRevisions';
import { publishScheduleState, readScheduleAlertState, savedScheduleState, type AlertState } from './desktopScheduleState';
export { SCHEDULE_ALERT_STATE_KEY, readScheduleAlertState, type AlertState } from './desktopScheduleState';
const eventName = 'streamnyaa-schedule-tracks';
export function applyScheduleAlertState(state: AlertState) {
  if (state?.version !== 1 || !Array.isArray(state.tracks) || !Array.isArray(state.changes)) return;
  publishScheduleState(state);
  try { if (state.changes.length) mergeDesktopScheduleUpdates(state.changes); } catch { /* The live native snapshot remains readable. */ }
  window.dispatchEvent(new Event(eventName));
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
  const artworkSources = [...base, ...readCachedWatchTitles(), ...tracks];
  for (const track of tracks) {
    const counterpart = base.find(item => sameScheduleAnime(item, track));
    const key = scheduleRevisionKey(track); if (!key) continue;
    const artwork = artworkSources.find(item => sameScheduleAnime(item, track) && scheduleArtworkCandidates(item).length);
    merged.set(key, { ...counterpart, ...track, ...(artwork ? { image: scheduleArtworkCandidates(artwork)[0] } : {}), rescheduled: track.scheduleStatus === 'rescheduled',
      delayed: track.scheduleStatus === 'delayed', postponed: track.scheduleStatus === 'postponed',
      cancelled: track.scheduleStatus === 'cancelled', images: track.images || counterpart?.images });
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
  const legacy = savedScheduleState();
  let disposed = false; let timer: number | undefined; let lastConfig = '';
  const apply = (state: AlertState) => {
    if (disposed || state?.version !== 1) return;
    applyScheduleAlertState(state);
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
  const imported = () => { void configure(savedScheduleState()).catch(() => undefined); };
  window.addEventListener('streamnyaa.desktop.reminders.imported', imported);
  try {
    const current = await invoke<AlertState>('get_desktop_schedule_alerts', {});
    // Import a legacy browser snapshot before removing the duplicate cache.
    if (legacy.tracks.length || legacy.changes.length) await configure(legacy);
    else { apply(current); await configure(); }
  }
  catch { /* Existing saved schedule remains usable; ordinary sign-in is independent. */ }
  return () => { disposed = true; clearTimeout(timer); unlisten(); unsubPrefs(); unsubStore(); unsubHistory(); window.removeEventListener('streamnyaa.desktop.reminders.imported', imported); };
}
