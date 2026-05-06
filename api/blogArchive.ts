const ARCHIVE_PREFIX = 'blog-articles/';

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function archivePath(articleSlug: string) {
  return `${ARCHIVE_PREFIX}${articleSlug}.json`;
}

async function blobClient() {
  if (!hasBlobToken()) return null;
  try {
    return await import('@vercel/blob');
  } catch (error) {
    console.error('Vercel Blob SDK is not available', error);
    return null;
  }
}

async function readBlobJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'StreamNyaa-Archive/1.0' },
  });
  if (!response.ok) throw new Error(`Archive read failed with ${response.status}`);
  return response.json();
}

export async function archiveBlogPost(post: any) {
  if (!post?.articleSlug || post.articleKind !== 'gemini') return false;
  const client = await blobClient();
  if (!client) return false;

  try {
    await client.put(archivePath(post.articleSlug), JSON.stringify(post), {
      access: 'public',
      allowOverwrite: false,
      contentType: 'application/json; charset=utf-8',
      cacheControlMaxAge: 86400,
    });
    return true;
  } catch (error: any) {
    const message = String(error?.message || error || '');
    if (message.toLowerCase().includes('already exists') || message.toLowerCase().includes('conflict')) return true;
    console.error('Blog archive save failed', error);
    return false;
  }
}

export async function listArchivedBlogPosts(limit = 60) {
  const client = await blobClient();
  if (!client) return [];

  try {
    const { blobs } = await client.list({ prefix: ARCHIVE_PREFIX, limit });
    const posts = await Promise.all(
      blobs
        .filter((blob) => blob.pathname.endsWith('.json'))
        .map(async (blob) => {
          try {
            return await readBlobJson(blob.url);
          } catch (error) {
            console.error('Archived blog item failed', blob.pathname, error);
            return null;
          }
        }),
    );

    return posts
      .filter(Boolean)
      .sort((a: any, b: any) => Date.parse(b.generatedAt || b.updatedAt || '') - Date.parse(a.generatedAt || a.updatedAt || ''))
      .slice(0, limit);
  } catch (error) {
    console.error('Blog archive list failed', error);
    return [];
  }
}

export async function findArchivedBlogPost(articleSlug: string) {
  const client = await blobClient();
  if (!client) return null;

  try {
    const { blobs } = await client.list({ prefix: archivePath(articleSlug), limit: 1 });
    const blob = blobs.find((item) => item.pathname === archivePath(articleSlug));
    if (!blob) return null;
    return await readBlobJson(blob.url);
  } catch (error) {
    console.error('Blog archive lookup failed', error);
    return null;
  }
}
