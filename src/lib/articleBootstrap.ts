import type { BlogPostData } from '../api/blogShared';

/** Public article only. The server emits no session or account state. */
export function readArticleBootstrap(slug?: string): BlogPostData | undefined {
  if (!slug || typeof document === 'undefined') return;
  const script = document.getElementById('streamnyaa-article');
  if (!script?.textContent || script.textContent.length > 2 * 1024 * 1024) return;
  try {
    const value = JSON.parse(script.textContent);
    if (value.path !== `/blog/${slug}` || !value.post || !Array.isArray(value.post.items)
      || typeof value.post.slug !== 'string' || typeof value.post.title !== 'string'
      || !Array.isArray(value.post.article?.paragraphs)) return;
    return value.post as BlogPostData;
  } catch { return; }
}
