const ARCHIVE_DIR = 'public/generated-blog-archive';
const REPOSITORY = process.env.GITHUB_ARTICLE_REPOSITORY || 'Misfit1000/StreamNyaa';
const BRANCH = process.env.GITHUB_ARTICLE_BRANCH || 'main';
const SITE_URL = (process.env.SITE_URL || 'https://www.streamnyaa.xyz').replace(/\/+$/, '');

function githubToken() {
  return process.env.GITHUB_ARTICLE_TOKEN || process.env.GH_ARTICLE_TOKEN || '';
}

function archivePath(articleSlug) {
  return `${ARCHIVE_DIR}/${articleSlug}.json`;
}

function publicArchiveUrl(articleSlug) {
  return `${SITE_URL}/generated-blog-archive/${encodeURIComponent(articleSlug)}.json`;
}

function publicIndexUrl() {
  return `${SITE_URL}/generated-blog-archive/index.json`;
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

async function archiveIndexSha() {
  try {
    const file = await github(`/contents/${ARCHIVE_DIR}/index.json?ref=${encodeURIComponent(BRANCH)}`);
    return file?.sha || undefined;
  } catch (error) {
    if (error?.status === 404) return undefined;
    throw error;
  }
}

async function updateArchiveIndex(articleSlug) {
  const current = await listArchiveSlugs();
  const slugs = [articleSlug, ...current.filter((slug) => slug !== articleSlug)];
  const sha = await archiveIndexSha();
  await github(`/contents/${ARCHIVE_DIR}/index.json`, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'Update blog archive index',
      content: toBase64(JSON.stringify({ slugs }, null, 2)),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

export async function archiveBlogPost(post) {
  if (!post?.articleSlug || post.articleKind !== 'gemini' || !githubToken()) return false;
  const pathname = archivePath(post.articleSlug);

  try {
    if (!(await fileExists(pathname))) {
      await github(`/contents/${encodeURIComponent(pathname).replace(/%2F/g, '/')}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Archive blog article: ${post.articleSlug}`,
          content: toBase64(JSON.stringify(post, null, 2)),
          branch: BRANCH,
        }),
      });
    }
    await updateArchiveIndex(post.articleSlug);
    return true;
  } catch (error) {
    console.error('Blog archive save failed', error);
    return false;
  }
}

async function listArchiveSlugs() {
  try {
    const response = await fetch(publicIndexUrl(), {
      headers: { Accept: 'application/json', 'User-Agent': 'StreamNyaa-Article-Archive' },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.slugs) ? data.slugs.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function listArchivedBlogPosts(limit = 60) {
  try {
    const slugs = await listArchiveSlugs();
    const posts = await Promise.all(
      slugs
        .slice(0, limit)
        .map(async (slug) => {
          try {
            const response = await fetch(publicArchiveUrl(slug), {
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
    const response = await fetch(publicArchiveUrl(articleSlug), {
      headers: { Accept: 'application/json', 'User-Agent': 'StreamNyaa-Article-Archive' },
    });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    if (error?.status !== 404) console.error('Blog archive lookup failed', error);
    return null;
  }
}
