import { findArchivedBlogPost, listArchivedBlogPostSummaries, listArchivedBlogPostSummaryPage, listArchivedBlogPosts, migrateArchivedBlogPostsToSupabase } from './blogArchive.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  const migrate = req.query.migrate === '1' || req.query.migrate === 'true';
  const summary = req.query.summary === '1' || req.query.summary === 'true';
  const page = Number(Array.isArray(req.query.page) ? req.query.page[0] : req.query.page);
  const limit = Number(Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit);

  try {
    if (slug) {
      const post = await findArchivedBlogPost(slug);
      if (!post) return res.status(404).json({ error: 'Archived blog post not found' });
      return res.status(200).json(post);
    }

    const migration = migrate ? await migrateArchivedBlogPostsToSupabase() : null;
    if (summary && (page || limit)) {
      const result = await listArchivedBlogPostSummaryPage({ page, limit });
      res.setHeader('Cache-Control', migrate ? 'no-store' : 'public, s-maxage=900, stale-while-revalidate=3600');
      return res.status(200).json(migration ? { migration, ...result } : result);
    }

    const posts = summary ? await listArchivedBlogPostSummaries(limit || undefined) : await listArchivedBlogPosts(limit || undefined);
    res.setHeader('Cache-Control', migrate ? 'no-store' : 'public, s-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json(migration ? { migration, posts } : { posts });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to load archived blog posts' });
  }
}
