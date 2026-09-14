const DESKTOP_SCHEDULE_CACHE_KEY = 'streamnyaa.desktop.schedule.v1';
const MAX_ENTRIES = 16;
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

export type DesktopScheduleCacheEntry = {
  key: string;
  savedAt: number;
  data: {
    data: any[];
    pagination?: Record<string, unknown>;
  };
};

function readEntries() {
  if (typeof window === 'undefined') return [] as DesktopScheduleCacheEntry[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DESKTOP_SCHEDULE_CACHE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => (
      typeof entry?.key === 'string'
      && Number.isFinite(entry?.savedAt)
      && Array.isArray(entry?.data?.data)
    ));
  } catch {
    return [];
  }
}

export function desktopScheduleCacheKey(start: number, end: number, nsfwMode: boolean) {
  return `${start}:${end}:${nsfwMode ? 'all' : 'safe'}`;
}

export function readDesktopSchedule(key: string, now = Date.now()) {
  const entry = readEntries().find((candidate) => candidate.key === key);
  if (!entry || now - entry.savedAt > MAX_AGE_MS) return null;
  return entry;
}

export function writeDesktopSchedule(key: string, data: DesktopScheduleCacheEntry['data'], now = Date.now()) {
  if (typeof window === 'undefined' || !Array.isArray(data?.data)) return;
  try {
    const next = [
      { key, savedAt: now, data },
      ...readEntries().filter((entry) => entry.key !== key && now - entry.savedAt <= MAX_AGE_MS),
    ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(DESKTOP_SCHEDULE_CACHE_KEY, JSON.stringify(next));
  } catch {
    // The live schedule remains usable when storage is unavailable or full.
  }
}
