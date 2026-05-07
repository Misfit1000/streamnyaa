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

function adminEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  try {
    const user = await fetchSupabaseUser(token);
    if (!user?.email) return res.status(401).json({ error: 'Invalid session' });

    const admins = adminEmails();
    const isAdmin = admins.has(String(user.email).toLowerCase());
    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      },
      isAdmin,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to verify session' });
  }
}
