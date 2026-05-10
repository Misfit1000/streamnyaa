import { requireAdmin } from '../_shared/adminAuth.js';

const BLOG_SLUGS = ['anime-trending-news-today', 'anime-viral-topic-today'];

function requestOrigin(req: any) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

    const mode = String(req.body?.mode || 'one');
    const slugs = mode === 'both' ? BLOG_SLUGS : [BLOG_SLUGS[0]];
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(500).json({ error: 'Blog generation secret is missing.' });

    const generated = [];
    const origin = requestOrigin(req);

    for (const slug of slugs) {
      const response = await fetch(`${origin}/api/blog?slug=${encodeURIComponent(slug)}&force=1&debug=1`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${secret}`,
          'User-Agent': 'StreamNyaa-Admin',
        },
      });
      const post = await response.json();
      if (!response.ok) throw new Error(post?.error || `Blog generation failed with ${response.status}`);
      generated.push({
        slug,
        articleSlug: post.articleSlug,
        title: post.article?.headline || post.topic?.title || post.title,
        generatedAt: post.generatedAt,
        articleStatus: post.articleStatus,
      });
    }

    return res.status(200).json({ ok: true, generated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Gemini article generation failed.' });
  }
}
