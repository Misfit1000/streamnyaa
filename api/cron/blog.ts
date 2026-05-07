import { getCachedBlogPost } from '../blog';

const BLOG_SLUGS = ['anime-trending-news-today', 'anime-viral-topic-today'];

export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const warmed = [];

  for (const slug of BLOG_SLUGS) {
    try {
      const post = await getCachedBlogPost(slug, false, true);
      warmed.push({
        slug,
        status: 200,
        ok: true,
        articleSlug: post.articleSlug,
        generatedAt: post.generatedAt,
      });
    } catch (error: any) {
      console.error('Cron blog generation failed', slug, error);
      warmed.push({
        slug,
        status: 500,
        ok: false,
      });
    }
  }

  return res.status(warmed.every((item) => item.ok) ? 200 : 502).json({
    ok: warmed.every((item) => item.ok),
    warmed,
  });
}
