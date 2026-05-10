// Disabled intentionally.
//
// This endpoint previously depended on axios/cheerio and attempted to fetch
// third-party stream source pages. Keeping the implementation commented out
// prevents the missing axios type/build error and keeps the route inactive.
//
// import type { VercelRequest, VercelResponse } from '@vercel/node';
// import axios from 'axios';
// import * as cheerio from 'cheerio';
//
// export default async function handler(req: VercelRequest, res: VercelResponse) {
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
//
//   if (req.method === 'OPTIONS') return res.status(200).end();
//
//   const { id } = req.query;
//   if (!id || typeof id !== 'string') {
//     return res.status(400).json({ error: 'Episode ID is required' });
//   }
//
//   try {
//     const targetUrl = `https://animetsu.live/watch/${id}`;
//     const response = await axios.get(targetUrl, {
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
//         Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
//       },
//       timeout: 8000,
//     });
//
//     const $ = cheerio.load(response.data);
//     const rawM3u8 = $('video source[type="video/mpegurl"]').attr('src') || $('video source').attr('src');
//     const subtitles = $('video track[kind="subtitles"]').attr('src');
//     let iframeSrc = $('iframe').attr('src');
//
//     if (rawM3u8) {
//       return res.status(200).json({
//         sources: [{ url: rawM3u8, isM3U8: true }],
//         subtitles: subtitles ? [{ url: subtitles, lang: 'English' }] : [],
//       });
//     }
//
//     if (iframeSrc) {
//       if (iframeSrc.startsWith('//')) iframeSrc = `https:${iframeSrc}`;
//       return res.status(200).json({
//         embedUrl: iframeSrc,
//         message: 'Found iframe embed, fallback required in frontend',
//       });
//     }
//
//     throw new Error('Could not find <video> or <iframe> in the raw HTML.');
//   } catch (error: any) {
//     if (error.response && [403, 451, 503].includes(error.response.status)) {
//       return res.status(error.response.status).json({
//         error: 'Cloudflare blocked the Vercel server IP.',
//       });
//     }
//
//     return res.status(500).json({ error: 'Scraping failed.', details: error.message });
//   }
// }
