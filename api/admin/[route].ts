import {
  envAdminEmails,
  listStoredAdmins,
  requireAdmin,
  supabaseBaseUrl,
  supabaseRest,
  supabaseSecretKey,
} from '../_shared/adminAuth.js';

import { generateBlog, summary, generationStatusRoute } from '../_shared/adminPublishing.js';
export const maxDuration = 300;

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

export default function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  switch (routeName(req)) {
    case 'admins': return admins(req, res);
    case 'generate-blog': return generateBlog(req, res);
    case 'generation-status': return generationStatusRoute(req, res);
    case 'summary': return summary(req, res);
    default: return res.status(404).json({ error: 'Admin route not found' });
  }
}
