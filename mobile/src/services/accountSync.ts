import { API_ORIGIN } from '../config';
import type { AuthSession, LibraryItem, PlaybackHistoryItem } from '../types';
import { authConfig } from './auth';
import { mergeSharedHistory, mergeSharedLibrary } from '../../../shared/account';
import { normalizeSyncedPreferences, type SyncedPreferences } from '../../../shared/preferences';

export type AccountSyncPayload = { library: LibraryItem[]; watchHistory: PlaybackHistoryItem[]; preferences: SyncedPreferences };

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
    preferences: normalizeSyncedPreferences(data.preferences || data.profile?.preferences || {}),
  };
}

export function mergeLibrary(local: LibraryItem[], remote: LibraryItem[]) {
  return mergeSharedLibrary(local, remote);
}

export function mergeHistory(local: PlaybackHistoryItem[], remote: PlaybackHistoryItem[]) {
  return mergeSharedHistory(
    local.map((source) => ({ key: source.key, source, updatedAt: source.updatedAt })),
    remote.map((source) => ({ key: source.key, source, updatedAt: source.updatedAt })),
    100,
  ).map((item) => item.source);
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
  const [library, watchHistory, profiles] = await Promise.all([
    supabaseJson(`${base}/user_library?select=*&order=updated_at.desc&limit=500`, { headers }),
    supabaseJson(`${base}/user_watch_history?select=*&order=updated_at.desc&limit=100`, { headers }),
    supabaseJson(`${base}/user_profiles?select=*&limit=1`, { headers }).catch(() => []),
  ]);
  return normalizeRemote({ library, watchHistory, profile: profiles?.[0] });
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
  try {
    await supabaseJson(`${base}/user_profiles?on_conflict=user_id`, {
      method: 'POST',
      headers: { ...commonHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ user_id: context.userId, preferences: payload.preferences, updated_at: new Date().toISOString() }]),
    });
  } catch (error) {
    if (!/preferences|column/i.test(error instanceof Error ? error.message : '')) throw error;
  }
  return { ok: true, transport: 'supabase-rls' };
}
