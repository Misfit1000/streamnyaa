import { getCachedBlogPost } from './blog';

const SITE_URL = process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://www.streamnyaa.xyz';
const GEMINI_BLOG_SLUGS = ['anime-trending-news-today', 'anime-viral-topic-today'];

function siteOrigin() {
  const value = SITE_URL.startsWith('http') ? SITE_URL : `https://${SITE_URL}`;
  return value.replace(/\/+$/, '');
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default async function handler(_req: any, res: any) {
  const origin = siteOrigin();
  const urls = [];

  for (const slug of GEMINI_BLOG_SLUGS) {
    try {
      const post = await getCachedBlogPost(slug);
      const articleSlug = post.articleSlug || slug;
      urls.push({
        loc: `${origin}/blog/${articleSlug}`,
        lastmod: (post.generatedAt || post.updatedAt || new Date().toISOString()).slice(0, 10),
      });
    } catch (error) {
      console.error('Blog sitemap item failed', slug, error);
    }
  }

  const body = urls.map((url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`);
}
