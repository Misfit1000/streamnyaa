import { desktopCanonicalAnimeId } from './desktopAvailability';
const SCHEDULE_REVISION_STORAGE_KEY = 'streamnyaa.desktop.schedule-revisions.v1';
export const DESKTOP_SCHEDULE_UPDATES_KEY = 'streamnyaa.desktop.schedule-updates.v1';
export const DESKTOP_SCHEDULE_UPDATE_PREFERENCES_KEY = 'streamnyaa.desktop.schedule-update-preferences.v1';
const DESKTOP_SCHEDULE_UPDATES_EVENT = 'streamnyaa.desktop.schedule-updates.changed';
const MAX_SCHEDULE_RECORDS = 1200;
const RECORD_RETENTION_MS = 1000 * 60 * 60 * 24 * 60;
const MINIMUM_TIME_CHANGE_MS = 1000 * 60;

export type DesktopScheduleRevisionRecord = {
  key: string;
  animeId: string;
  episode: number;
  airingAt: number;
  previousAiringAt?: number;
  firstSeenAt: number;
  lastSeenAt: number;
  changedAt?: number;
  snapshot?: any;
  releaseTrack?: string;
};

type ScheduleRevisionSnapshot = {
  version: 1;
  records: DesktopScheduleRevisionRecord[];
};

export type DesktopScheduleUpdate = {
  id: string;
  key: string;
  animeId: string;
  anilistId?: string;
  malId?: string;
  title: string;
  episode: number;
  previousAiringAt: number;
  airingAt: number;
  detectedAt: number;
  kind: 'delayed' | 'cancelled' | 'postponed' | 'on break' | 'rescheduled';
  releaseTrack?: string;
};

export type DesktopScheduleUpdatePreferences = {
  personal: boolean;
  global: boolean;
  lastReadAt: number;
};

