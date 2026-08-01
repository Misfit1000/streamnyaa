import { API_ORIGIN } from '../config';
import type { AuthSession, LibraryItem, PlaybackHistoryItem } from '../types';
import { authConfig } from './auth';

export type AccountSyncPayload = { library: LibraryItem[]; watchHistory: PlaybackHistoryItem[] };

function normalizeRemote(data: any): AccountSyncPayload {
  return {
    library: (data.library || []).map((item: any) => ({
      animeId: String(item.anime_id || item.animeId),
      animeTitle: item.anime_title || item.animeTitle,
      anime: item.anime,
      bookmarked: Boolean(item.bookmarked),
      liked: Boolean(item.liked),
      updatedAt: item.updated_at || item.updatedAt || new Date(0).toISOString(),
    })),
    watchHistory: (data.watchHistory || []).map((item: any) => {
      const source = item.source || item;
      return {
        key: item.history_key || item.key,
        animeId: String(item.anime_id || item.animeId || source.animeId),
        animeTitle: item.anime_title || item.animeTitle || source.animeTitle,
        episode: Number(item.episode ?? source.episode ?? 1),
        sourceTitle: source.sourceTitle || source.title || '',
        magnet: source.magnet || '',
        image: source.image || source.poster,
        progressPercent: Number(source.progressPercent || item.progress_percent || 0),
        resumeSeconds: Number(source.resumeSeconds || item.resume_seconds || 0),
        durationSeconds: Number(source.durationSeconds || item.duration_seconds || 0),
        updatedAt: item.updated_at || item.updatedAt || source.updatedAt || new Date(0).toISOString(),
      } as PlaybackHistoryItem;
    }),
  };
}

export function mergeLibrary(local: LibraryItem[], remote: LibraryItem[]) {
  const merged = new Map<string, LibraryItem>();
  [...remote, ...local].forEach((item) => {
    const existing = merged.get(item.animeId);
    if (!existing) { merged.set(item.animeId, item); return; }
    const latest = Date.parse(item.updatedAt) >= Date.parse(existing.updatedAt) ? item : existing;
    merged.set(item.animeId, {
      ...latest,
      anime: latest.anime || existing.anime,
      bookmarked: item.bookmarked || existing.bookmarked,
      liked: item.liked || existing.liked,
    });
  });
  return [...merged.values()].filter((item) => item.bookmarked || item.liked).slice(0, 500);
}

export function mergeHistory(local: PlaybackHistoryItem[], remote: PlaybackHistoryItem[]) {
  const merged = new Map<string, PlaybackHistoryItem>();
  [...remote, ...local].forEach((item) => {
    const existing = merged.get(item.key);
    if (!existing || Date.parse(item.updatedAt) >= Date.parse(existing.updatedAt)) merged.set(item.key, item);
  });
  return [...merged.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 100);
}

export async function fetchAccountSync(session: AuthSession) {
  const response = await fetch(`${API_ORIGIN}/api/account-sync`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (response.status === 404) return fetchDirectAccountSync(session);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Account sync is unavailable.');
  return normalizeRemote(data);
}

export async function pushAccountSync(session: AuthSession, payload: AccountSyncPayload) {
  const response = await fetch(`${API_ORIGIN}/api/account-sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.status === 404) return pushDirectAccountSync(session, payload);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Account sync could not be saved.');
  return data;
}

async function directContext(session: AuthSession) {
  const config = await authConfig();
  const headers = { apikey: config.supabaseAnonKey, Authorization: `Bearer ${session.access_token}` };
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers });
  const user = await response.json();
  if (!response.ok || !user.id) throw new Error(user.message || 'The shared account session is invalid.');
  return { ...config, headers, userId: String(user.id) };
}

async function supabaseJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || 'The shared database request failed.');
  return data;
}

async function fetchDirectAccountSync(session: AuthSession) {
  const context = await directContext(session);
  const base = `${context.supabaseUrl}/rest/v1`;
  const headers = { ...context.headers, Accept: 'application/json' };
  const [library, watchHistory] = await Promise.all([
    supabaseJson(`${base}/user_library?select=*&order=updated_at.desc&limit=500`, { headers }),
    supabaseJson(`${base}/user_watch_history?select=*&order=updated_at.desc&limit=100`, { headers }),
  ]);
  return normalizeRemote({ library, watchHistory });
}

async function pushDirectAccountSync(session: AuthSession, payload: AccountSyncPayload) {
  const context = await directContext(session);
  const base = `${context.supabaseUrl}/rest/v1`;
  const commonHeaders = { ...context.headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  await Promise.all([
    supabaseJson(`${base}/user_library?user_id=eq.${encodeURIComponent(context.userId)}`, { method: 'DELETE', headers: commonHeaders }),
    supabaseJson(`${base}/user_watch_history?user_id=eq.${encodeURIComponent(context.userId)}`, { method: 'DELETE', headers: commonHeaders }),
  ]);

  const libraryRows = payload.library.map((item) => ({
    user_id: context.userId, anime_id: item.animeId, anime_title: item.animeTitle, anime: item.anime,
    bookmarked: item.bookmarked, liked: item.liked, updated_at: item.updatedAt,
  }));
  const historyRows = payload.watchHistory.map((item) => ({
    user_id: context.userId, history_key: item.key, source: item, anime_id: item.animeId,
    anime_title: item.animeTitle, episode: String(item.episode), progress_percent: item.progressPercent,
    resume_seconds: item.resumeSeconds, duration_seconds: item.durationSeconds, updated_at: item.updatedAt,
  }));
  if (libraryRows.length) await supabaseJson(`${base}/user_library`, { method: 'POST', headers: commonHeaders, body: JSON.stringify(libraryRows) });
  if (historyRows.length) await supabaseJson(`${base}/user_watch_history`, { method: 'POST', headers: commonHeaders, body: JSON.stringify(historyRows) });
  return { ok: true, transport: 'supabase-rls' };
}
