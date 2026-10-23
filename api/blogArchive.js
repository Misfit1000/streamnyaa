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
    signal: AbortSignal.timeout(8000),
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
    signal: AbortSignal.timeout(8000),
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

async function supabaseWithHeaders(pathname, options = {}) {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) return null;

  const response = await fetch(`${url}/rest/v1/${pathname}`, {
    signal: AbortSignal.timeout(8000),
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

  return { data, headers: response.headers };
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
  let current = [], sha;
  try {
    const file = await github(`/contents/${ARCHIVE_DIR}/index.json?ref=${encodeURIComponent(BRANCH)}`);
    sha = file?.sha;
    const data = file?.content ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : {};
    current = Array.isArray(data.slugs) ? data.slugs : [];
  } catch (error) { if (error?.status !== 404) throw error; }
  const slugs = [articleSlug, ...current.filter((slug) => slug !== articleSlug)];
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
  if (savedToSupabase) return true;
  return archiveGithubBlogPost(post);
}

export async function latestPublishedBlogPost(slot) {
  try {
    const params = new URLSearchParams({select:'content', 'content->>slug':`eq.${slot}`,order:'updated_at.desc',limit:'1'});
    const rows = await supabase(`blog_articles?${params}`);
    if (rows?.[0]?.content?.articleSlug) return rows[0].content;
  } catch { /* Existing GitHub archive remains a read fallback. */ }
  const posts = await listGithubArchivedBlogPosts(12);
  return posts.find(post => post?.slug === slot && post?.articleSlug);
}

export async function listPrimaryPublishedBlogPosts(limit = 8) { return listSupabaseBlogPosts(limit); }
/** HTML must distinguish a confirmed missing article from a storage outage. */
export async function readPublishedArticle(articleSlug) {
  let primaryError;
  if (supabaseUrl() && supabaseKey()) {
    try {
      const rows=await supabase(`blog_articles?${new URLSearchParams({select:'content',slug:`eq.${articleSlug}`,limit:'1'})}`);
      if (!Array.isArray(rows)) throw Error('Invalid article storage response.');
      if (rows[0]?.content) return rows[0].content;
    } catch (error) { primaryError=error; }
  } else primaryError=Error('Article storage is unavailable.');
  try {
    const file=await github(`/contents/${archivePath(articleSlug)}?ref=${encodeURIComponent(BRANCH)}`);
    if (file?.content) return JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
    throw Error('Invalid archive response.');
  } catch (error) {
    if (error?.status===404 && !primaryError) return null;
    throw Object.assign(Error('Published article storage is temporarily unavailable.'),{status:503});
  }
}
export async function findDurableBlogPost(articleSlug) {
  const primary = await findSupabaseBlogPost(articleSlug);
  if (primary) return primary;
  if (!githubToken()) return null;
  try {
    const file = await github(`/contents/${archivePath(articleSlug)}?ref=${encodeURIComponent(BRANCH)}`);
    return file?.content ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : null;
  } catch { return null; }
}

export async function publishedBlogSitemap() {
  try {
    const rows = await supabase('blog_articles?select=slug,updated_at&order=updated_at.desc&limit=1000');
    if (Array.isArray(rows)) return rows.map(row => ({articleSlug:row.slug,updatedAt:row.updated_at}));
  } catch { /* Read-only archive fallback. */ }
  return (await listGithubArchivedBlogPosts(100)).map(post => ({articleSlug:post.articleSlug,updatedAt:post.publication?.updatedAt||post.updatedAt||post.generatedAt}));
}

async function archiveSupabaseBlogPost(post) {
  if (!supabaseUrl() || !supabaseKey()) return false;

  try {
    if (post.publication) post.publication.storage = 'supabase';
    const heroAnime = post.topic
      ? post.items?.find((anime) => anime.mal_id === post.topic?.malId || anime.id === post.topic?.animeId)
      : post.items?.[0];

    const saved = await supabase('blog_articles?on_conflict=slug&select=slug', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
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
    return Array.isArray(saved) && saved.some(row => row.slug === post.articleSlug);
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
  if (post.publication) post.publication.storage = 'github';
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
    if (supabasePosts.length >= limit) return supabasePosts;
    const githubPosts = await listGithubArchivedBlogPosts(limit);
    const supabaseSlugs = new Set(supabasePosts.map((post) => post.articleSlug).filter(Boolean));
    const missingSupabasePosts = githubPosts.filter((post) => post?.articleKind === 'gemini' && post.articleSlug && !supabaseSlugs.has(post.articleSlug));

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
    contentKind: post.contentKind,
    publication: post.publication,
    sources: post.sources,
    qualityVersion: post.qualityVersion,
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
        select: 'slug,title,excerpt,topic,image,source,updated_at,content_kind:content->>contentKind,publication:content->publication,slot:content->>slug,content_category:content->>category',
        order: 'updated_at.desc',
        limit: String(limit),
      });
      const rows = await supabase(`blog_articles?${params.toString()}`);
      if (Array.isArray(rows) && rows.length) {
        return rows.map((row) => ({
          slug: row.slot || 'anime-trending-news-today',
          title: row.title || 'Anime News',
          seoTitle: `${row.title || 'Anime News'} | StreamNyaa`,
          category: row.content_category || (row.content_kind === 'guide' ? 'Guide' : row.content_kind === 'weekly-ranking' ? 'Weekly' : row.content_kind === 'data-report' ? 'Data' : 'News'),
          contentKind: row.content_kind || 'news',
          publication: row.publication,
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

function parseTotalCount(contentRange) {
  const total = String(contentRange || '').split('/')[1];
  const parsed = Number(total);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function listArchivedBlogPostSummaryPage({ page = 1, limit = 12 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 12, 24));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  if (supabaseUrl() && supabaseKey()) {
    try {
      const params = new URLSearchParams({
        select: 'slug,title,excerpt,topic,image,source,updated_at,content_kind:content->>contentKind,publication:content->publication,slot:content->>slug,content_category:content->>category',
        order: 'updated_at.desc',
        limit: String(safeLimit),
        offset: String(offset),
      });
      const result = await supabaseWithHeaders(`blog_articles?${params.toString()}`, {
        headers: { Prefer: 'count=exact' },
      });
      const rows = result?.data;
      const total = parseTotalCount(result?.headers?.get('content-range'));
      if (Array.isArray(rows)) {
        const posts = rows.map((row) => ({
          slug: row.slot || 'anime-trending-news-today',
          title: row.title || 'Anime News',
          seoTitle: `${row.title || 'Anime News'} | StreamNyaa`,
          category: row.content_category || (row.content_kind === 'guide' ? 'Guide' : row.content_kind === 'weekly-ranking' ? 'Weekly' : row.content_kind === 'data-report' ? 'Data' : 'News'),
          contentKind: row.content_kind || 'news',
          publication: row.publication,
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

        return {
          posts,
          pagination: {
            page: safePage,
            limit: safeLimit,
            total: total ?? offset + posts.length,
            totalPages: Math.max(1, Math.ceil((total ?? offset + posts.length) / safeLimit)),
            hasNextPage: total === undefined ? posts.length === safeLimit : offset + posts.length < total,
            hasPreviousPage: safePage > 1,
          },
        };
      }
    } catch (error) {
      console.error('Supabase blog archive summary page failed', error);
    }
  }

  const slugs = await listArchiveSlugs();
  const pageSlugs = slugs.slice(offset, offset + safeLimit);
  const posts = await Promise.all(
    pageSlugs.map(async (slug) => {
      try {
        const response = await fetch(publicArchiveUrl(slug), {
          headers: { Accept: 'application/json', 'User-Agent': 'StreamNyaa-Article-Archive' },
        });
        if (!response.ok) return null;
        return summarizeArchivedPost(await response.json());
      } catch {
        return null;
      }
    }),
  );

  return {
    posts: posts.filter(Boolean),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: slugs.length,
      totalPages: Math.max(1, Math.ceil(slugs.length / safeLimit)),
      hasNextPage: offset + safeLimit < slugs.length,
      hasPreviousPage: safePage > 1,
    },
  };
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
