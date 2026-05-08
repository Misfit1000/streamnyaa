import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import { getCachedBlogPost } from "./api/blog";
import { getBlogPost } from "./src/api/blogShared";

// --- SCRAPER IMPORTS ---
import axios from "axios";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

// --- GOGOANIME DECRYPTION CONFIG ---
const keys = {
  key: CryptoJS.enc.Utf8.parse('37911490979715163134003223491201'),
  secondKey: CryptoJS.enc.Utf8.parse('54674138327930866480207815084989'),
  iv: CryptoJS.enc.Utf8.parse('3134003223491201'),
};

const GOGO_BASE_URL = 'https://anitaku.to';

async function extractGogoanimeSources(episodeId: string) {
  try {
    // Advanced headers to bypass Cloudflare/ISP blocks in Nepal
    const response = await axios.get(`${GOGO_BASE_URL}/${episodeId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    const $ = cheerio.load(response.data);
    const iframeUrl = $('div.anime_muti_link > ul > li.vidcdn > a').attr('data-video');
    if (!iframeUrl) throw new Error("Video player iframe not found on page.");

    const parsedUrl = new URL(iframeUrl);
    const videoId = parsedUrl.searchParams.get('id');
    if (!videoId) throw new Error("Could not extract video ID.");

    const iframePage = await axios.get(iframeUrl);
    const $$ = cheerio.load(iframePage.data);
    const encryptedParams = $$("script[data-name='episode']").attr('data-value');
    if (!encryptedParams) throw new Error("Encrypted parameters missing.");

    const decryptedToken = CryptoJS.AES.decrypt(encryptedParams, keys.key, { iv: keys.iv }).toString(CryptoJS.enc.Utf8);
    const encryptedRequestId = CryptoJS.AES.encrypt(videoId, keys.key, { iv: keys.iv }).toString();
    const ajaxUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}/encrypt-ajax.php?id=${encryptedRequestId}&alias=${videoId}&${decryptedToken}`;

    const finalResponse = await axios.get(ajaxUrl, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
    });

    const decryptedData = JSON.parse(
      CryptoJS.AES.decrypt(finalResponse.data.data, keys.secondKey, { iv: keys.iv }).toString(CryptoJS.enc.Utf8)
    );

    return {
      sources: decryptedData.source,
      backupSources: decryptedData.source_bk
    };
  } catch (error: any) {
    console.error("Scraping failed:", error.message);
    throw error;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // --- STREAMING API ROUTE ---
  app.get("/api/stream-sources", async (req, res) => {
    const { id } = req.query;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: "Episode ID is required" });
    try {
      const data = await extractGogoanimeSources(id);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- EXISTING NYAA RSS PROXY ---
  app.get("/api/nyaa", async (req, res) => {
    try {
      const { q, c, f, p } = req.query;
      const url = new URL("https://nyaa.si/?page=rss");
      if (q) url.searchParams.append("q", q as string);
      if (c) url.searchParams.append("c", c as string);
      if (f) url.searchParams.append("f", f as string);
      if (p) url.searchParams.append("p", p as string);

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) return res.status(response.status).json({ error: 'Nyaa fetch failed' });

      const xmlData = await response.text();
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      let result = parser.parse(xmlData);
      
      const items = result.rss?.channel?.item || [];
      const formattedItems = (Array.isArray(items) ? items : [items]).map((item: any) => ({
        title: item.title,
        link: item.link,
        guid: item.guid,
        pubDate: item.pubDate,
        seeders: item["nyaa:seeders"],
        leechers: item["nyaa:leechers"],
        downloads: item["nyaa:downloads"],
        infoHash: item["nyaa:infoHash"],
        categoryId: item["nyaa:categoryId"],
        category: item["nyaa:category"],
        size: item["nyaa:size"],
        comments: item["nyaa:comments"],
        trusted: item["nyaa:trusted"],
        remake: item["nyaa:remake"],
      }));

      res.json(formattedItems);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- EXISTING BLOG API ---
  app.get("/api/blog", async (req, res) => {
    const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
    const preview = req.query.preview === "1" || req.query.preview === "true";
    if (!slug || typeof slug !== "string" || !getBlogPost(slug)) {
      return res.status(404).json({ error: "Blog post not found" });
    }

    try {
      const data = await getCachedBlogPost(slug, preview);
      const { articleSource: _articleSource, articleStatus: _articleStatus, ...publicData } = data;
      res.setHeader("Cache-Control", "public, s-maxage=25200, stale-while-revalidate=86400");
      return res.json(publicData);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware / production assets
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();