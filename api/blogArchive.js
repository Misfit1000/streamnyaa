const ARCHIVE_DIR = 'public/generated-blog-archive';
const REPOSITORY = process.env.GITHUB_ARTICLE_REPOSITORY || process.env.GITHUB_REPOSITORY || 'Misfit1000/StreamNyaa';
const BRANCH = process.env.GITHUB_ARTICLE_BRANCH || 'main';

function githubToken() {
  return process.env.GITHUB_ARTICLE_TOKEN || process.env.GH_ARTICLE_TOKEN || '';
}

function archivePath(articleSlug) {
  return `${ARCHIVE_DIR}/${articleSlug}.json`;
}

function apiUrl(pathname) {
  return `https://api.github.com/repos/${REPOSITORY}${pathname}`;
}

async function github(pathname, options = {}) {
  const token = githubToken();
  const response = await fetch(apiUrl(pathname), {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'StreamNyaa-Article-Archive',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const error = new Error(typeof data === 'object' && data?.message ? data.message : text);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function fileExists(pathname) {
  try {
    await github(`/contents/${encodeURIComponent(pathname).replace(/%2F/g, '/')}?ref=${encodeURIComponent(BRANCH)}`);
    return true;
  } catch (error) {
    if (error?.status === 404) return false;
    throw error;
  }
}

function toBase64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

export async function archiveBlogPost(post) {
  if (!post?.articleSlug || post.articleKind !== 'gemini' || !githubToken()) return false;
  const pathname = archivePath(post.articleSlug);

  try {
    if (await fileExists(pathname)) return true;
    await github(`/contents/${encodeURIComponent(pathname).replace(/%2F/g, '/')}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Archive blog article: ${post.articleSlug}`,
        content: toBase64(JSON.stringify(post, null, 2)),
        branch: BRANCH,
      }),
    });
    return true;
  } catch (error) {
    console.error('Blog archive save failed', error);
    return false;
  }
}

export async function listArchivedBlogPosts(limit = 60) {
  try {
    const files = await github(`/contents/${ARCHIVE_DIR}?ref=${encodeURIComponent(BRANCH)}`);
    if (!Array.isArray(files)) return [];
    const posts = await Promise.all(
      files
        .filter((file) => file.type === 'file' && file.name.endsWith('.json') && file.download_url)
        .slice(0, limit)
        .map(async (file) => {
          try {
            const response = await fetch(file.download_url, {
              headers: { Accept: 'application/json', 'User-Agent': 'StreamNyaa-Article-Archive' },
            });
            if (!response.ok) return null;
            return response.json();
          } catch {
            return null;
          }
        }),
    );

    return posts
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.generatedAt || b.updatedAt || '') - Date.parse(a.generatedAt || a.updatedAt || ''))
      .slice(0, limit);
  } catch (error) {
    if (error?.status !== 404) console.error('Blog archive list failed', error);
    return [];
  }
}

export async function findArchivedBlogPost(articleSlug) {
  try {
    const file = await github(`/contents/${archivePath(articleSlug)}?ref=${encodeURIComponent(BRANCH)}`);
    if (!file?.download_url) return null;
    const response = await fetch(file.download_url, {
      headers: { Accept: 'application/json', 'User-Agent': 'StreamNyaa-Article-Archive' },
    });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    if (error?.status !== 404) console.error('Blog archive lookup failed', error);
    return null;
  }
}
