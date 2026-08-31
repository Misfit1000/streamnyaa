export function totalEpisodeCount(anime: any): number | null {
  const value = Number(anime?.episodes || anime?.episodeCount || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

export function airedEpisodeCount(anime: any): number | null {
  const explicit = Number(anime?.latestEpisode || anime?.latest_episode || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const next = Number(anime?.nextAiringEpisode?.episode || 0);
  if (Number.isFinite(next) && next > 0) return Math.max(0, Math.floor(next) - 1);

  const streamingCount = Array.isArray(anime?.streamingEpisodes) ? anime.streamingEpisodes.length : 0;
  if (streamingCount > 0) return streamingCount;

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
