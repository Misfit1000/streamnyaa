/**
 * Converts a raw anime title (potentially with a Jikan ID) into a Gogoanime slug.
 * @param rawTitle - The title string, e.g., "21-one-piece" or "One Piece: Red"
 * @param episodeNumber - The episode number, e.g., 1 or "1"
 * @returns A formatted slug, e.g., "one-piece-episode-1"
 */
export function generateGogoEpisodeId(rawTitle: string, episodeNumber: number | string) {
  // 1. Remove Jikan ID prefix if it exists (e.g., "21-one-piece" -> "one-piece")
  const parts = rawTitle.split('-');
  const titleWithoutId = !isNaN(Number(parts[0])) ? parts.slice(1).join('-') : rawTitle;

  // 2. Comprehensive cleaning logic
  const cleanTitle = titleWithoutId
    .toLowerCase()
    .replace(/\(.*\)/g, '')          // Remove (TV), (ONA), (Movie)
    .replace(/[:.,!]/g, '')          // Remove colons, dots, symbols
    .replace(/season\s+(\d+)/g, 'season-$1') // "Season 4" -> "season-4"
    .trim()
    .replace(/[\s_]+/g, '-')         // Spaces/underscores to hyphens
    .replace(/[^a-z0-9-]/g, '')      // Only keep alphanumeric and hyphens
    .replace(/-+/g, '-')             // Clean up double hyphens "--"
    .replace(/^-+|-+$/g, '');        // Clean up leading/trailing hyphens

  // 3. Construct final Gogoanime URL slug
  return `${cleanTitle}-episode-${episodeNumber}`;
}