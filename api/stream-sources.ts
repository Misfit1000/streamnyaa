import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from "axios";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: "ID required" });

  try {
    /**
     * ANIFY API - The 2026 Standard for Bypassing 451 Errors
     * Note: Anify uses the 'slug' differently. We try to find the 
     * sources directly.
     */
    const ANIFY_API = `https://api.anify.tv/sources?id=${id}&episodeNumber=1&type=anime&subType=sub`;
    
    console.log(`Anify Fetch: ${ANIFY_API}`);

    const response = await axios.get(ANIFY_API, { timeout: 10000 });

    if (response.data && response.data.sources) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.status(200).json({
        sources: response.data.sources,
        instance_used: "Anify TV"
      });
    }

    throw new Error("No sources found on Anify.");

  } catch (error: any) {
    console.error("Anify Error:", error.message);
    
    // LAST RESORT: If Anify fails, we try a private Consumet mirror
    try {
      const PRIVATE_MIRROR = `https://consumet-api-clone.vercel.app/anime/gogoanime/watch/${id}`;
      const fallback = await axios.get(PRIVATE_MIRROR, { timeout: 5000 });
      return res.status(200).json({ sources: fallback.data.sources });
    } catch (e) {
      return res.status(500).json({ 
        error: "All providers blocked. Gogoanime is currently fighting Vercel IPs.",
        tip: "Try a different anime; popular ones like One Piece are heavily protected." 
      });
    }
  }
}