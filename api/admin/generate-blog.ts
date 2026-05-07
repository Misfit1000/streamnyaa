import { getCachedBlogPost } from '../blog';
import { requireAdmin } from '../_shared/adminAuth';

const BLOG_SLUGS = ['anime-trending-news-today', 'anime-viral-topic-today'];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

    const mode = String(req.body?.mode || 'one');
    const slugs = mode === 'both' ? BLOG_SLUGS : [BLOG_SLUGS[0]];
    const generated = [];

    for (const slug of slugs) {
      const post = await getCachedBlogPost(slug, false, true);
      generated.push({
        slug,
        articleSlug: post.articleSlug,
        title: post.article?.headline || post.topic?.title || post.title,
        generatedAt: post.generatedAt,
      });
    }

    return res.status(200).json({ ok: true, generated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Gemini article generation failed.' });
  }
}
