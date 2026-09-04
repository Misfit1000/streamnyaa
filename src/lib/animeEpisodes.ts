export function totalEpisodeCount(anime: any): number | null {
  const value = Number(anime?.episodes || anime?.episodeCount || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

export function airedEpisodeCount(anime: any): number | null {
  const explicit = Number(anime?.latestEpisode || anime?.latest_episode || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const next = Number(anime?.nextAiringEpisode?.episode || 0);
  if (Number.isFinite(next) && next > 0) return Math.max(0, Math.floor(next) - 1);

  const streamingNumbers = (Array.isArray(anime?.streamingEpisodes) ? anime.streamingEpisodes : [])
    .map((entry: any) => Number(entry?.episode || String(entry?.title || '').match(/(?:Episode|Ep\.?)[ ]*(\d+)/i)?.[1]))
    .filter((episode: number) => Number.isInteger(episode) && episode > 0);
  if (streamingNumbers.length > 0) return Math.max(...streamingNumbers);

  const total = totalEpisodeCount(anime);
  const status = String(anime?.status || '').trim().toUpperCase();
  if (status === 'FINISHED' || /FINISHED|COMPLETED/.test(status)) return total;
  if (/NOT_YET|UPCOMING/.test(status)) return 0;
  return null;
}

export function episodeAvailabilityLabel(anime: any) {
  const aired = airedEpisodeCount(anime);
  const total = totalEpisodeCount(anime);
  return `${aired ?? '?'}/${total ?? '?'}`;
}

/** Titles are optional. Missing title/date metadata must not manufacture zero aired episodes. */
export function verifiedAiredEpisodeCount(anime: any, episodes: any[] = [], now = Date.now()): number | null {
  const status = String(anime?.status || '').trim().toUpperCase();
  if (/NOT_YET|UPCOMING/.test(status)) return 0;
  const finished = /FINISHED|COMPLETED/.test(status);
  const known = airedEpisodeCount(anime);
  const dated = episodes.filter(e => finished || (Number.isFinite(Date.parse(e?.aired)) && Date.parse(e.aired) <= now))
    .map(e => Number(e?.mal_id)).filter(n => Number.isInteger(n) && n > 0);
  if (!dated.length) return known;
  return Math.max(known ?? 0, ...dated);
}
