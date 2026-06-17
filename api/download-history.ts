import { fetchSupabaseUser, supabaseRest } from './_shared/adminAuth.js';

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

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
      const title = String(body.title || '').trim();
      const magnet = String(body.magnet || '').trim();
      const action = body.action === 'open' ? 'open' : 'copy';
      if (!title || !magnet) return res.status(400).json({ error: 'History entry is missing title or source link' });

      try {
        await supabaseRest(`download_history?user_id=eq.${encodeURIComponent(user.id)}&magnet=eq.${encodeURIComponent(magnet)}&action=eq.${encodeURIComponent(action)}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
      } catch (deleteError: any) {
        if (deleteError?.status !== 404) throw deleteError;
      }

      await supabaseRest('download_history', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([{
          user_id: user.id,
          title,
          magnet,
          anime_title: body.animeTitle || null,
          anime_id: body.animeId ? String(body.animeId) : null,
          episode: body.episode ? String(body.episode) : null,
          action,
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
