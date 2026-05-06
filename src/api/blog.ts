export { BLOG_POSTS, getBlogPost } from './blogShared';
export type { BlogMediaItem, BlogPostData, BlogPostDefinition, BlogSlug } from './blogShared';

import { BLOG_POSTS } from './blogShared';
import type { BlogPostData } from './blogShared';
import { slugifyTitle } from '../lib/slug';

export function articlePath(post: Pick<BlogPostData, 'slug' | 'title' | 'articleKind' | 'articleSlug' | 'article' | 'topic'>) {
  if (post.articleKind !== 'gemini') return '/blog/' + post.slug;
  const generatedSlug = post.articleSlug || slugifyTitle(post.article?.headline || post.topic?.title || post.title);
  return '/blog/' + generatedSlug;
}

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

export async function fetchBlogPostByArticleSlug(articleSlug: string): Promise<BlogPostData> {
  const geminiPosts = BLOG_POSTS.filter((post) => post.articleKind === 'gemini');
  const posts = await Promise.all(geminiPosts.map((post) => fetchBlogPost(post.slug)));
  const match = posts.find((post) => articlePath(post).replace('/blog/', '') === articleSlug);
  if (!match) throw new Error('Blog post not found');
  return match;
}
