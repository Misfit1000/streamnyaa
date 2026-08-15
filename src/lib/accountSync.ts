import type { AuthSession } from './supabaseAuth';
import { accountApiFetch } from './accountApi';

export type AccountLibraryItem = {
  animeId: string;
  animeTitle: string;
  anime: any;
  bookmarked: boolean;
  liked: boolean;
  updatedAt: string;
  deletedAt?: string | null;
};

export type AccountWatchHistoryItem = {
  key: string;
  animeId?: string;
  animeTitle?: string;
  poster?: string;
  episode?: string | number | null;
  positionSeconds: number;
  durationSeconds?: number;
  watchedPercent?: number;
  completed?: boolean;
  updatedAt: string;
  deletedAt?: string | null;
  source?: any;
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

export class AccountSyncError extends Error {
  code: 'offline' | 'expired-session' | 'missing-schema' | 'service-error';

  constructor(code: AccountSyncError['code'], message: string) {
    super(message);
    this.name = 'AccountSyncError';
    this.code = code;
  }
}

export function selectNewestAccountRecord<T extends { updatedAt: string }>(
  local: T | undefined,
  remote: T | undefined,
) {
  if (!local) return remote;
  if (!remote) return local;
  const localTime = Date.parse(local.updatedAt);
  const remoteTime = Date.parse(remote.updatedAt);
  return Number.isFinite(localTime) && localTime > remoteTime ? local : remote;
}

function authHeaders(session: AuthSession) {
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

function normalizeLibrary(row: any): AccountLibraryItem | null {
  const anime = row?.anime || row?.anime_data || null;
  const animeId = String(row?.anime_id || anime?.mal_id || anime?.id || '').trim();
  if (!animeId) return null;
  return {
    animeId,
    animeTitle: String(row?.anime_title || anime?.title || anime?.title_english || anime?.title_romaji || animeId),
    anime: anime || { mal_id: animeId, title: row?.anime_title || animeId },
    bookmarked: Boolean(row?.bookmarked),
    liked: Boolean(row?.liked),
    updatedAt: row?.updated_at || new Date(0).toISOString(),
    deletedAt: row?.deleted_at || null,
  };
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeWatchHistory(row: any): AccountWatchHistoryItem | null {
  const legacySource = row?.source || row?.source_data || null;
  const key = String(row?.history_key || row?.key || '').trim();
  if (!key) return null;
  const positionSeconds = finiteNumber(row?.resume_seconds ?? legacySource?.resumeSeconds);
  const durationSeconds = finiteNumber(row?.duration_seconds ?? legacySource?.durationSeconds);
  const watchedPercent = finiteNumber(
    row?.progress_percent ?? legacySource?.progressPercent,
    durationSeconds > 0 ? (positionSeconds / durationSeconds) * 100 : 0,
  );
  return {
    key,
    animeId: row?.anime_id || legacySource?.animeId || undefined,
    animeTitle: row?.anime_title || legacySource?.animeTitle || legacySource?.title || undefined,
    poster: row?.poster_url || legacySource?.poster || legacySource?.image || undefined,
    episode: row?.episode ?? legacySource?.episode ?? null,
    positionSeconds,
    durationSeconds: durationSeconds || undefined,
    watchedPercent,
    completed: Boolean(row?.completed ?? legacySource?.completed),
    updatedAt: row?.updated_at || new Date(0).toISOString(),
    deletedAt: row?.deleted_at || null,
  };
}

function normalizeFetchError(error: unknown): AccountSyncError {
  if (error instanceof AccountSyncError) return error;
  const message = error instanceof Error ? error.message : String(error || '');
  if (/Failed to fetch|NetworkError|Load failed|offline/i.test(message)) {
    return new AccountSyncError('offline', 'You are offline. Local changes are saved and will sync after reconnection.');
  }
  return new AccountSyncError('service-error', 'The account service is unavailable. Local changes are saved for retry.');
}

async function parseResponse(response: Response) {
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (response.ok) return data;
  if (response.status === 401 || response.status === 403) {
    throw new AccountSyncError('expired-session', 'Your session expired. Sign in again to resume syncing.');
  }
  if (response.status === 404 || data?.code === 'PGRST205' || /schema cache|does not exist/i.test(String(data?.message || data))) {
    throw new AccountSyncError('missing-schema', 'Account sync is awaiting its database setup. Local changes remain on this device.');
  }
  throw new AccountSyncError('service-error', data?.message || data?.error || 'The account service rejected the sync request.');
}

export async function fetchAccountSync(session?: AuthSession | null): Promise<AccountSyncPayload> {
  if (!session?.access_token) return { profile: null, library: [], watchHistory: [] };
  try {
    const response = await accountApiFetch('/api/account-sync', { headers: authHeaders(session) });
    const data = await parseResponse(response);
    return {
      profile: data?.profile || null,
      library: Array.isArray(data?.library) ? data.library.map(normalizeLibrary).filter(Boolean) : [],
      watchHistory: Array.isArray(data?.watchHistory) ? data.watchHistory.map(normalizeWatchHistory).filter(Boolean) : [],
    } as AccountSyncPayload;
  } catch (error) {
    throw normalizeFetchError(error);
  }
}

export async function replaceAccountSyncData(
  session: AuthSession,
  payload: {
    library?: AccountLibraryItem[];
    watchHistory?: AccountWatchHistoryItem[];
    displayName?: string;
  },
) {
  try {
    const response = await accountApiFetch('/api/account-sync', {
      method: 'POST', headers: authHeaders(session), body: JSON.stringify(payload),
    });
    return await parseResponse(response);
  } catch (error) {
    throw normalizeFetchError(error);
  }
}

