export function generateGogoEpisodeId(title: string, episodeNumber: number | string) {
  const cleanTitle = title
    .toLowerCase()
    .replace(/\(.*\)/g, '')          // Remove (TV) or (Movie)
    .replace(/[:.,!]/g, '')          // Remove colons and symbols
    .replace(/season\s+(\d+)/g, 'season-$1') // "Season 4" -> "season-4"
    .replace(/[\s_]+/g, '-')         // Spaces to hyphens
    .replace(/[^a-z0-9-]/g, '')      // Only keep letters, numbers, and hyphens
    .replace(/-+/g, '-')             // Remove double hyphens "--"
    .trim()
    .replace(/^-+|-+$/g, '');        // Clean up ends

  return `${cleanTitle}-episode-${episodeNumber}`;
}