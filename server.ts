import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import { getCachedBlogPost } from "./api/blog";
import { getBlogPost } from "./src/api/blogShared";

async function startServer() {
  const app = express();
  const PORT = 3000;

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
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_"
      });
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
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/blog", async (req, res) => {
    const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
    const preview = req.query.preview === "1" || req.query.preview === "true";
    if (!slug || typeof slug !== "string" || !getBlogPost(slug)) {
      return res.status(404).json({ error: "Blog post not found" });
    }

    try {
      const data = await getCachedBlogPost(slug, preview);
      res.setHeader("Cache-Control", "public, s-maxage=25200, stale-while-revalidate=86400");
      return res.json(data);
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // production static files
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
