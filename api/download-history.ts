import { fetchSupabaseUser, supabaseRest } from './_shared/adminAuth.js';

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Cache-Control', 'no-store');
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  try {
    const user = await fetchSupabaseUser(token);
    if (!user?.id) return res.status(401).json({ error: 'Invalid session' });
    if (req.method === 'GET') {
      const requestedLimit = Number(req.query?.limit || 20);
      const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 50) : 20;
      const rows = await supabaseRest(`download_history?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc&limit=${limit}`);
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const entries = Array.isArray(body.entries) ? body.entries : [body];
      if (!entries.length || entries.length > 30 || entries.some((entry: any) => !entry || !String(entry.title || '').trim() || !String(entry.magnet || '').trim())) {
        return res.status(400).json({ error: 'Provide 1–30 history entries with a title and source link' });
      }
      // Keep the legacy single-entry contract for installed desktop clients.
      const rows = new Map<string, any>();
      for (const entry of entries) {
        const title = String(entry.title).trim();
        const magnet = String(entry.magnet).trim();
        const action = entry.action === 'open' ? 'open' : 'copy';
        rows.set(JSON.stringify([magnet, action]), {
          user_id: user.id, title, magnet, action,
          anime_title: entry.animeTitle || null,
          anime_id: entry.animeId ? String(entry.animeId) : null,
          episode: entry.episode ? String(entry.episode) : null,
          size: entry.size || null,
          seeders: entry.seeders ? String(entry.seeders) : null,
          created_at: entry.createdAt || new Date().toISOString(),
        });
      }

      for (const { magnet, action } of rows.values()) {
        try {
          await supabaseRest(`download_history?user_id=eq.${encodeURIComponent(user.id)}&magnet=eq.${encodeURIComponent(magnet)}&action=eq.${encodeURIComponent(action)}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' },
          });
        } catch (deleteError: any) {
          if (deleteError?.status !== 404) throw deleteError;
        }
      }

      await supabaseRest('download_history', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([...rows.values()]),
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    if (error?.status === 404) return res.status(200).json({ ok: false, localOnly: true });
    return res.status(500).json({ error: error.message || 'Download history unavailable' });
  }
}
