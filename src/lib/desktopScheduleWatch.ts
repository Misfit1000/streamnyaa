import { desktopWatchOrBrowsePath, desktopWatchPath } from './desktopAnimeRoute';
import { primeDesktopWatchSnapshot } from './desktopWatchSnapshot';

export function scheduledAiredEpisode(anime: any, now = Date.now()): number | null {
  const episode = Number(anime?.airingEpisode);
  const raw = Number(anime?.airingAt);
  const time = raw > 1e12 ? raw : raw * 1000;
  const flags = ['cancelled', 'canceled', 'isCancelled', 'isCanceled', 'delayed', 'isDelayed', 'postponed', 'isPostponed'];
  const status = ['scheduleStatus', 'airingStatus', 'broadcastStatus', 'episodeStatus', 'releaseStatus', 'delayStatus', 'status', 'airingMessage', 'broadcastMessage', 'message', 'notice', 'notes']
    .map(key => String(anime?.[key] || '')).join(' ');
  if (flags.some(key => anime?.[key]) || /cancel|delay|postpone|hiatus|suspend|pushed back/i.test(status)) return null;
  return Number.isInteger(episode) && episode > 0 && episode <= 100000 && Number.isFinite(time) && time > 0 && time <= now ? episode : null;
}

export function scheduleWatchPath(anime: any) {
  const episode = scheduledAiredEpisode(anime);
  return episode ? desktopWatchPath(anime, { ep: episode }) : desktopWatchOrBrowsePath(anime);
}

export function primeScheduleWatch(anime: any) {
  primeDesktopWatchSnapshot(scheduleWatchPath(anime), anime);
}

/** Retain episode evidence from the clicked calendar record when detail caches lag. */
export function mergeScheduleWatchEvidence(anime: any, snapshot: any, now = Date.now()) {
  const episode = scheduledAiredEpisode(snapshot, now);
  if (!episode || !anime || !snapshot) return anime;
  const keys = ['anilist_id', 'mal_id'];
  const comparable = keys.filter(key => anime[key] && snapshot[key]);
  if (!comparable.length || comparable.some(key => String(anime[key]) !== String(snapshot[key]))) return anime;
  return { ...anime, status: /NOT[_ ]YET|UPCOMING/.test(String(anime.status).toUpperCase()) ? 'RELEASING' : anime.status,
    latestEpisode: Math.max(Number(anime.latestEpisode || anime.latest_episode) || 0, episode) };
}
