export function animeIdentity(anime: any): string {
  return String(anime?.mal_id ?? anime?.id ?? anime?.title ?? '');
}

export function animeTitleKey(value = ''): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
