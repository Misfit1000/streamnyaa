import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from "axios";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

const keys = {
  key: CryptoJS.enc.Utf8.parse('37911490979715163134003223491201'),
  secondKey: CryptoJS.enc.Utf8.parse('54674138327930866480207815084989'),
  iv: CryptoJS.enc.Utf8.parse('3134003223491201'),
};

// 2026 Mirror List - The code will try these in order
const MIRRORS = [
  'https://anitaku.io'
  'https://anitaku.to',
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

  for (const baseUrl of MIRRORS) {
    try {
      const targetUrl = `${baseUrl}/${id}`;
      console.log(`Trying mirror: ${targetUrl}`);

      const response = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': baseUrl,
        },
        timeout: 5000 // Quick timeout to skip dead mirrors
      });

      const $ = cheerio.load(response.data);
      
      let iframeUrl = 
        $('div.anime_muti_link > ul > li.vidcdn > a').attr('data-video') || 
        $('iframe[src*="load.php"]').attr('src') ||
        $('.play-video iframe').attr('src');

      if (!iframeUrl) continue; // Try next mirror

      if (iframeUrl.startsWith('//')) iframeUrl = `https:${iframeUrl}`;

      const parsedUrl = new URL(iframeUrl);
      const videoId = parsedUrl.searchParams.get('id');

      const iframePage = await axios.get(iframeUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': baseUrl }
      });
      
      const $$ = cheerio.load(iframePage.data);
      const encryptedParams = $$("script[data-name='episode']").attr('data-value');

      const decryptedToken = CryptoJS.AES.decrypt(encryptedParams!, keys.key, { iv: keys.iv }).toString(CryptoJS.enc.Utf8);
      const encryptedRequestId = CryptoJS.AES.encrypt(videoId!, keys.key, { iv: keys.iv }).toString();
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

      // If we got here, we have the links!
      return res.status(200).json({ sources: decryptedData.source });

    } catch (error: any) {
      lastError = error.message;
      console.log(`Mirror ${baseUrl} failed: ${lastError}`);
      continue; // Move to the next mirror in the list
    }
  }

  // If all mirrors fail
  return res.status(500).json({ 
    error: "All mirrors failed or returned structure mismatch.",
    last_error: lastError
  });
}