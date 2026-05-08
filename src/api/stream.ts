// Define the response structure for TypeScript safety
interface StreamResponse {
  sources: {
    url: string;
    isM3U8: boolean;
    quality: string;
  }[];
  backupSources?: any[];
}

/**
 * Generates the exact slug Gogoanime expects.
 * Example: "21-one-piece" -> "one-piece-episode-1"
 */
function generateGogoEpisodeId(rawTitle: string, episodeNumber: number | string) {
  // 1. Remove the Jikan ID prefix (e.g., "21-one-piece" -> "one-piece")
  // We split by hyphen and remove the first element if it's a number
  const parts = rawTitle.split('-');
  const titleWithoutId = isNaN(Number(parts[0])) ? rawTitle : parts.slice(1).join('-');

  // 2. Clean the title: remove special chars, lowercase, and fix hyphens
  const cleanTitle = titleWithoutId
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove symbols like : . !
    .trim()
    .replace(/\s+/g, '-')         // Replace spaces with hyphens
    .replace(/-+/g, '-');         // Avoid double hyphens "--"

  // 3. Return the final slug format
  return `${cleanTitle}-episode-${episodeNumber}`;
}

export async function fetchEpisodeStream(title: string, episodeNumber: number | string) {
  // Generate the correct slug (e.g., one-piece-episode-1)
  const gogoId = generateGogoEpisodeId(title, episodeNumber);
  
  // Debugging: Check your browser console to see if the ID looks correct!
  console.log("Fetching stream for ID:", gogoId);

  // Call your Vercel backend scraper
  const response = await fetch(`/api/stream-sources?id=${gogoId}`);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to fetch stream sources');
  }
  
  const data: StreamResponse = await response.json();
  
  // Return the sources array (m3u8 links) to your video player
  return data.sources;
}