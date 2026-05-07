import { requireAdmin, supabaseRest } from '../_shared/adminAuth';

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const admins = await supabaseRest('admin_users?select=email,created_at,created_by&order=created_at.desc');
      return res.status(200).json({ admins });
    }

    if (req.method === 'POST') {
      const email = cleanEmail(String(req.body?.email || ''));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }

      await supabaseRest('admin_users?on_conflict=email', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          email,
          created_by: auth.user.email,
        }),
      });
      return res.status(200).json({ ok: true, email });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error(error);
    const message = error?.status === 404
      ? 'Create the admin_users table in Supabase before adding admins.'
      : error?.message || 'Admin request failed.';
    return res.status(error?.status === 404 ? 409 : 500).json({ error: message });
  }
}
