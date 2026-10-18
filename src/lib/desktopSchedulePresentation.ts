import { desktopCanonicalAnimeId } from './desktopAvailability';
import { desktopPosterCandidates } from './desktopArtwork';

export const scheduleTrackLabel = (row: any) => row.releaseTrack === 'dub' ? 'Dub' : row.releaseTrack === 'sub' ? 'Sub' : 'Original';
export function sameScheduleAnime(a: any, b: any) {
  if (a.anilist_id && b.anilist_id && String(a.anilist_id) !== String(b.anilist_id)) return false;
  if (a.mal_id && b.mal_id && String(a.mal_id) !== String(b.mal_id)) return false;
  return Boolean(a.anilist_id && String(a.anilist_id) === String(b.anilist_id)
    || a.mal_id && String(a.mal_id) === String(b.mal_id));
}
export function scheduleArtworkCandidates(row: any) { return desktopPosterCandidates(row).filter(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}); }
export function groupScheduleEpisodes(rows: any[]) {
  const groups: { key: string; anime: any; tracks: any[] }[] = [];
  for (const row of rows) {
    let group = groups.find(group => sameScheduleAnime(group.anime, row) && Number(group.anime.airingEpisode) === Number(row.airingEpisode));
    if (!group) { group = { key: `${desktopCanonicalAnimeId(row)}:episode-${row.airingEpisode}`, anime: row, tracks: [] }; groups.push(group); }
    const previous = group.tracks.findIndex(track => (track.releaseTrack || 'original') === (row.releaseTrack || 'original'));
    if (previous < 0) group.tracks.push(row);
    else if (Number(row.scheduleFetchedAt || 0) >= Number(group.tracks[previous].scheduleFetchedAt || 0)) group.tracks[previous] = row;
    if (!scheduleArtworkCandidates(group.anime).length && scheduleArtworkCandidates(row).length) group.anime = row;
  }
  for (const group of groups) group.tracks.sort((a,b) => ['original','sub','dub'].indexOf(a.releaseTrack || 'original') - ['original','sub','dub'].indexOf(b.releaseTrack || 'original'));
  return groups;
}
