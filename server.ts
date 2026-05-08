import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { XMLParser } from "fast-xml-parser";

// 1. ADD THE NEW IMPORTS FOR THE SCRAPER
import axios from "axios";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

// 2. ADD THE GOGOANIME SCRAPER UTILITY AND KEYS
const keys = {
  key: CryptoJS.enc.Utf8.parse('37911490979715163134003223491201'),
  secondKey: CryptoJS.enc.Utf8.parse('54674138327930866480207815084989'),
  iv: CryptoJS.enc.Utf8.parse('3134003223491201'),
};

const GOGO_BASE_URL = 'https://gogoanime3.co';

async function extractGogoanimeSources(episodeId: string) {
  try {
    const episodePage = await axios.get(`${GOGO_BASE_URL}/${episodeId}`);
    const $ = cheerio.load(episodePage.data);
    const iframeUrl = $('div.anime_muti_link > ul > li.vidcdn > a').attr('data-video');
    if (!iframeUrl) throw new Error("Could not find video player iframe.");

    const parsedUrl = new URL(iframeUrl);
    const videoId = parsedUrl.searchParams.get('id');
    if (!videoId) throw new Error("Could not extract video ID.");

    const iframePage = await axios.get(iframeUrl);
    const $$ = cheerio.load(iframePage.data);
    const encryptedParams = $$("script[data-name='episode']").attr('data-value');
    if (!encryptedParams) throw new Error("Could not find encrypted parameters.");

    const decryptedToken = CryptoJS.AES.decrypt(encryptedParams, keys.key, { iv: keys.iv }).toString(CryptoJS.enc.Utf8);
    const encryptedRequestId = CryptoJS.AES.encrypt(videoId, keys.key, { iv: keys.iv }).toString();
    const ajaxUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}/encrypt-ajax.php?id=${encryptedRequestId}&alias=${videoId}&${decryptedToken}`;

    const finalResponse = await axios.get(ajaxUrl, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
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
    throw new Error("Failed to extract video links.");
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // --- YOUR EXISTING NYAA API ROUTE ---
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        }
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch from Nyaa' });
      }

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
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // 3. ADD THE NEW STREAM SOURCES API ROUTE
  app.get("/api/stream-sources", async (req, res) => {
    try {
      const { id } = req.query;
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: "Missing episode ID" });
      }

      const videoData = await extractGogoanimeSources(id);
      res.json(videoData);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to fetch stream sources" });
    }
  });

  // --- YOUR EXISTING VITE & STATIC FILE MIDDLEWARE ---
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
