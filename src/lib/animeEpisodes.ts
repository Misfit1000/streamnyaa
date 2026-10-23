export function totalEpisodeCount(anime: any): number | null {
  const value = Number(anime?.episodes || anime?.episodeCount || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

export function airedEpisodeCount(anime: any, now = Date.now()): number | null {
  const explicit = Number(anime?.latestEpisode || anime?.latest_episode || 0);
  const next = Number(anime?.nextAiringEpisode?.episode || 0);
  const rawTime = Number(anime?.nextAiringEpisode?.airingAt || 0);
  const nextTime = rawTime > 1e12 ? rawTime : rawTime * 1000;
  const blocked = /delay|postpon|cancel|break|hiatus|suspend/i.test(String(anime?.scheduleStatus || ''));
  const scheduled = Number.isFinite(next) && next > 0 ? Math.max(0, Math.floor(next) - (nextTime > 0 && nextTime <= now && !blocked ? 0 : 1)) : null;

  const streamingNumbers = (Array.isArray(anime?.streamingEpisodes) ? anime.streamingEpisodes : [])
    .map((entry: any) => Number(entry?.episode || String(entry?.title || '').match(/(?:Episode|Ep\.?)[ ]*(\d+)/i)?.[1]))
    .filter((episode: number) => Number.isInteger(episode) && episode > 0);
  const evidence = [Number.isFinite(explicit) && explicit > 0 ? Math.floor(explicit) : null, scheduled, ...streamingNumbers]
    .filter((value): value is number => value != null);
  if (evidence.length) return Math.max(...evidence);

  const total = totalEpisodeCount(anime);
  const status = String(anime?.status || '').trim().toUpperCase();
  if (status === 'FINISHED' || /FINISHED|COMPLETED/.test(status)) return total;
  if (/NOT[_ ]YET|UPCOMING/.test(status)) return 0;
  return null;
}

export function episodeAvailabilityLabel(anime: any) {
  const aired = airedEpisodeCount(anime);
  const total = totalEpisodeCount(anime);
  return `${aired ?? '?'}/${total ?? '?'}`;
}

/** Navigable episodes and confirmed broadcast counts are separate evidence. */
export function watchEpisodeCatalogSize(aired: number | null, requested: number, sourceEpisodes: number[], upcoming: boolean) {
  const valid = (value: number) => Number.isSafeInteger(value) && value > 0 ? value : 0;
  return Math.min(100_000, Math.max(upcoming ? 0 : aired ?? 12, valid(requested), ...sourceEpisodes.map(valid)));
}

/** Announced series totals may lag; movies and completed installments have bounds. */
export function episodeNavigation(anime: any, aired: number | null, requested = 1, sources: number[] = [], upcoming = false) {
  const total = totalEpisodeCount(anime);
  const movie = String(anime?.type || anime?.format || '').toUpperCase() === 'MOVIE';
  const limit = movie ? total || 1 : /FINISHED|COMPLETED/i.test(String(anime?.status)) ? total : null;
  const valid = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 9999) : 1;
  const selected = limit ? Math.min(valid, limit) : valid;
  const eligibleSources = [...new Set(sources.filter(value => Number.isSafeInteger(value) && value > 0 && (!limit || value <= limit)))].sort((a,b)=>a-b);
  const count = limit ? Math.min(limit, Math.max(upcoming ? 0 : aired ?? limit, selected, ...eligibleSources))
    : watchEpisodeCatalogSize(aired, selected, eligibleSources, upcoming);
  return { selected, count, limit, sourceEpisodes: eligibleSources, hasNext: selected < count, singlePart: movie && limit === 1 };
}

/** Titles are optional. Missing title/date metadata must not manufacture zero aired episodes. */
export function verifiedAiredEpisodeCount(anime: any, episodes: any[] = [], now = Date.now()): number | null {
  const status = String(anime?.status || '').trim().toUpperCase();
  if (/NOT[_ ]YET|UPCOMING/.test(status)) return 0;
  const finished = /FINISHED|COMPLETED/.test(status);
  const known = airedEpisodeCount(anime, now);
  const dated = episodes.filter(e => finished || (Number.isFinite(Date.parse(e?.aired)) && Date.parse(e.aired) <= now))
    .map(e => Number(e?.mal_id)).filter(n => Number.isInteger(n) && n > 0);
  if (!dated.length) return known;
  return Math.max(known ?? 0, ...dated);
}
