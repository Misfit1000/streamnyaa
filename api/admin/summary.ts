async function fetchSupabaseUser(token: string) {
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!supabaseUrl || !key) throw new Error('Supabase auth is not configured');

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) return null;
  return response.json();
}

function isAdminEmail(email: string) {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

async function fetchBlogArticleCount() {
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !key) return null;

  const response = await fetch(`${supabaseUrl}/rest/v1/blog_articles?select=id`, {
    method: 'HEAD',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
    },
  });

  if (!response.ok) return null;
  const range = response.headers.get('content-range') || '';
  const total = range.split('/')[1];
  return total && total !== '*' ? Number(total) : null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  try {
    const user = await fetchSupabaseUser(token);
    if (!user?.email || !isAdminEmail(user.email)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const articleCount = await fetchBlogArticleCount();
    return res.status(200).json({
      adminEmail: user.email,
      generatedBlogArticles: articleCount,
      cronSchedule: 'Daily between 5:45 AM and 6:44 AM Nepal time',
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
