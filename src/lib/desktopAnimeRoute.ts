import { extractNumericId, watchPath } from './slug';

function normalizedStatus(anime: any) {
  return String(anime?.status || '').trim().toUpperCase();
}

export function isUpcomingAnime(anime: any) {
  const status = normalizedStatus(anime);
  if (status === 'NOT_YET_AIRED' || status === 'UPCOMING') return true;
  if (String(anime?.latestEpisode || '').trim().toUpperCase() === 'TBA') return true;
  if (!anime?.episodes && !anime?.latestEpisode && status && status !== 'FINISHED' && status !== 'RELEASING') {
    return true;
  }
  return false;
}

export function desktopUpcomingPath(anime?: any) {
  const params = new URLSearchParams({ mode: 'upcoming' });
  const title = String(anime?.title || anime?.title_english || anime?.title_romaji || '').trim();
  if (title) {
    params.set('q', title);
  }
  return `/search?${params.toString()}`;
}

export function desktopWatchPath(
  anime: any,
  extras?: Record<string, string | number | null | undefined>,
) {
  const params = new URLSearchParams();
  const anilistId = extractNumericId(anime?.anilist_id ?? anime?.id ?? '');
  const malId = extractNumericId(anime?.mal_id ?? '');

  if (anilistId) params.set('aid', anilistId);
  if (malId) params.set('mid', malId);

  Object.entries(extras || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    params.set(key, String(value));
  });

  const base = watchPath(anime);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function desktopWatchOrBrowsePath(anime: any) {
  return isUpcomingAnime(anime) ? desktopUpcomingPath(anime) : desktopWatchPath(anime);
}
