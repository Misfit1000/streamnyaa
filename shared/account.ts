export type SharedLibraryItem<TAnime = unknown> = {
  animeId: string;
  animeTitle: string;
  anime: TAnime;
  bookmarked: boolean;
  liked: boolean;
  updatedAt: string;
};

export type SharedHistoryItem<TSource = unknown> = {
  key: string;
  source: TSource;
  updatedAt: string;
};

export const COMPLETION_PERCENT_THRESHOLD = 92;

export function isPlaybackComplete(progressPercent = 0, resumeSeconds = 0, durationSeconds = 0) {
  if (progressPercent >= COMPLETION_PERCENT_THRESHOLD) return true;
  return durationSeconds > 0 && resumeSeconds / durationSeconds >= COMPLETION_PERCENT_THRESHOLD / 100;
}

function timestamp(value?: string | number | null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeSharedLibrary<TAnime>(
  local: SharedLibraryItem<TAnime>[],
  remote: SharedLibraryItem<TAnime>[],
  limit = 500,
) {
  const merged = new Map<string, SharedLibraryItem<TAnime>>();
  [...remote, ...local].forEach((item) => {
    if (!item.animeId) return;
    const existing = merged.get(item.animeId);
    if (!existing) {
      merged.set(item.animeId, item);
      return;
    }
    const latest = timestamp(item.updatedAt) >= timestamp(existing.updatedAt) ? item : existing;
    merged.set(item.animeId, {
      ...latest,
      anime: latest.anime || existing.anime,
      animeTitle: latest.animeTitle || existing.animeTitle,
      bookmarked: Boolean(item.bookmarked || existing.bookmarked),
      liked: Boolean(item.liked || existing.liked),
    });
  });
  return [...merged.values()].filter((item) => item.bookmarked || item.liked).slice(0, limit);
}

export function mergeSharedHistory<TSource>(
  local: SharedHistoryItem<TSource>[],
  remote: SharedHistoryItem<TSource>[],
  limit: number,
) {
  const merged = new Map<string, SharedHistoryItem<TSource>>();
  [...remote, ...local].forEach((item) => {
    if (!item.key) return;
    const existing = merged.get(item.key);
    if (!existing || timestamp(item.updatedAt) >= timestamp(existing.updatedAt)) merged.set(item.key, item);
  });
  return [...merged.values()]
    .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))
    .slice(0, limit);
}
