import { fetchSupabaseUser, supabaseRest } from './_shared/adminAuth.js';

export default async function handler(req: any, res: any) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const user = await fetchSupabaseUser(token);
  if (!user?.id) return res.status(401).json({ error: 'Invalid session' });

  try {
    if (req.method === 'GET') {
      const requestedLimit = Number(req.query?.limit || 20);
      const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 50) : 20;
      const rows = await supabaseRest(`download_history?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc&limit=${limit}`);
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      await supabaseRest('download_history', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([{
          user_id: user.id,
          title: body.title,
          magnet: body.magnet,
          anime_title: body.animeTitle || null,
          anime_id: body.animeId ? String(body.animeId) : null,
          episode: body.episode ? String(body.episode) : null,
          action: body.action || 'copy',
          size: body.size || null,
          seeders: body.seeders ? String(body.seeders) : null,
          created_at: body.createdAt || new Date().toISOString(),
        }]),
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    if (error?.status === 404) return res.status(200).json({ ok: false, localOnly: true });
    return res.status(500).json({ error: error.message || 'Download history unavailable' });
  }
}
