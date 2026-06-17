import { fetchSupabaseUser, supabaseRest } from './_shared/adminAuth.js';

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function bearerToken(req: any) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

function cleanString(value: unknown, fallback = '') {
  return String(value || fallback).trim();
}

function parseBody(req: any) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}

function encode(value: string) {
  return encodeURIComponent(value);
}

async function upsertProfile(user: any) {
  const row = {
    user_id: user.id,
    email: user.email || null,
    display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    updated_at: new Date().toISOString(),
  };

  try {
    const rows = await supabaseRest('user_profiles?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([row]),
    });
    return Array.isArray(rows) ? rows[0] || row : row;
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

async function getAccountData(user: any) {
  const userId = encode(user.id);
  const profile = await upsertProfile(user);

  let library: any[] = [];
  let watchHistory: any[] = [];

  try {
    const rows = await supabaseRest(`user_library?user_id=eq.${userId}&select=*&order=updated_at.desc&limit=500`);
    library = Array.isArray(rows) ? rows : [];
  } catch (error: any) {
    if (error?.status !== 404) throw error;
  }

  try {
    const rows = await supabaseRest(`user_watch_history?user_id=eq.${userId}&select=*&order=updated_at.desc&limit=100`);
    watchHistory = Array.isArray(rows) ? rows : [];
  } catch (error: any) {
    if (error?.status !== 404) throw error;
  }

  return { profile, library, watchHistory };
}

function normalizeLibraryRows(userId: string, rows: any[]) {
  const now = new Date().toISOString();
  return rows
    .slice(0, 500)
    .map((item) => {
      const animeId = cleanString(item.animeId || item.anime_id || item.anime?.mal_id || item.anime?.id || item.anime?.title);
      if (!animeId) return null;
      return {
        user_id: userId,
        anime_id: animeId,
        anime_title: cleanString(item.animeTitle || item.anime_title || item.anime?.title, animeId),
        anime: item.anime || { mal_id: animeId, title: item.animeTitle || animeId },
        bookmarked: Boolean(item.bookmarked),
        liked: Boolean(item.liked),
        updated_at: item.updatedAt || item.updated_at || now,
      };
    })
    .filter(Boolean);
}

function normalizeWatchHistoryRows(userId: string, rows: any[]) {
  const now = new Date().toISOString();
  return rows
    .slice(0, 100)
    .map((item) => {
      const key = cleanString(item.key || item.history_key);
      const source = item.source;
      if (!key || !source) return null;
      return {
        user_id: userId,
        history_key: key,
        source,
        anime_id: item.animeId || item.anime_id || source.animeId ? String(item.animeId || item.anime_id || source.animeId) : null,
        anime_title: item.animeTitle || item.anime_title || source.animeTitle || null,
        episode: item.episode ?? source.episode ?? null,
        progress_percent: Number(source.progressPercent || 0) || null,
        resume_seconds: Number(source.resumeSeconds || 0) || null,
        duration_seconds: Number(source.durationSeconds || 0) || null,
        updated_at: item.updatedAt || item.updated_at || now,
      };
    })
    .filter(Boolean);
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const user = await fetchSupabaseUser(token);
  if (!user?.id) return res.status(401).json({ error: 'Invalid session' });

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await getAccountData(user));
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const userId = user.id;
      const encodedUserId = encode(userId);

      await upsertProfile(user);

      if (Array.isArray(body.library)) {
        await supabaseRest(`user_library?user_id=eq.${encodedUserId}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
        const rows = normalizeLibraryRows(userId, body.library);
        if (rows.length) {
          await supabaseRest('user_library', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify(rows),
          });
        }
      }

      if (Array.isArray(body.watchHistory)) {
        await supabaseRest(`user_watch_history?user_id=eq.${encodedUserId}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
        const rows = normalizeWatchHistoryRows(userId, body.watchHistory);
        if (rows.length) {
          await supabaseRest('user_watch_history', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify(rows),
          });
        }
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    if (error?.status === 404) {
      return res.status(503).json({ error: 'Account sync tables are not configured yet.' });
    }
    return res.status(500).json({ error: error.message || 'Account sync unavailable' });
  }
}
