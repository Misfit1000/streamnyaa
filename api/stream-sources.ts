import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from "axios";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: "ID required" });
  }

  try {
    console.log(`Requesting stream for: ${id} via Consumet Proxy`);

    /**
     * We use a public Consumet API instance. 
     * Consumet is a 2026 standard for anime scrapers because it 
     * handles the decryption and Cloudflare bypass automatically.
     */
    const CONSUMET_API = 'https://api.consumet.org/anime/gogoanime/watch';
    
    const response = await axios.get(`${CONSUMET_API}/${id}`, {
      timeout: 10000 
    });

    // The response from Consumet is already decrypted!
    const data = response.data;

    if (!data || !data.sources) {
      throw new Error("No stream sources found for this ID.");
    }

    // Success: Return the clean sources to your player
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ 
        sources: data.sources,
        download: data.download || null
    });

  } catch (error: any) {
    console.error("Proxy Error:", error.message);
    
    // Fallback error message
    return res.status(500).json({ 
      error: "Stream provider is temporarily blocked. Try another episode.",
      details: error.message
    });
  }
}