import type { AuthSession } from './supabaseAuth';
import { accountApiFetch } from './accountApi';

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
  if (!response.ok) throw new Error('Account sync could not be saved.');
  return response.json();
}

