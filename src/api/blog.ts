export { BLOG_POSTS, getBlogPost } from './blogShared';
export type { BlogMediaItem, BlogPostData, BlogPostDefinition, BlogSlug } from './blogShared';

import type { BlogPostData } from './blogShared';

export async function fetchBlogPost(slug: string, preview = false): Promise<BlogPostData> {
  const params = new URLSearchParams({ slug, articleRev: '2026-05-06-daily-v2' });
  if (preview) params.set('preview', '1');
  const response = await fetch('/api/blog?' + params.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) throw new Error('Blog post not found');
  if (!response.ok) throw new Error('Blog post request failed');

  return response.json();
}
