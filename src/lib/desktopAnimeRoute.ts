import { watchPath } from './slug';

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

export function desktopWatchOrBrowsePath(anime: any) {
  return isUpcomingAnime(anime) ? desktopUpcomingPath(anime) : watchPath(anime);
}
