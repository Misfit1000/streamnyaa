import express from "express";
import metadataHandler from "./api/stream-sources";
import sourceHandler from "./api/nyaa";
import path from "path";
import blogHandler, { getCachedBlogPost } from "./api/blog";
import { getBlogPost } from "./src/api/blogShared";

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', /^\/(?:login|reset-password|admin|dashboard|api\/auth)(?:\/|$)/.test(req.path) ? 'no-referrer' : 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });
  app.use(express.json({limit:'1mb'}));
  app.all('/api/stream-sources', (req,res)=>metadataHandler(req,res));
  const configuredPort = Number.parseInt(process.env.PORT || '3000', 10);
  const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3000;

  // --- NYAA API ---
  // Use the same validated, bounded implementation as the deployed function.
  app.get('/api/nyaa', (req, res) => sourceHandler(req, res));

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

  app.get('/blog/:slug', (req,res) => { req.query.render='1';req.query.slug=req.params.slug;return blogHandler(req,res); });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer();
