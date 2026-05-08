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
  const archived = await fetch('/api/blog-archive?slug=' + encodeURIComponent(articleSlug), {
    headers: { Accept: 'application/json' },
  });
  if (archived.ok) return archived.json();

  const geminiPosts = BLOG_POSTS.filter((post) => post.articleKind === 'gemini');
  const posts = await Promise.all(geminiPosts.map((post) => fetchBlogPost(post.slug)));
  const match = posts.find((post) => articlePath(post).replace('/blog/', '') === articleSlug);
  if (!match) throw new Error('Blog post not found');
  return match;
}

export async function fetchArchivedBlogPosts(summary = false): Promise<BlogPostData[]> {
  const response = await fetch('/api/blog-archive' + (summary ? '?summary=1' : ''), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.posts) ? data.posts : [];
}

export interface BlogArchivePage {
  posts: BlogPostData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export async function fetchArchivedBlogPostPage(page = 1, limit = 12): Promise<BlogArchivePage> {
  const params = new URLSearchParams({
    summary: '1',
    page: String(page),
    limit: String(limit),
  });
  const response = await fetch('/api/blog-archive?' + params.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    return {
      posts: [],
      pagination: { page, limit, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: page > 1 },
    };
  }
  const data = await response.json();
  return {
    posts: Array.isArray(data.posts) ? data.posts : [],
    pagination: {
      page: Number(data.pagination?.page) || page,
      limit: Number(data.pagination?.limit) || limit,
      total: Number(data.pagination?.total) || 0,
      totalPages: Math.max(1, Number(data.pagination?.totalPages) || 1),
      hasNextPage: Boolean(data.pagination?.hasNextPage),
      hasPreviousPage: Boolean(data.pagination?.hasPreviousPage),
    },
  };
}
