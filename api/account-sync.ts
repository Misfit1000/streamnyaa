import { fetchSupabaseUser, supabaseRest } from './_shared/adminAuth.js';

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
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

  const rows = await supabaseRest('user_profiles?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([row]),
  });
  return Array.isArray(rows) ? rows[0] || row : row;
}

async function getAccountData(user: any, token?:string, version3=false) {
  const userId = encode(user.id);
  const profile = await upsertProfile(user);

  let library: any[] = [];
  let watchHistory: any[] = [];

  const libraryRows = await supabaseRest(`user_library?user_id=eq.${userId}&select=*&order=updated_at.desc&limit=500`);
  library = Array.isArray(libraryRows) ? libraryRows : [];

  if(token){
    try {
      const current=await supabaseRest('rpc/history_sync_v3',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({p_request:{action:'read'}})});
      if(current?.migrated){
        const rows=(current.resumes || []).map((r:any)=>({history_key:`${r.identity}::${r.episode}`,anime_id:r.animeId,anime_title:r.title,episode:r.episode,poster_url:r.poster,resume_seconds:r.positionSeconds,duration_seconds:r.durationSeconds,progress_percent:r.progressPercent,completed:r.completed,source:r.watchedCoverage?{watchedCoverage:r.watchedCoverage}:null,updated_at:new Date(r.updatedAt).toISOString()}));
        return {profile,library,watchHistory:rows,...(version3?{historyVersion:3,tracking:current.tracking}: {})};
      }
    }catch(error:any){if(error?.status!==404)throw error;}
  }
  const watchRows = await supabaseRest(`user_watch_history?user_id=eq.${userId}&select=*&order=updated_at.desc&limit=500`);
  watchHistory = Array.isArray(watchRows) ? watchRows : [];

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
        deleted_at: item.deletedAt || item.deleted_at || null,
      };
    })
    .filter(Boolean);
}

export function normalizeWatchHistoryRows(userId: string, rows: any[]) {
  const now = new Date().toISOString();
  return rows
    .slice(0, 500)
    .map((item) => {
      const key = cleanString(item.key || item.history_key);
      const legacySource = item.source || item;
      if (!key) return null;
      return {
        user_id: userId,
        history_key: key,
        source: item.watchedCoverage || legacySource?.watchedCoverage ? {watchedCoverage:item.watchedCoverage || legacySource.watchedCoverage} : null,
        anime_id: item.animeId || item.anime_id || legacySource?.animeId ? String(item.animeId || item.anime_id || legacySource?.animeId) : null,
        anime_title: item.animeTitle || item.anime_title || legacySource?.animeTitle || null,
        episode: item.episode ?? legacySource?.episode ?? null,
        poster_url: item.poster || item.poster_url || legacySource?.poster || legacySource?.image || null,
        progress_percent: Number(item.watchedPercent ?? item.progress_percent ?? legacySource?.progressPercent ?? 0),
        resume_seconds: Number(item.positionSeconds ?? item.resume_seconds ?? legacySource?.resumeSeconds ?? 0),
        duration_seconds: Number(item.durationSeconds ?? item.duration_seconds ?? legacySource?.durationSeconds ?? 0),
        completed: Boolean(item.completed ?? legacySource?.completed),
        updated_at: item.updatedAt || item.updated_at || now,
        deleted_at: item.deletedAt || item.deleted_at || null,
      };
    })
    .filter(Boolean);
}

async function upsertRowsSafely(
  table: 'user_library' | 'user_watch_history',
  keyColumn: 'anime_id' | 'history_key',
  rows: any[],
) {
  if (!rows.length) return;
  await supabaseRest(`${table}?on_conflict=user_id,${keyColumn}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
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
      return res.status(200).json(await getAccountData(user,token,String(req.query?.historyVersion || '')==='3'));
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const userId = user.id;
      if (body.version === 3) {
        // Execute as the authenticated user, never as the gateway's service role.
        const data = await supabaseRest('rpc/history_sync_v3', {
          method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({p_request:body.request || {action:'read'}}),
        });
        return res.status(200).json(data);
      }

      await upsertProfile(user);

      if (Array.isArray(body.library)) {
        const rows = normalizeLibraryRows(userId, body.library);
        if (body.library.length && !rows.length) return res.status(400).json({ error: 'No valid library records were provided.' });
        await upsertRowsSafely('user_library', 'anime_id', rows);
      }

      if (Array.isArray(body.watchHistory)) {
        const rows = normalizeWatchHistoryRows(userId, body.watchHistory);
        if (body.watchHistory.length && !rows.length) return res.status(400).json({ error: 'No valid watch-history records were provided.' });
        await upsertRowsSafely('user_watch_history', 'history_key', rows);
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    if(/Upgrade StreamNyaa/.test(String(error?.message)))return res.status(426).json({error:'Update StreamNyaa to synchronize its new history format.'});
    if (error?.status === 404) {
      return res.status(503).json({ error: 'Account sync tables are not configured yet.' });
    }
    return res.status(500).json({ error: error.message || 'Account sync unavailable' });
  }
}
