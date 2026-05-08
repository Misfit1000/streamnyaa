import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import { getCachedBlogPost } from "./api/blog";
import { getBlogPost } from "./src/api/blogShared";

// --- NEW SCRAPER IMPORTS ---
import axios from "axios";
import CryptoJS from "crypto-js";
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Use the stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const keys = {
  key: CryptoJS.enc.Utf8.parse('37911490979715163134003223491201'),
  secondKey: CryptoJS.enc.Utf8.parse('54674138327930866480207815084989'),
  iv: CryptoJS.enc.Utf8.parse('3134003223491201'),
};

const GOGO_BASE_URL = 'https://anitaku.to';

async function extractGogoanimeSources(episodeId: string) {
  let browser;
  try {
    // Launch a headless browser to pass Cloudflare challenges
    browser = await puppeteer.launch({ 
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    // 1. Visit the episode page
    await page.goto(`${GOGO_BASE_URL}/${episodeId}`, { waitUntil: 'networkidle2' });

    // 2. Extract the iframe URL from the live page
    const iframeUrl = await page.evaluate(() => {
      const anchor = document.querySelector('div.anime_muti_link > ul > li.vidcdn > a');
      return anchor ? anchor.getAttribute('data-video') : null;
    });

    if (!iframeUrl) throw new Error("Video player iframe not found on page.");

    // 3. Visit the iframe to load the encrypted scripts
    await page.goto(iframeUrl, { waitUntil: 'networkidle2' });

    // 4. Extract the encrypted token from the script tag
    const encryptedParams = await page.evaluate(() => {
      const script = document.querySelector("script[data-name='episode']");
      return script ? script.getAttribute('data-value') : null;
    });

    if (!encryptedParams) throw new Error("Could not find encrypted parameters.");

    await browser.close();

    // 5. Decrypt using AES
    const parsedUrl = new URL(iframeUrl);
    const videoId = parsedUrl.searchParams.get('id')!;
    const decryptedToken = CryptoJS.AES.decrypt(encryptedParams, keys.key, { iv: keys.iv }).toString(CryptoJS.enc.Utf8);
    const encryptedRequestId = CryptoJS.AES.encrypt(videoId, keys.key, { iv: keys.iv }).toString();
    const ajaxUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}/encrypt-ajax.php?id=${encryptedRequestId}&alias=${videoId}&${decryptedToken}`;

    const finalResponse = await axios.get(ajaxUrl, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });

    const decryptedData = JSON.parse(
      CryptoJS.AES.decrypt(finalResponse.data.data, keys.secondKey, { iv: keys.iv }).toString(CryptoJS.enc.Utf8)
    );

    return { sources: decryptedData.source, backupSources: decryptedData.source_bk };

  } catch (error: any) {
    if (browser) await browser.close();
    console.error("Scraping failed:", error.message);
    throw error;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // --- STREAMING API ---
  app.get("/api/stream-sources", async (req, res) => {
    const { id } = req.query;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: "Episode ID required" });
    try {
      const data = await extractGogoanimeSources(id);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- NYAA API ---
  app.get("/api/nyaa", async (req, res) => {
    try {
      const { q, c, f, p } = req.query;
      const url = new URL("https://nyaa.si/?page=rss");
      if (q) url.searchParams.append("q", q as string);
      if (c) url.searchParams.append("c", c as string);
      if (f) url.searchParams.append("f", f as string);
      if (p) url.searchParams.append("p", p as string);

      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      const xmlData = await response.text();
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      let result = parser.parse(xmlData);
      
      const items = result.rss?.channel?.item || [];
      const formattedItems = (Array.isArray(items) ? items : [items]).map((item: any) => ({
        title: item.title, link: item.link, guid: item.guid, pubDate: item.pubDate,
        seeders: item["nyaa:seeders"], leechers: item["nyaa:leechers"], downloads: item["nyaa:downloads"],
        infoHash: item["nyaa:infoHash"], categoryId: item["nyaa:categoryId"], category: item["nyaa:category"],
        size: item["nyaa:size"], comments: item["nyaa:comments"], trusted: item["nyaa:trusted"], remake: item["nyaa:remake"],
      }));
      res.json(formattedItems);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- BLOG API ---
  app.get("/api/blog", async (req, res) => {
    const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
    if (!slug || typeof slug !== "string" || !getBlogPost(slug)) {
      return res.status(404).json({ error: "Blog post not found" });
    }
    try {
      const data = await getCachedBlogPost(slug, false);
      res.setHeader("Cache-Control", "public, s-maxage=25200");
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();