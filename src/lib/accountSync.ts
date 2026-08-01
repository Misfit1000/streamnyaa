import { getSupabaseAuthConfig, type AuthSession } from './supabaseAuth';
import { accountApiFetch } from './accountApi';
import type { SyncedPreferences } from '../../shared/preferences';

export type AccountLibraryItem = {
  animeId: string;
  animeTitle: string;
  anime: any;
  bookmarked: boolean;
  liked: boolean;
  updatedAt: string;
};

export type AccountWatchHistoryItem = {
  key: string;
  source: any;
  animeId?: string;
  animeTitle?: string;
  episode?: string | number | null;
  updatedAt: string;
};

export type AccountProfile = {
  user_id: string;
  email?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  updated_at?: string;
  preferences?: SyncedPreferences | null;
};

export type AccountSyncPayload = {
  profile: AccountProfile | null;
  library: AccountLibraryItem[];
  watchHistory: AccountWatchHistoryItem[];
};

function authHeaders(session: AuthSession) {
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

function normalizeLibrary(row: any): AccountLibraryItem | null {
  const anime = row?.anime || row?.anime_data || null;
  const animeId = String(row?.anime_id || anime?.mal_id || anime?.id || '').trim();
  if (!animeId || !anime) return null;
  return {
    animeId,
    animeTitle: String(row?.anime_title || anime?.title || anime?.title_english || anime?.title_romaji || 'Untitled anime'),
    anime,
    bookmarked: Boolean(row?.bookmarked),
    liked: Boolean(row?.liked),
    updatedAt: row?.updated_at || new Date().toISOString(),
  };
}

function normalizeWatchHistory(row: any): AccountWatchHistoryItem | null {
  const source = row?.source || row?.source_data || null;
  const key = String(row?.history_key || '').trim();
  if (!key || !source) return null;
  return {
    key,
    source,
    animeId: row?.anime_id || source?.animeId || undefined,
    animeTitle: row?.anime_title || source?.animeTitle || undefined,
    episode: row?.episode || source?.episode || null,
    updatedAt: row?.updated_at || new Date().toISOString(),
  };
}

export async function fetchAccountSync(session?: AuthSession | null): Promise<AccountSyncPayload> {
  if (!session?.access_token) return { profile: null, library: [], watchHistory: [] };
  const response = await accountApiFetch('/api/account-sync', {
    headers: authHeaders(session),
  });
  if (response.status === 404) return fetchDirectAccountSync(session);
  if (!response.ok) throw new Error('Account sync is not available right now.');
  const data = await response.json();
  return {
    profile: data.profile || null,
    library: Array.isArray(data.library) ? data.library.map(normalizeLibrary).filter(Boolean) : [],
    watchHistory: Array.isArray(data.watchHistory) ? data.watchHistory.map(normalizeWatchHistory).filter(Boolean) : [],
  } as AccountSyncPayload;
}

export async function replaceAccountSyncData(
  session: AuthSession,
  payload: {
    library?: AccountLibraryItem[];
    watchHistory?: AccountWatchHistoryItem[];
    displayName?: string;
    preferences?: SyncedPreferences;
  },
) {
  const response = await accountApiFetch('/api/account-sync', {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({
      mode: 'replace',
      ...payload,
    }),
  });
  if (response.status === 404) return replaceDirectAccountSyncData(session, payload);
  if (!response.ok) throw new Error('Account sync could not be saved.');
  return response.json();
}

async function directContext(session: AuthSession) {
  const config = await getSupabaseAuthConfig();
  const headers = { apikey: config.publishableKey, Authorization: `Bearer ${session.access_token}` };
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers });
  const user = await response.json();
  if (!response.ok || !user.id) throw new Error(user.message || 'The shared account session is invalid.');
  return { ...config, headers, userId: String(user.id) };
}

async function supabaseJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.error || 'The shared database request failed.');
  return data;
}

async function fetchDirectAccountSync(session: AuthSession): Promise<AccountSyncPayload> {
  const context = await directContext(session);
  const base = `${context.supabaseUrl}/rest/v1`;
  const headers = { ...context.headers, Accept: 'application/json' };
  const [library, watchHistory, profiles] = await Promise.all([
    supabaseJson(`${base}/user_library?select=*&order=updated_at.desc&limit=500`, { headers }),
    supabaseJson(`${base}/user_watch_history?select=*&order=updated_at.desc&limit=100`, { headers }),
    supabaseJson(`${base}/user_profiles?select=*&limit=1`, { headers }).catch(() => []),
  ]);
  return {
    profile: profiles?.[0] || null,
    library: (library || []).map(normalizeLibrary).filter(Boolean),
    watchHistory: (watchHistory || []).map(normalizeWatchHistory).filter(Boolean),
  } as AccountSyncPayload;
}

async function replaceDirectAccountSyncData(
  session: AuthSession,
  payload: { library?: AccountLibraryItem[]; watchHistory?: AccountWatchHistoryItem[]; preferences?: SyncedPreferences },
) {
  const context = await directContext(session);
  const base = `${context.supabaseUrl}/rest/v1`;
  const headers = { ...context.headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  if (payload.library) {
    await supabaseJson(`${base}/user_library?user_id=eq.${encodeURIComponent(context.userId)}`, { method: 'DELETE', headers });
    const rows = payload.library.map((item) => ({
      user_id: context.userId, anime_id: item.animeId, anime_title: item.animeTitle, anime: item.anime,
      bookmarked: item.bookmarked, liked: item.liked, updated_at: item.updatedAt,
    }));
    if (rows.length) await supabaseJson(`${base}/user_library`, { method: 'POST', headers, body: JSON.stringify(rows) });
  }
  if (payload.watchHistory) {
    await supabaseJson(`${base}/user_watch_history?user_id=eq.${encodeURIComponent(context.userId)}`, { method: 'DELETE', headers });
    const rows = payload.watchHistory.map((item) => ({
      user_id: context.userId, history_key: item.key, source: item.source, anime_id: item.animeId,
      anime_title: item.animeTitle, episode: item.episode, updated_at: item.updatedAt,
    }));
    if (rows.length) await supabaseJson(`${base}/user_watch_history`, { method: 'POST', headers, body: JSON.stringify(rows) });
  }
  if (payload.preferences) {
    try {
      await supabaseJson(`${base}/user_profiles?on_conflict=user_id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ user_id: context.userId, preferences: payload.preferences, updated_at: new Date().toISOString() }]),
      });
    } catch (error) {
      if (!/preferences|column/i.test(error instanceof Error ? error.message : '')) throw error;
    }
  }
  return { ok: true, transport: 'supabase-rls' };
}

