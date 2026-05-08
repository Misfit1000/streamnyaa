import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from "axios";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query; // e.g., "21-one-piece-episode-1"
  if (!id || typeof id !== 'string') return res.status(400).json({ error: "ID required" });

  try {
    // 1. Extract the numeric ID and the Episode Number
    // From: "21-one-piece-episode-1000" 
    // To: animeId = "21", epNum = "1000"
    const parts = id.split('-');
    const animeId = parts[0]; 
    const epNum = parts[parts.length - 1];

    /**
     * ANIFY 2026 PROXIED FETCH
     * We specify the provider as 'gogoanime' to match your current setup.
     */
    const ANIFY_URL = `https://api.anify.tv/sources?id=${animeId}&episodeNumber=${epNum}&providerId=gogoanime&watchId=${id}&subType=sub`;

    console.log(`[iad1] Fetching: ${ANIFY_URL}`);

    const response = await axios.get(ANIFY_URL, { timeout: 10000 });

    if (response.data && response.data.sources) {
      return res.status(200).json({
        sources: response.data.sources, // Array of { url, quality }
        provider: "Anify-Gogo"
      });
    }

    // FALLBACK: If Anify is struggling, try the Amvstr mirror
    const AMVSTR_URL = `https://api.amvstr.me/api/v2/stream/${id}`;
    const amvstrRes = await axios.get(AMVSTR_URL, { timeout: 5000 });
    return res.status(200).json({ sources: amvstrRes.data.stream });

  } catch (error: any) {
    console.error(`[iad1] Final Error: ${error.message}`);
    return res.status(500).json({ error: "All providers failed. Site is likely under heavy protection." });
  }
}