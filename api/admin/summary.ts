import { envAdminEmails, listStoredAdmins, requireAdmin, supabaseBaseUrl, supabaseRest, supabaseSecretKey } from '../_shared/adminAuth.js';

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
  const range = response.headers.get('content-range') || '';
  const total = range.split('/')[1];
  return total && total !== '*' ? Number(total) : null;
}

async function adminTableStatus() {
  try {
    await supabaseRest('admin_users?select=email&limit=1');
    return { ready: true, message: '' };
  } catch (error: any) {
    if (error?.status === 404) {
      return { ready: false, message: 'Create the admin_users table in Supabase to add admins from the dashboard.' };
    }
    return { ready: false, message: error?.message || 'Admin table could not be checked.' };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

    const [articleCount, storedAdmins, tableStatus] = await Promise.all([
      fetchBlogArticleCount(),
      listStoredAdmins().catch(() => []),
      adminTableStatus(),
    ]);

    return res.status(200).json({
      adminEmail: auth.user.email,
      generatedBlogArticles: articleCount,
      cronSchedule: 'Daily between 5:45 AM and 6:44 AM Nepal time',
      admins: {
        env: envAdminEmails(),
        stored: storedAdmins,
        tableReady: tableStatus.ready,
        setupMessage: tableStatus.message,
      },
      storage: {
        supabaseConfigured: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)),
        githubFallbackConfigured: Boolean(process.env.GITHUB_ARTICLE_TOKEN || process.env.GH_ARTICLE_TOKEN),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load admin summary' });
  }
}
