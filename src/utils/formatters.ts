export function generateGogoEpisodeId(title: string, episodeNumber: number | string): string {
  // Converts "One Piece" to "one-piece-episode-1"
  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') 
    .replace(/(^-|-$)/g, '');    
    
  return `${safeTitle}-episode-${episodeNumber}`;
}