export function supabaseBaseUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
}

export function supabasePublicKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SECRET_KEY || '';
}

export function supabaseSecretKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function envAdminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function fetchSupabaseUser(token) {
  const url = supabaseBaseUrl();
  const key = supabasePublicKey();
  if (!url || !key) throw new Error('Supabase auth is not configured');

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) return null;
  return response.json();
}

export async function supabaseRest(pathname, options = {}) {
  const url = supabaseBaseUrl();
  const key = supabaseSecretKey();
  if (!url || !key) throw new Error('Supabase server key is not configured');

  const response = await fetch(`${url}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
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
    const error = new Error(data?.message || text || 'Supabase request failed');
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function listStoredAdmins() {
  try {
    const rows = await supabaseRest('admin_users?select=email,created_at,created_by&order=created_at.desc');
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (error?.status === 404) return [];
    throw error;
  }
}

export async function isAdminEmail(email) {
  const cleanEmail = email.trim().toLowerCase();
  if (envAdminEmails().includes(cleanEmail)) return true;
  const admins = await listStoredAdmins();
  return admins.some((admin) => String(admin.email || '').toLowerCase() === cleanEmail);
}

export async function requireAdmin(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return { error: 'Not signed in', status: 401 };

  const user = await fetchSupabaseUser(token);
  if (!user?.email) return { error: 'Invalid session', status: 401 };
  if (!(await isAdminEmail(user.email))) return { error: 'Admin access required', status: 403, user };
  return { user, token };
}
