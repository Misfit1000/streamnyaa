import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: "Episode ID is required" });
  }

  try {
    const targetUrl = `https://animetsu.live/watch/${id}`;
    console.log(`Scraping Animetsu: ${targetUrl}`);

    // 1. Fetch the HTML page
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);

    // 2. Extract the direct video link from the <source> tag
    let rawM3u8 = $('video source[type="video/mpegurl"]').attr('src') || $('video source').attr('src');
    
    // 3. Extract English subtitles if they exist
    let subtitles = $('video track[kind="subtitles"]').attr('src');

    // 4. Fallback: Check for an iframe just in case
    let iframeSrc = $('iframe').attr('src');

    // --- Return Logic ---

    if (rawM3u8) {
      console.log("Success: Found direct M3U8 ->", rawM3u8);
      return res.status(200).json({ 
        sources: [{ url: rawM3u8, isM3U8: true }],
        subtitles: subtitles ? [{ url: subtitles, lang: 'English' }] : []
      });
    }

    if (iframeSrc) {
      if (iframeSrc.startsWith('//')) iframeSrc = `https:${iframeSrc}`;
      console.log("Fallback: Found iframe ->", iframeSrc);
      return res.status(200).json({ 
        embedUrl: iframeSrc,
        message: "Found iframe embed, fallback required in frontend" 
      });
    }

    // If neither is found, Axios fetched the page before the JS loaded the video
    throw new Error("Could not find <video> or <iframe> in the raw HTML.");

  } catch (error: any) {
    console.error(`Animetsu Scrape Failed:`, error.message);
    
    if (error.response && [403, 451, 503].includes(error.response.status)) {
        return res.status(error.response.status).json({ 
            error: "Cloudflare blocked the Vercel server IP." 
        });
    }

    return res.status(500).json({ error: "Scraping failed.", details: error.message });
  }
}