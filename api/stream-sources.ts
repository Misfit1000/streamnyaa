import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from "axios";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

const keys = {
  key: CryptoJS.enc.Utf8.parse('37911490979715163134003223491201'),
  secondKey: CryptoJS.enc.Utf8.parse('54674138327930866480207815084989'),
  iv: CryptoJS.enc.Utf8.parse('3134003223491201'),
};

// Try the most stable domain for scrapers
const GOGO_BASE_URL = 'https://gogoanime3.co'; 

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: "ID required" });

  try {
    // 1. Fetch with "Stealth" headers to mimic a real browser
    const response = await axios.get(`${GOGO_BASE_URL}/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://google.com'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    
    // 2. Multi-Selector Logic (Gogoanime shifts these often)
    let iframeUrl = 
      $('div.anime_muti_link > ul > li.vidcdn > a').attr('data-video') || 
      $('li.vidcdn > a').attr('data-video') ||
      $('iframe').attr('src');
    
    if (!iframeUrl) {
      // If still not found, check if we got caught by Cloudflare
      if (response.data.includes("Cloudflare") || response.data.includes("Verify you are human")) {
        throw new Error("Cloudflare Blocked Vercel IP. Try again in a few minutes.");
      }
      throw new Error("HTML structure changed or ID is incorrect.");
    }

    if (iframeUrl.startsWith('//')) iframeUrl = `https:${iframeUrl}`;

    const parsedUrl = new URL(iframeUrl);
    const videoId = parsedUrl.searchParams.get('id');
    if (!videoId) throw new Error("Video ID extraction failed.");

    // 3. Fetch the decryption token from the iframe
    const iframePage = await axios.get(iframeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': GOGO_BASE_URL }
    });
    
    const $$ = cheerio.load(iframePage.data);
    const encryptedParams = $$("script[data-name='episode']").attr('data-value');
    if (!encryptedParams) throw new Error("Encryption key not found on provider.");

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
    return res.status(200).json({ sources: decryptedData.source });

  } catch (error: any) {
    console.error("Vercel Scraper Error:", error.message);
    return res.status(500).json({ 
      error: error.message, 
      tip: "Check if the slug exists on gogoanime3.co" 
    });
  }
}