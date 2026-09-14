import { fetchJikanPath } from './jikan';
import { desktopDataError } from '../lib/desktopData';
import { readCachedWatchTitles } from '../lib/desktopWatchSnapshot';
import { readCachedExploreTitles } from '../lib/desktopExploreCache';

/** MAL's recently-added listings are not an exact broadcast schedule. */
export async function fetchRecentEpisodeListings(signal?: AbortSignal) {
  const response = await fetchJikanPath('/watch/episodes', 600, { signal });
  if (!response.ok) throw desktopDataError('jikan', new Error('Recently added episodes are unavailable.'), response.status);
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error('Invalid recent episode feed.');
  const known = new Map([...readCachedExploreTitles(), ...readCachedWatchTitles()].filter(item => Number(item.mal_id)>0).map(item=>[String(item.mal_id),item]));
  const seen = new Set<number>();
  const data = payload.data.flatMap((item: any) => {
    const entry = item?.entry; const id = Number(entry?.mal_id);
    if (!Number.isSafeInteger(id) || id <= 0 || typeof entry?.title !== 'string' || seen.has(id) || !Array.isArray(item.episodes) || !item.episodes.length) return [];
    seen.add(id);
    // Episode video IDs are not episode numbers. Only parse a declared episode
    // label or an anime episode URL, never the video's mal_id.
    const numbers = item.episodes.map((episode: any) => Number(String(episode.url || '').match(/\/episode\/(\d+)(?:[/?#]|$)/)?.[1] || String(episode.title || '').match(/^Episode\s+(\d+)\b/i)?.[1]))
      .filter((number: number) => Number.isSafeInteger(number) && number > 0 && number <= 100000);
    const existing = known.get(String(id));
    return [{ ...existing, ...entry, id, mal_id:id, anilist_id:existing?.anilist_id || null,
      title:existing?.title || entry.title, images:entry.images || existing?.images,
      recentFeedKind:'listed', listedEpisode:numbers.length ? Math.max(...numbers) : undefined }];
  });
  return { data, recentFeedKind:'listed' as const, cached:Boolean(response.headers.get('X-StreamNyaa-Local-Cache')) || ['memory','disk','stale'].includes(response.headers.get('X-StreamNyaa-Desktop-Cache') || '') };
}
