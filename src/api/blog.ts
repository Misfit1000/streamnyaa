export { BLOG_POSTS, getBlogPost } from './blogShared';
export type { BlogMediaItem, BlogPostData, BlogPostDefinition, BlogSlug } from './blogShared';

import type { BlogPostData } from './blogShared';

export async function fetchBlogPost(slug: string): Promise<BlogPostData> {
  const response = await fetch('/api/blog?slug=' + encodeURIComponent(slug), {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) throw new Error('Blog post not found');
  if (!response.ok) throw new Error('Blog post request failed');

  return response.json();
}