export const DEFAULT_DESKTOP_SCHEDULE_UPDATE_PREFERENCES: DesktopScheduleUpdatePreferences = {
  personal: true,
  global: true,
  lastReadAt: 0,
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function finitePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizedAiringAtMs(value: unknown) {
  const parsed = finitePositiveNumber(value);
  if (!parsed) return 0;
  return parsed > 1_000_000_000_000 ? Math.round(parsed) : Math.round(parsed * 1000);
}

function explicitScheduleAlertKind(anime: any): DesktopScheduleUpdate['kind'] | null {
  const statusText = [
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
  ]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ')
    .toLowerCase();
  if (
    anime?.cancelled
    || anime?.canceled
    || anime?.isCancelled
    || anime?.isCanceled
    || /\b(cancelled|canceled|cancelation|cancellation)\b/.test(statusText)
  ) return 'cancelled';
  if (anime?.postponed || anime?.isPostponed || /\bpostponed\b/.test(statusText)) return 'postponed';
  if (/\b(hiatus|break)\b/.test(statusText)) return 'on break';
  if (anime?.delayed || anime?.isDelayed || /\b(delayed|delay|delayed-air)\b/.test(statusText)) return 'delayed';
  return null;
}

export function scheduleRevisionKey(anime: any) {
  const animeId = desktopCanonicalAnimeId(anime);
  const episode = Math.floor(finitePositiveNumber(anime?.airingEpisode || anime?.episode));
  return animeId && episode ? `${animeId}:episode-${episode}:${anime?.releaseTrack || 'original'}` : '';
}

function validRecord(record: unknown): record is DesktopScheduleRevisionRecord {
  if (!record || typeof record !== 'object') return false;
  const candidate = record as DesktopScheduleRevisionRecord;
  return Boolean(
    candidate.key
    && candidate.animeId
    && Number.isFinite(candidate.episode)
    && candidate.episode > 0
    && Number.isFinite(candidate.airingAt)
    && candidate.airingAt >= 0
    && Number.isFinite(candidate.firstSeenAt)
    && Number.isFinite(candidate.lastSeenAt),
  );
}

export function readScheduleRevisionRecords(storage?: StorageLike | null) {
  if (!storage) return [] as DesktopScheduleRevisionRecord[];
  try {
    const parsed = JSON.parse(storage.getItem(SCHEDULE_REVISION_STORAGE_KEY) || 'null') as ScheduleRevisionSnapshot | null;
    if (parsed?.version !== 1 || !Array.isArray(parsed.records)) return [];
    return parsed.records.filter(validRecord);
  } catch {
    return [];
  }
}

export function reconcileScheduleRevisions(
  items: any[],
  previousRecords: DesktopScheduleRevisionRecord[],
  now = Date.now(),
) {
  const updates: DesktopScheduleUpdate[] = [];
  const recordsByKey = new Map(
    previousRecords
      .filter(validRecord)
      .map((record) => [record.key, record]),
  );

  const enrichedItems = items.map((anime) => {
    const key = scheduleRevisionKey(anime);
    const airingAt = normalizedAiringAtMs(anime?.airingAt);
    if (!key || (!airingAt && !explicitScheduleAlertKind(anime))) return anime;

    const [animeId] = key.split(':episode-');
    const episode = Math.floor(finitePositiveNumber(anime?.airingEpisode || anime?.episode));
    const legacyKey = `${anime?.anilist_id || anime?.mal_id || anime?.id}:episode-${episode}`;
    const previous = recordsByKey.get(key) || (!anime.releaseTrack || anime.releaseTrack === 'original' ? recordsByKey.get(legacyKey) : undefined);
    if (previous && previous.key !== key) recordsByKey.delete(previous.key);
    const explicitAlert = explicitScheduleAlertKind(anime);
    const changed = Boolean(
      previous && previous.airingAt > 0 && airingAt > 0
      && Math.abs(previous.airingAt - airingAt) >= MINIMUM_TIME_CHANGE_MS,
    );
    const previousAiringAt = normalizedAiringAtMs(anime.previousAiringAt) || (changed || !airingAt ? previous?.airingAt || previous?.previousAiringAt : previous?.previousAiringAt);

    if (explicitAlert) {
      const anilistId = String(anime?.anilist_id || anime?.id || '').trim() || undefined;
      const malId = String(anime?.mal_id || '').trim() || undefined;
      updates.push({
        id: `${key}:${explicitAlert}:${airingAt}`,
        key,
        animeId,
        anilistId,
        malId,
        title: String(anime?.title_english || anime?.title || anime?.title_japanese || 'Anime').trim(),
        episode,
        previousAiringAt: previousAiringAt || previous?.airingAt || airingAt,
        releaseTrack: anime.releaseTrack || 'original',
        airingAt,
        detectedAt: now,
        kind: explicitAlert,
      });
    }

    recordsByKey.set(key, {
      key,
      animeId,
      episode,
      airingAt,
      previousAiringAt,
      firstSeenAt: previous?.firstSeenAt || now,
      lastSeenAt: now,
      changedAt: changed ? now : previous?.changedAt,
      snapshot: { ...anime, previousAiringAt }, releaseTrack: anime.releaseTrack || 'original',
    });

    if (explicitAlert) return { ...anime, previousAiringAt };
    if (!previousAiringAt || previousAiringAt === airingAt) return anime;
    return {
      ...anime,
      scheduleStatus: 'rescheduled',
      rescheduled: true,
      previousAiringAt,
      scheduleChangedAt: changed ? now : previous?.changedAt,
      scheduleRevisionSource: 'anilist-schedule-change',
    };
  });

  const records = [...recordsByKey.values()]
    .filter((record) => record.lastSeenAt >= now - RECORD_RETENTION_MS)
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
    .slice(0, MAX_SCHEDULE_RECORDS);

  const visibleKeys = new Set(enrichedItems.map(scheduleRevisionKey));
  for (const record of records) if (record.snapshot && explicitScheduleAlertKind(record.snapshot) && !visibleKeys.has(record.key)) {
    enrichedItems.push({ ...record.snapshot, scheduleLastReportedAt: record.lastSeenAt });
  }
  return { items: enrichedItems, records, updates };
}

function normalizeScheduleUpdate(value: any): DesktopScheduleUpdate | null {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  const key = String(value.key || '').trim();
  const animeId = String(value.animeId || '').trim();
  const title = String(value.title || '').trim();
  const episode = Math.floor(finitePositiveNumber(value.episode));
  const previousAiringAt = normalizedAiringAtMs(value.previousAiringAt);
  const airingAt = normalizedAiringAtMs(value.airingAt);
  const detectedAt = finitePositiveNumber(value.detectedAt);
  if (!id || !key || !animeId || !title || !episode || !detectedAt) return null;
  const kind: DesktopScheduleUpdate['kind'] | null = ['cancelled','delayed','postponed','on break','rescheduled'].includes(value.kind) ? value.kind : null;
  if (!kind) return null;
  return {
    id,
    key,
    animeId,
    anilistId: String(value.anilistId || '').trim() || undefined,
    malId: String(value.malId || '').trim() || undefined,
    title,
    episode,
    previousAiringAt,
    airingAt,
    detectedAt,
    releaseTrack: ['original','sub','dub'].includes(value.releaseTrack) ? value.releaseTrack : 'original',
    kind,
  };
}

export function readDesktopScheduleUpdates(
  storage: StorageLike | null = typeof window === 'undefined' ? null : window.localStorage,
) {
  if (!storage) return [] as DesktopScheduleUpdate[];
  try {
    const parsed = JSON.parse(storage.getItem(DESKTOP_SCHEDULE_UPDATES_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeScheduleUpdate)
      .filter((item): item is DesktopScheduleUpdate => Boolean(item))
      .sort((left, right) => right.detectedAt - left.detectedAt);
  } catch {
    return [];
  }
}

export function loadDesktopScheduleUpdatePreferences(
  storage: StorageLike | null = typeof window === 'undefined' ? null : window.localStorage,
): DesktopScheduleUpdatePreferences {
  if (!storage) return { ...DEFAULT_DESKTOP_SCHEDULE_UPDATE_PREFERENCES };
  try {
    const parsed = JSON.parse(storage.getItem(DESKTOP_SCHEDULE_UPDATE_PREFERENCES_KEY) || 'null');
    return {
      personal: typeof parsed?.personal === 'boolean' ? parsed.personal : true,
      global: typeof parsed?.global === 'boolean' ? parsed.global : true,
      lastReadAt: finitePositiveNumber(parsed?.lastReadAt),
    };
  } catch {
    return { ...DEFAULT_DESKTOP_SCHEDULE_UPDATE_PREFERENCES };
  }
}

export function saveDesktopScheduleUpdatePreferences(
  preferences: DesktopScheduleUpdatePreferences,
  storage: StorageLike | null = typeof window === 'undefined' ? null : window.localStorage,
) {
  const normalized: DesktopScheduleUpdatePreferences = {
    personal: Boolean(preferences.personal),
    global: Boolean(preferences.global),
    lastReadAt: finitePositiveNumber(preferences.lastReadAt),
  };
  if (storage) {
    try {
      storage.setItem(DESKTOP_SCHEDULE_UPDATE_PREFERENCES_KEY, JSON.stringify(normalized));
      if (typeof window !== 'undefined' && storage === window.localStorage) {
        window.dispatchEvent(new CustomEvent(DESKTOP_SCHEDULE_UPDATES_EVENT));
      }
    } catch {
      // Preferences remain usable for the current render when storage is unavailable.
    }
  }
  return normalized;
}

export function markDesktopScheduleUpdatesRead(now = Date.now()) {
  const preferences = loadDesktopScheduleUpdatePreferences();
  return saveDesktopScheduleUpdatePreferences({ ...preferences, lastReadAt: now });
}

export function subscribeDesktopScheduleUpdates(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === DESKTOP_SCHEDULE_UPDATES_KEY
      || event.key === DESKTOP_SCHEDULE_UPDATE_PREFERENCES_KEY
    ) listener();
  };
  window.addEventListener(DESKTOP_SCHEDULE_UPDATES_EVENT, listener);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(DESKTOP_SCHEDULE_UPDATES_EVENT, listener);
    window.removeEventListener('storage', handleStorage);
  };
}

