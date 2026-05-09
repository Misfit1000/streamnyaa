export async function fetchEpisodeStream(gogoId: string) {
  // We use an array of public Consumet instances. 
  // If one is down or blocked by CORS, it automatically tries the next one.
  const CONSUMET_INSTANCES = [
    `https://api.consumet.org/anime/gogoanime/watch/${gogoId}`,
    `https://consumet-api-clone.vercel.app/anime/gogoanime/watch/${gogoId}`,
    `https://corsproxy.io/?https://api.consumet.org/anime/gogoanime/watch/${gogoId}`
  ];

  for (const apiUrl of CONSUMET_INSTANCES) {
    try {
      console.log(`Trying Consumet instance: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        // Some Consumet instances require this header
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Instance returned ${response.status}`);
      }

      const data = await response.json();

      // Consumet returns an array of 'sources'. We want the highest quality or the 'auto' m3u8.
      if (data && data.sources && data.sources.length > 0) {
        
        // Find the 'auto' quality stream, or default to the first available source
        const bestSource = data.sources.find((s: any) => s.quality === 'auto' || s.quality === 'default') || data.sources[0];
        
        return {
          sources: [{ url: bestSource.url, isM3U8: bestSource.url.includes('.m3u8') }],
          // Consumet often provides a download/referral header if needed by your player
          headers: data.headers 
        };
      }
    } catch (error) {
      console.warn(`Failed fetching from ${apiUrl}, trying next...`, error);
      continue; // Move to the next instance in the array
    }
  }

  throw new Error("All Consumet instances failed or were blocked by CORS.");
}