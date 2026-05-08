import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from "axios";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

// Decryption Keys for Gogoanime/Vidstreaming (Standard 2026 keys)
const keys = {
  key: CryptoJS.enc.Utf8.parse('37911490979715163134003223491201'),
  secondKey: CryptoJS.enc.Utf8.parse('54674138327930866480207815084989'),
  iv: CryptoJS.enc.Utf8.parse('3134003223491201'),
};

const GOGO_BASE_URL = 'https://anitaku.to';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Enable CORS for your frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: "Episode ID is required" });
  }

  try {
    // 2. Fetch the Episode Page with Browser-like Headers
    const response = await axios.get(`${GOGO_BASE_URL}/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': GOGO_BASE_URL,
      },
      timeout: 10000 // Prevent Vercel function timeout
    });

    const $ = cheerio.load(response.data);
    
    // 3. Multi-Selector Logic to find the Iframe URL
    let iframeUrl = 
      $('div.anime_muti_link > ul > li.vidcdn > a').attr('data-video') || 
      $('li.vidcdn > a').attr('data-video') ||
      $('iframe[src*="vidcdn"]').attr('src') ||
      $('.play-video iframe').attr('src');
    
    if (!iframeUrl) {
      throw new Error("Target video player not found. Slug might be wrong or site structure changed.");
    }

    // Ensure the protocol is present
    if (iframeUrl.startsWith('//')) iframeUrl = `https:${iframeUrl}`;

    const parsedUrl = new URL(iframeUrl);
    const videoId = parsedUrl.searchParams.get('id');
    if (!videoId) throw new Error("Could not extract video ID from iframe.");

    // 4. Visit the Iframe to get the encrypted session token
    const iframePage = await axios.get(iframeUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': GOGO_BASE_URL 
      }
    });
    
    const $$ = cheerio.load(iframePage.data);
    const encryptedParams = $$("script[data-name='episode']").attr('data-value');

    if (!encryptedParams) throw new Error("Encryption parameters missing from video provider.");

    // 5. Decrypt and Build the AJAX Request
    const decryptedToken = CryptoJS.AES.decrypt(encryptedParams, keys.key, { iv: keys.iv }).toString(CryptoJS.enc.Utf8);
    const encryptedRequestId = CryptoJS.AES.encrypt(videoId, keys.key, { iv: keys.iv }).toString();
    const ajaxUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}/encrypt-ajax.php?id=${encryptedRequestId}&alias=${videoId}&${decryptedToken}`;

    // 6. Final fetch for the actual .m3u8 sources
    const finalResponse = await axios.get(ajaxUrl, {
      headers: { 
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': iframeUrl,
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const decryptedData = JSON.parse(
      CryptoJS.AES.decrypt(finalResponse.data.data, keys.secondKey, { iv: keys.iv }).toString(CryptoJS.enc.Utf8)
    );

    // Success: Return sources to the player
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ 
        sources: decryptedData.source,
        backupSources: decryptedData.source_bk 
    });

  } catch (error: any) {
    console.error("Scraper Error:", error.message);
    return res.status(500).json({ 
      error: error.message,
      suggestion: "Verify the ID on anitaku.to manually." 
    });
  }
}