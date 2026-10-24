import { findArchivedBlogPost, listArchivedBlogPostSummaries, listArchivedBlogPostSummaryPage, listArchivedBlogPosts, migrateArchivedBlogPostsToSupabase } from './blogArchive.js';
import {articleCacheTag} from './_shared/blogCache.js';

export default async function handler(req: any, res: any) {
  // Let renderers read public article JSON without indexing the transport URL.
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  if(slug&&(!/^[a-z0-9][a-z0-9-]{0,220}$/.test(String(slug)))){res.setHeader('Cache-Control','no-store');return res.status(400).json({error:'Invalid article identifier.'});}
  const migrate = req.query.migrate === '1' || req.query.migrate === 'true';
  const summary = req.query.summary === '1' || req.query.summary === 'true';
  const page = Number(Array.isArray(req.query.page) ? req.query.page[0] : req.query.page);
  const limit = Number(Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit);
  res.setHeader('Vercel-Cache-Tag',slug?articleCacheTag(String(slug)):'blog-archive');

  try {
    if (slug) {
      const post = await findArchivedBlogPost(slug);
      if (!post) return res.status(404).json({ error: 'Archived blog post not found' });
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=900, stale-while-revalidate=3600');
      return res.status(200).json(post);
    }

    if(migrate)return res.status(405).json({error:'Archive migration is not available through a public read.'});
    const migration = null;
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
    res.setHeader('Cache-Control','no-store');
    return res.status(error.status===503?503:500).json({ error: error.message || 'Failed to load archived blog posts' });
  }
}
