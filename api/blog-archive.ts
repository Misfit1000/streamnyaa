import { findArchivedBlogPost, listArchivedBlogPosts } from './blogArchive.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;

  try {
    if (slug) {
      const post = await findArchivedBlogPost(slug);
      if (!post) return res.status(404).json({ error: 'Archived blog post not found' });
      return res.status(200).json(post);
    }

    const posts = await listArchivedBlogPosts();
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json({ posts });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to load archived blog posts' });
  }
}