export function enrichDesktopScheduleRevisions(
  items: any[],
  storage: StorageLike | null = typeof window === 'undefined' ? null : window.localStorage,
  now = Date.now(),
) {
  const result = reconcileScheduleRevisions(items, readScheduleRevisionRecords(storage), now);
  if (storage) {
    try {
      const snapshot: ScheduleRevisionSnapshot = { version: 1, records: result.records };
      storage.setItem(SCHEDULE_REVISION_STORAGE_KEY, JSON.stringify(snapshot));
      if (result.updates.length) {
        const mergedUpdates = [...readDesktopScheduleUpdates(storage), ...result.updates]
          .filter((update, index, all) => index === all.findIndex((candidate) => candidate.id === update.id))
          .filter((update) => update.detectedAt >= now - RECORD_RETENTION_MS)
          .sort((left, right) => right.detectedAt - left.detectedAt)
          .slice(0, 100);
        storage.setItem(DESKTOP_SCHEDULE_UPDATES_KEY, JSON.stringify(mergedUpdates));
        if (typeof window !== 'undefined' && storage === window.localStorage) {
          window.dispatchEvent(new CustomEvent(DESKTOP_SCHEDULE_UPDATES_EVENT));
        }
      }
    } catch {
      // Schedule rendering must remain usable when storage is unavailable or full.
    }
  }
  return result.items;
}

/** Native and frontend observations share Bell identity and never reset first-detection timestamps. */
export function mergeDesktopScheduleUpdates(updates: DesktopScheduleUpdate[]) {
  const merged = [...readDesktopScheduleUpdates(), ...updates].map(normalizeScheduleUpdate)
    .filter((item): item is DesktopScheduleUpdate => Boolean(item))
    .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index)
    .sort((a,b) => b.detectedAt-a.detectedAt).slice(0,1200);
  localStorage.setItem(DESKTOP_SCHEDULE_UPDATES_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent(DESKTOP_SCHEDULE_UPDATES_EVENT));
}
