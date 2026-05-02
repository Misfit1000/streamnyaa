type MediaLike = {
  mal_id?: number | string | null;
  id?: number | string | null;
  title?: string | null;
  title_english?: string | null;
  title_romaji?: string | null;
  name?: string | null;
};

export function extractNumericId(id: string | number | null | undefined): string {
  const value = String(id ?? '');
  return value.match(/^\d+/)?.[0] || value;
}

export function slugifyTitle(title: string | null | undefined): string {
  return String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'anime';
}

export function mediaSlug(media: MediaLike): string {
  const id = extractNumericId(media.mal_id ?? media.id);
  const title = media.title || media.title_english || media.title_romaji || media.name;
  return id + '-' + slugifyTitle(title);
}

export function animePath(media: MediaLike, suffix = ''): string {
  return '/anime/' + mediaSlug(media) + suffix;
}

export function mangaPath(media: MediaLike): string {
  return '/manga/' + mediaSlug(media);
}

export function watchPath(media: MediaLike): string {
  return '/watch/' + mediaSlug(media);
}
