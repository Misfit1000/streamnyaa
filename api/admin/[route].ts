import {
  envAdminEmails,
  listStoredAdmins,
  requireAdmin,
  supabaseBaseUrl,
  supabaseRest,
  supabaseSecretKey,
} from '../_shared/adminAuth.js';

const BLOG_SLUGS = ['anime-trending-news-today', 'anime-viral-topic-today'];

function routeName(req: any) {
  const route = req.query?.route;
  return String(Array.isArray(route) ? route[0] : route || '').trim().toLowerCase();
}

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

async function admins(req: any, res: any) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });
    if (req.method === 'GET') {
      const rows = await supabaseRest('admin_users?select=email,created_at,created_by&order=created_at.desc');
      return res.status(200).json({ admins: rows });
    }
    if (req.method === 'POST') {
      const email = cleanEmail(String(req.body?.email || ''));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      await supabaseRest('admin_users?on_conflict=email', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ email, created_by: auth.user.email }),
      });
      return res.status(200).json({ ok: true, email });
    }
    if (req.method === 'DELETE') {
      const email = cleanEmail(String(req.query?.email || req.body?.email || ''));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (email === cleanEmail(auth.user.email || '')) return res.status(400).json({ error: 'You cannot remove your own admin access while signed in.' });
      const removed = await supabaseRest(`admin_users?email=eq.${encodeURIComponent(email)}`, {
        method: 'DELETE', headers: { Prefer: 'return=representation' },
      });
      return res.status(200).json({ ok: true, email, removed });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error(error);
    const message = error?.status === 404 ? 'Create the admin access table before adding admins.' : error?.message || 'Admin request failed.';
    return res.status(error?.status === 404 ? 409 : 500).json({ error: message });
  }
}

function requestOrigin(req: any) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

async function generateBlog(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });
    const mode = String(req.body?.mode || 'one');
    const slugs = mode === 'both' ? BLOG_SLUGS : [BLOG_SLUGS[0]];
    const secret = process.env.CRON_SECRET;
    const generated = [];
    const origin = requestOrigin(req);
    for (const slug of slugs) {
      const response = await fetch(`${origin}/api/blog?slug=${encodeURIComponent(slug)}&force=1&debug=1&manual=1`, {
        headers: {
          Accept: 'application/json',
          ...(secret ? { Authorization: `Bearer ${secret}` } : { Authorization: req.headers.authorization }),
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'User-Agent': 'StreamNyaa-Admin',
        },
      });
      const post = await response.json();
      if (!response.ok) throw new Error(post?.error || `Blog generation failed with ${response.status}`);
      generated.push({
        slug,
        articleSlug: post.articleSlug,
        title: post.article?.headline || post.topic?.title || post.title,
        generatedAt: post.generatedAt,
        articleStatus: post.articleStatus,
      });
    }
    return res.status(200).json({ ok: true, generated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Gemini article generation failed.' });
  }
}

async function fetchBlogArticleCount() {
  if (!supabaseBaseUrl() || !supabaseSecretKey()) return null;
  const response = await fetch(`${supabaseBaseUrl()}/rest/v1/blog_articles?select=id`, {
    method: 'HEAD',
    headers: {
      apikey: supabaseSecretKey(),
      Authorization: `Bearer ${supabaseSecretKey()}`,
      Prefer: 'count=exact',
    },
  });
  if (!response.ok) return null;
  const total = (response.headers.get('content-range') || '').split('/')[1];
  return total && total !== '*' ? Number(total) : null;
}

async function fetchRecentBlogArticles() {
  if (!supabaseBaseUrl() || !supabaseSecretKey()) return [];
  const params = new URLSearchParams({
    select: 'slug,title,category,updated_at,article_kind,source,status',
    order: 'updated_at.desc',
    limit: '8',
  });
  try {
    const rows = await supabaseRest(`blog_articles?${params.toString()}`);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function adminTableStatus() {
  try {
    await supabaseRest('admin_users?select=email&limit=1');
    return { ready: true, message: '' };
  } catch (error: any) {
    if (error?.status === 404) return { ready: false, message: 'Create the admin access table before adding admins from the dashboard.' };
    return { ready: false, message: error?.message || 'Admin table could not be checked.' };
  }
}

async function summary(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });
    const [articleCount, recentArticles, storedAdmins, tableStatus] = await Promise.all([
      fetchBlogArticleCount(), fetchRecentBlogArticles(), listStoredAdmins().catch(() => []), adminTableStatus(),
    ]);
    return res.status(200).json({
      adminEmail: auth.user.email,
      generatedBlogArticles: articleCount,
      recentArticles,
      cronSchedule: 'Daily between 5:45 AM and 6:44 AM Nepal time',
      admins: { env: envAdminEmails(), stored: storedAdmins, tableReady: tableStatus.ready, setupMessage: tableStatus.message },
      archive: {
        supabaseConfigured: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)),
        githubFallbackConfigured: Boolean(process.env.GITHUB_ARTICLE_TOKEN || process.env.GH_ARTICLE_TOKEN),
      },
      config: { geminiConfigured: Boolean(process.env.GEMINI_API_KEY), smtpExpected: true, productionUrl: 'https://www.streamnyaa.xyz' },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load admin summary' });
  }
}

export default function handler(req: any, res: any) {
  switch (routeName(req)) {
    case 'admins': return admins(req, res);
    case 'generate-blog': return generateBlog(req, res);
    case 'summary': return summary(req, res);
    default: return res.status(404).json({ error: 'Admin route not found' });
  }
}
