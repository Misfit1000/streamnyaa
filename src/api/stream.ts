import { generateGogoEpisodeId } from '../utils/formatters';

export async function fetchEpisodeStream(title: string, episodeNumber: number | string) {
  const gogoId = generateGogoEpisodeId(title, episodeNumber);
  
  const response = await fetch(`/api/stream-sources?id=${gogoId}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch stream sources');
  }
  
  const data = await response.json();
  return data.sources; // Returns the array of .m3u8 links
}