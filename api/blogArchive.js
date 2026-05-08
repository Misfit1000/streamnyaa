const ARCHIVE_DIR = 'public/generated-blog-archive';
const REPOSITORY = process.env.GITHUB_ARTICLE_REPOSITORY || 'Misfit1000/StreamNyaa';
const BRANCH = process.env.GITHUB_ARTICLE_BRANCH || 'main';
const SITE_URL = (process.env.SITE_URL || 'https://www.streamnyaa.xyz').replace(/\/+$/, '');
const supabaseArchiveErrors = [];

function supabaseUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
}

function supabaseKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

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

async function supabase(pathname, options = {}) {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) return null;

  const response = await fetch(`${url}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'StreamNyaa-Article-Archive',
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
  if (!post?.articleSlug || post.articleKind !== 'gemini') return false;

  const savedToSupabase = await archiveSupabaseBlogPost(post);
  const savedToGithub = await archiveGithubBlogPost(post);
  return savedToSupabase || savedToGithub;
}

async function archiveSupabaseBlogPost(post) {
  if (!supabaseUrl() || !supabaseKey()) return false;

  try {
    const heroAnime = post.topic
      ? post.items?.find((anime) => anime.mal_id === post.topic?.malId || anime.id === post.topic?.animeId)
      : post.items?.[0];

    await supabase('blog_articles?on_conflict=slug', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        slug: post.articleSlug,
        title: post.article?.headline || post.topic?.title || post.title,
        excerpt: post.article?.excerpt || post.summary || '',
        content: post,
        topic: post.topic || null,
        image: post.topic?.image || heroAnime?.image || null,
        source: post.articleSource || 'gemini',
        updated_at: post.generatedAt || post.updatedAt || new Date().toISOString(),
      }),
    });
    return true;
  } catch (error) {
    console.error('Supabase blog archive save failed', error);
    supabaseArchiveErrors.push({
      slug: post.articleSlug,
      status: error?.status || null,
      message: String(error?.message || error || 'Unknown Supabase error').slice(0, 300),
    });
    return false;
  }
}

async function archiveGithubBlogPost(post) {
  if (!githubToken()) return false;
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

async function listGithubArchivedBlogPosts(limit = 60) {
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

  return posts.filter(Boolean);
}

export async function migrateArchivedBlogPostsToSupabase(limit = 60) {
  supabaseArchiveErrors.length = 0;
  const supabaseConfigured = Boolean(supabaseUrl() && supabaseKey());
  const supabasePosts = await listSupabaseBlogPosts(limit);
  const githubPosts = await listGithubArchivedBlogPosts(limit);
  const supabaseSlugs = new Set(supabasePosts.map((post) => post.articleSlug).filter(Boolean));
  const missingSupabasePosts = githubPosts.filter((post) => post?.articleKind === 'gemini' && post.articleSlug && !supabaseSlugs.has(post.articleSlug));
  const results = supabaseConfigured
    ? await Promise.all(missingSupabasePosts.slice(0, 20).map((post) => archiveSupabaseBlogPost(post)))
    : [];

  return {
    supabaseConfigured,
    githubArchivedPosts: githubPosts.length,
    existingSupabasePosts: supabasePosts.length,
    attempted: supabaseConfigured ? missingSupabasePosts.length : 0,
    saved: results.filter(Boolean).length,
    errors: supabaseArchiveErrors.slice(0, 3),
  };
}

export async function listArchivedBlogPosts(limit = 60) {
  try {
    const supabasePosts = await listSupabaseBlogPosts(limit);
    const githubPosts = await listGithubArchivedBlogPosts(limit);
    const supabaseSlugs = new Set(supabasePosts.map((post) => post.articleSlug).filter(Boolean));
    const missingSupabasePosts = githubPosts.filter((post) => post?.articleKind === 'gemini' && post.articleSlug && !supabaseSlugs.has(post.articleSlug));

    if (missingSupabasePosts.length && supabaseUrl() && supabaseKey()) {
      await Promise.all(missingSupabasePosts.slice(0, 20).map((post) => archiveSupabaseBlogPost(post)));
    }

    return [...supabasePosts, ...githubPosts]
      .filter(Boolean)
      .filter((post, index, list) => list.findIndex((item) => item.articleSlug === post.articleSlug) === index)
      .sort((a, b) => Date.parse(b.generatedAt || b.updatedAt || '') - Date.parse(a.generatedAt || a.updatedAt || ''))
      .slice(0, limit);
  } catch (error) {
    if (error?.status !== 404) console.error('Blog archive list failed', error);
    return [];
  }
}

function summarizeArchivedPost(post) {
  if (!post) return null;
  const heroAnime = post.topic
    ? post.items?.find((anime) => anime.mal_id === post.topic?.malId || anime.id === post.topic?.animeId)
    : post.items?.[0];

  return {
    slug: post.slug,
    title: post.title,
    seoTitle: post.seoTitle,
    category: post.category,
    description: post.description,
    summary: post.summary,
    intro: post.intro,
    angle: post.angle,
    readerPromise: post.readerPromise,
    articleKind: post.articleKind,
    sortRank: post.sortRank,
    updatedAt: post.updatedAt,
    generatedAt: post.generatedAt,
    articleSlug: post.articleSlug,
    articleSource: post.articleSource,
    articleStatus: post.articleStatus,
    topic: post.topic || null,
    items: heroAnime ? [heroAnime] : [],
    article: post.article ? {
      seoTitle: post.article.seoTitle,
      metaDescription: post.article.metaDescription,
      headline: post.article.headline,
      excerpt: post.article.excerpt,
      heroCallout: post.article.heroCallout,
      paragraphs: [],
      sections: [],
      takeaways: [],
      faq: [],
    } : undefined,
  };
}

export async function listArchivedBlogPostSummaries(limit = 24) {
  if (supabaseUrl() && supabaseKey()) {
    try {
      const params = new URLSearchParams({
        select: 'slug,title,excerpt,topic,image,source,updated_at',
        order: 'updated_at.desc',
        limit: String(limit),
      });
      const rows = await supabase(`blog_articles?${params.toString()}`);
      if (Array.isArray(rows) && rows.length) {
        return rows.map((row) => ({
          slug: 'anime-trending-news-today',
          title: row.title || 'Anime News',
          seoTitle: `${row.title || 'Anime News'} | StreamNyaa`,
          category: 'News',
          description: row.excerpt || '',
          summary: row.excerpt || '',
          intro: row.excerpt || '',
          angle: 'current anime news',
          readerPromise: 'Read a focused anime news article.',
          articleKind: 'gemini',
          sortRank: 100,
          updatedAt: row.updated_at,
          generatedAt: row.updated_at,
          articleSlug: row.slug,
          articleSource: row.source || 'gemini',
          articleStatus: 'summary',
          topic: row.topic || null,
          items: row.topic ? [{
            id: row.topic.animeId || row.topic.malId || 0,
            mal_id: row.topic.malId || row.topic.animeId || 0,
            title: row.topic.animeTitle || row.title || 'Anime',
            description: row.excerpt || '',
            image: row.image || row.topic.image || '',
            genres: [],
            studios: [],
          }] : [],
          article: {
            headline: row.title || row.topic?.title || 'Anime News',
            excerpt: row.excerpt || row.topic?.summary || '',
            heroCallout: row.excerpt || row.topic?.summary || '',
            paragraphs: [],
            sections: [],
            takeaways: [],
            faq: [],
          },
        }));
      }
    } catch (error) {
      console.error('Supabase blog archive summary list failed', error);
    }
  }

  const posts = await listGithubArchivedBlogPosts(limit);
  return posts.map(summarizeArchivedPost).filter(Boolean);
}

async function listSupabaseBlogPosts(limit = 60) {
  if (!supabaseUrl() || !supabaseKey()) return [];

  try {
    const params = new URLSearchParams({
      select: 'content',
      order: 'updated_at.desc',
      limit: String(limit),
    });
    const rows = await supabase(`blog_articles?${params.toString()}`);
    return Array.isArray(rows) ? rows.map((row) => row.content).filter(Boolean) : [];
  } catch (error) {
    console.error('Supabase blog archive list failed', error);
    return [];
  }
}

export async function findArchivedBlogPost(articleSlug) {
  const supabasePost = await findSupabaseBlogPost(articleSlug);
  if (supabasePost) return supabasePost;

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

async function findSupabaseBlogPost(articleSlug) {
  if (!supabaseUrl() || !supabaseKey()) return null;

  try {
    const params = new URLSearchParams({
      select: 'content',
      slug: `eq.${articleSlug}`,
      limit: '1',
    });
    const rows = await supabase(`blog_articles?${params.toString()}`);
    return Array.isArray(rows) && rows[0]?.content ? rows[0].content : null;
  } catch (error) {
    console.error('Supabase blog archive lookup failed', error);
    return null;
  }
}
