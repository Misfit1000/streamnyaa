/** Episode images never acquire identity from array order or arbitrary story-title numbers. */
export function episodeNumberFromTitle(value = '') {
  const match = value.match(/\b(?:episode|ep\.?)\s*#?\s*(\d{1,5})\b/i);
  return match ? Number(match[1]) || null : null;
}
export function episodeImageUrl(value: unknown): string | undefined {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
export function episodeImageCandidates(entry: any): string[] {
  return [...new Set([entry?.thumbnail, entry?.image, entry?.images?.jpg?.image_url, entry?.images?.webp?.image_url]
    .map(episodeImageUrl).filter((value): value is string => Boolean(value)))];
}
export function resolveEpisodeArtwork(anime: any, pageItems: any[] = []) {
  const pages = new Map<number, any>();
  for (const entry of pageItems) {
    const number = Number(entry?.mal_id || entry?.episode);
    if (Number.isSafeInteger(number) && number > 0) pages.set(number, { ...pages.get(number), ...entry,
      thumbnail: episodeImageCandidates(entry)[0] || pages.get(number)?.thumbnail });
  }
  const normalized = (value: unknown) => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  const titleMatches = new Map<string, Set<number>>();
  for (const [number, entry] of pages) for (const title of [entry.title, entry.title_english, entry.title_romanji]) {
    if (!title) continue;
    const key = normalized(title); const matches = titleMatches.get(key) || new Set<number>();
    matches.add(number); titleMatches.set(key, matches);
  }
  const streaming = new Map<number, any>();
  for (const entry of Array.isArray(anime?.streamingEpisodes) ? anime.streamingEpisodes : []) {
    const explicit = Number(entry?.episode);
    const matches = titleMatches.get(normalized(entry?.title));
    const number = Number.isSafeInteger(explicit) && explicit > 0 ? explicit : episodeNumberFromTitle(entry?.title)
      || (matches?.size === 1 ? [...matches][0] : null);
    if (!number) continue;
    const previous = streaming.get(number);
    streaming.set(number, { ...previous, ...entry, thumbnail: episodeImageCandidates(entry)[0] || previous?.thumbnail });
  }
  const fallback = [...new Set([anime?.banner_image, anime?.bannerImage, anime?.backdrop,
    anime?.images?.webp?.large_image_url, anime?.images?.jpg?.large_image_url, anime?.images?.jpg?.image_url,
    anime?.coverImage?.extraLarge, anime?.coverImage?.large].map(episodeImageUrl).filter((value): value is string => Boolean(value)))];
  return { pages, streaming, forEpisode(number: number, hideSpoilers = false) {
    const specific = hideSpoilers ? [] : [...new Set([...episodeImageCandidates(streaming.get(number)), ...episodeImageCandidates(pages.get(number))])];
    return { candidates: [...new Set([...specific, ...fallback])], specific: specific.length > 0, specificCount: specific.length,
      label: hideSpoilers ? 'Series artwork · spoilers hidden' : specific.length ? `Episode ${number} artwork` : 'Series artwork' };
  } };
}
