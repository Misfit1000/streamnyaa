import { findArchivedBlogPost, listArchivedBlogPostSummaries, listArchivedBlogPosts, migrateArchivedBlogPostsToSupabase } from './blogArchive.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  const migrate = req.query.migrate === '1' || req.query.migrate === 'true';
  const summary = req.query.summary === '1' || req.query.summary === 'true';

  try {
    if (slug) {
      const post = await findArchivedBlogPost(slug);
      if (!post) return res.status(404).json({ error: 'Archived blog post not found' });
      return res.status(200).json(post);
    }

    const migration = migrate ? await migrateArchivedBlogPostsToSupabase() : null;
    const posts = summary ? await listArchivedBlogPostSummaries() : await listArchivedBlogPosts();
    res.setHeader('Cache-Control', migrate ? 'no-store' : 'public, s-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json(migration ? { migration, posts } : { posts });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to load archived blog posts' });
  }
}
