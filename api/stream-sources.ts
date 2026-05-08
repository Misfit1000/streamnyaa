import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from "axios";

// A list of currently active Consumet instances for 2026
const CONSUMET_INSTANCES = [
  'https://consumet-api-production-e65a.up.railway.app', // Community instance
  'https://api.consumet.org',                          // Main instance
  'https://c.delusionz.xyz',                           // Alternative mirror
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: "ID required" });
  }

  let lastError = "";

  // Try each instance until one works
  for (const instance of CONSUMET_INSTANCES) {
    try {
      console.log(`Trying Consumet Instance: ${instance} for ID: ${id}`);
      
      const response = await axios.get(`${instance}/anime/gogoanime/watch/${id}`, {
        timeout: 8000 // If it takes too long, move to the next one
      });

      if (response.data && response.data.sources) {
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return res.status(200).json({
          sources: response.data.sources,
          download: response.data.download || null,
          instance_used: instance
        });
      }
    } catch (error: any) {
      lastError = error.message;
      console.error(`Instance ${instance} failed: ${error.message}`);
      // Continue to the next instance in the loop
    }
  }

  // If all instances fail or return 451
  return res.status(500).json({
    error: "All stream providers are currently blocked or down.",
    debug_id: id,
    last_error: lastError
  });
}