import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from "axios";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

// Standard AES keys for Gogoanime mirrors in 2026
const keys = {
  key: CryptoJS.enc.Utf8.parse('37911490979715163134003223491201'),
  secondKey: CryptoJS.enc.Utf8.parse('54674138327930866480207815084989'),
  iv: CryptoJS.enc.Utf8.parse('3134003223491201'),
};

const GOGO_BASE_URL = 'https://anitaku.to';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration for your frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: "Episode ID is required" });
  }

  try {
    const targetUrl = `${GOGO_BASE_URL}/${id}`;
    console.log(`Scraper visiting: ${targetUrl}`);

    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': GOGO_BASE_URL,
      },
      timeout: 10000 
    });

    const $ = cheerio.load(response.data);
    
    // --- UNIVERSAL SELECTOR LOGIC ---
    let iframeUrl = 
      $('div.anime_muti_link > ul > li.vidcdn > a').attr('data-video') || 
      $('li.vidcdn > a').attr('data-video') ||
      $('iframe[src*="vidcdn"]').attr('src') ||
      $('.play-video iframe').attr('src') ||
      $('iframe[src*="load.php"]').attr('src');

    // Fallback: search all iframes for a video keyword
    if (!iframeUrl) {
      $('iframe').each((_, el) => {
        const src = $(el).attr('src');
        if (src && (src.includes('embed') || src.includes('streaming') || src.includes('ajax'))) {
          iframeUrl = src;
        }
      });
    }
    
    if (!iframeUrl) {
      console.error(`Structure Mismatch at: ${targetUrl}`);
      throw new Error("Target video player not found. Slug might be wrong.");
    }

    if (iframeUrl.startsWith('//')) iframeUrl = `https:${iframeUrl}`;

    const parsedUrl = new URL(iframeUrl);
    const videoId = parsedUrl.searchParams.get('id');
    if (!videoId) throw new Error("Could not extract video ID.");

    // Fetch the decryption token from the provider iframe
    const iframePage = await axios.get(iframeUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Referer': GOGO_BASE_URL 
      }
    });
    
    const $$ = cheerio.load(iframePage.data);
    const encryptedParams = $$("script[data-name='episode']").attr('data-value');

    if (!encryptedParams) throw new Error("Encryption keys missing from page.");

    const decryptedToken = CryptoJS.AES.decrypt(encryptedParams, keys.key, { iv: keys.iv }).toString(CryptoJS.enc.Utf8);
    const encryptedRequestId = CryptoJS.AES.encrypt(videoId, keys.key, { iv: keys.iv }).toString();
    const ajaxUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}/encrypt-ajax.php?id=${encryptedRequestId}&alias=${videoId}&${decryptedToken}`;

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

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ 
        sources: decryptedData.source,
        backupSources: decryptedData.source_bk 
    });

  } catch (error: any) {
    console.error("Vercel Scraper Error:", error.message);
    return res.status(500).json({ 
      error: error.message,
      id_received: id
    });
  }
}