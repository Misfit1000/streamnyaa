/** Public source evidence, shared by catalog cards and release reminders. */
export type DesktopAvailabilityRecord = {
  key: string;
  animeId: string;
  episode?: number;
  scope: 'title' | 'episode';
  status: 'available' | 'unavailable' | 'unknown';
  checkedAt: number;
  expiresAt: number;
  complete: boolean;
  evidence?: string;
  sourceHash?: string;
  sourceTitle?: string;
  playableEpisode?: number;
  classifierVersion?: number;
  identitySignature?: string;
  sourceTier?: 'exact' | 'compatible';
  anilistId?: number;
  malId?: number;
};

export const DESKTOP_AVAILABILITY_KEY = 'streamnyaa.desktop.sourceAvailability.v1';
const CHANGED = 'streamnyaa.desktop.sourceAvailability.changed';
const MAX_RECORDS = 1200;

export function desktopCanonicalAnimeId(anime: any): string {
  if (typeof anime === 'string' && /^(anilist|mal):[1-9]\d*$/.test(anime)) return anime;
  // A provider-neutral `id` is not evidence of an AniList identity.
  const anilist = Number(anime?.anilist_id || anime?.anilistId);
  const mal = Number(anime?.mal_id || anime?.malId);
  return Number.isInteger(anilist) && anilist > 0 ? `anilist:${anilist}`
    : Number.isInteger(mal) && mal > 0 ? `mal:${mal}` : '';
}

export function desktopAvailabilityKey(anime: any, episode?: number) {
  const id = desktopCanonicalAnimeId(anime);
  return id ? `${id}:${episode && Number.isInteger(episode) ? `episode-${episode}` : 'title'}` : '';
}

function valid(value: any): value is DesktopAvailabilityRecord {
  return Boolean(value && /^(anilist|mal):[1-9]\d*$/.test(value.animeId)
    && value.key === desktopAvailabilityKey(value.animeId, value.scope === 'episode' ? value.episode : undefined)
    && ['title', 'episode'].includes(value.scope) && ['available', 'unavailable', 'unknown'].includes(value.status)
    && Number.isFinite(value.checkedAt) && value.checkedAt >= 0 && value.checkedAt <= Date.now() + 60_000
    && Number.isFinite(value.expiresAt) && value.expiresAt > value.checkedAt && value.expiresAt <= value.checkedAt + 30 * 86_400_000
    && (value.scope !== 'episode' || Number.isInteger(value.episode) && value.episode > 0)
    && (value.scope !== 'title' || value.episode == null)
    && (value.sourceHash == null || typeof value.sourceHash === 'string' && /^(?:[a-f0-9]{40}|[A-Z2-7]{32})$/i.test(value.sourceHash))
    && (value.sourceTitle == null || typeof value.sourceTitle === 'string' && value.sourceTitle.length <= 1000)
    && (value.identitySignature == null || typeof value.identitySignature === 'string' && value.identitySignature.length <= 16000)
    && (value.playableEpisode == null || Number.isInteger(value.playableEpisode) && value.playableEpisode > 0 && (value.scope !== 'episode' || value.episode === value.playableEpisode))
    && typeof value.complete === 'boolean');
}

export function readDesktopAvailabilityRecords(): DesktopAvailabilityRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(DESKTOP_AVAILABILITY_KEY) || '[]');
    return Array.isArray(value) ? value.filter(valid).slice(0, MAX_RECORDS) : [];
  } catch { return []; }
}

/** Merge a backup without allowing older evidence to replace a newer local check. */
export function importDesktopAvailabilityRecords(payload: string) {
  let records: unknown;
  try { records = JSON.parse(payload); } catch { return 0; }
  if (!Array.isArray(records)) return 0;
  const accepted = records.filter(valid).slice(0, MAX_RECORDS);
  accepted.forEach(record => recordDesktopAvailability(record, false));
  window.dispatchEvent(new CustomEvent(CHANGED));
  return accepted.length;
}

export function readDesktopAvailability(anime: any, episode?: number, now = Date.now()) {
  const key = desktopAvailabilityKey(anime, episode);
  return readDesktopAvailabilityRecords().find(record => record.key === key && record.checkedAt <= now + 60_000 && record.expiresAt > now) || null;
}

export function isDesktopTitleUnavailable(anime: any, now = Date.now()) {
  const record = readDesktopAvailability(anime, undefined, now);
  return record?.status === 'unavailable' && record.complete === true;
}

export function recordDesktopAvailability(record: DesktopAvailabilityRecord, syncNative = true) {
  if (typeof window === 'undefined' || !valid(record)) return;
  const old = readDesktopAvailabilityRecords();
  if (old.some(value => value.key === record.key && value.checkedAt > record.checkedAt)) return;
  // An interrupted refresh cannot erase still-valid positive or complete negative evidence.
  const prior = old.find(value => value.key === record.key);
  if (record.status === 'unknown' && prior && prior.expiresAt > Date.now() && prior.status !== 'unknown') return;
  // Calendar's lightweight positive probes omit the source proof. Keep the
  // existing proof at its original age rather than replacing it with metadata.
  if (record.status === 'available' && !record.sourceHash && prior?.status === 'available' && prior.sourceHash && prior.expiresAt > Date.now()) return;
  try {
    const next = [record, ...old.filter(value => value.key !== record.key && value.expiresAt > Date.now())].slice(0, MAX_RECORDS);
    window.localStorage.setItem(DESKTOP_AVAILABILITY_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGED));
    const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    if (syncNative && invoke) void invoke('record_desktop_source_availability', { record }).catch(() => undefined);
  } catch { /* Evidence caching must not block catalog navigation. */ }
}

export function subscribeDesktopAvailability(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === DESKTOP_AVAILABILITY_KEY) listener(); };
  window.addEventListener(CHANGED, listener);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(CHANGED, listener); window.removeEventListener('storage', storage); };
}
