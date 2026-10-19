import { accountApiFetch } from './accountApi';
import { fetchSessionUser, getAuthConfig, type AuthSession } from './supabaseAuth';
import { isDesktopApp } from './desktop';

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
  watchedCoverage?: import('./desktopCoverage').WatchedCoverage;
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
  historyVersion?: 3;
  tracking?: import('./desktopHistoryArchive').AnimeTrackingSummary[];
};
const webV3Accounts=new Set<string>();

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
  return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
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
    watchedCoverage:legacySource?.watchedCoverage,
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

async function desktopRest(session: AuthSession, path: string, options: RequestInit = {}) {
  const config = await getAuthConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    return await parseResponse(response);
  } catch (error) {
    throw normalizeFetchError(error);
  } finally { clearTimeout(timer); }
}

async function readCollection(session: AuthSession, path: string) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await desktopRest(session, `${path}&limit=500&offset=${offset}`);
    if (!Array.isArray(page)) throw new AccountSyncError('service-error', 'Account data was incomplete. Local changes remain saved.');
    rows.push(...page);
    if (page.length < 500) return rows;
    // Explicit failure is safer than silently applying a truncated collection.
    if (rows.length >= 100_000) throw new AccountSyncError('service-error', 'Account collection exceeds the safe sync limit. Local data was not replaced.');
  }
}

async function fetchDesktopAccountSync(session: AuthSession, includeHistory=true): Promise<AccountSyncPayload> {
  const user = session.user?.id ? session.user : await fetchSessionUser(session);
  const userFilter = encodeURIComponent(user.id);
  const [profiles, library, watchHistory] = await Promise.all([
    desktopRest(session, `user_profiles?user_id=eq.${userFilter}&select=*&limit=1`),
    readCollection(session, `user_library?user_id=eq.${userFilter}&select=*&order=anime_id.asc`),
    includeHistory ? readCollection(session, `user_watch_history?user_id=eq.${userFilter}&select=*&order=history_key.asc`) : Promise.resolve([]),
  ]);
  return {
    profile: Array.isArray(profiles) ? profiles[0] || null : null,
    library: Array.isArray(library) ? library.map(normalizeLibrary).filter(Boolean) as AccountLibraryItem[] : [],
    watchHistory: Array.isArray(watchHistory) ? watchHistory.map(normalizeWatchHistory).filter(Boolean) as AccountWatchHistoryItem[] : [],
  };
}

export async function fetchAccountSync(session?: AuthSession | null, includeHistory=true): Promise<AccountSyncPayload> {
  if (!session?.access_token) return { profile: null, library: [], watchHistory: [] };
  if (isDesktopApp()) return fetchDesktopAccountSync(session,includeHistory);
  try {
    const response = await accountApiFetch('/api/account-sync?historyVersion=3', { headers: authHeaders(session) });
    const data = await parseResponse(response);
    if(data?.historyVersion===3 && session.user?.id)webV3Accounts.add(session.user.id);
    return {
      profile: data?.profile || null,
      library: Array.isArray(data?.library) ? data.library.map(normalizeLibrary).filter(Boolean) : [],
      watchHistory: Array.isArray(data?.watchHistory) ? data.watchHistory.map(normalizeWatchHistory).filter(Boolean) : [],
      historyVersion:data?.historyVersion,tracking:data?.tracking,
    } as AccountSyncPayload;
  } catch (error) {
    throw normalizeFetchError(error);
  }
}

export async function accountHistoryV3(session:AuthSession,request:Record<string,unknown>) {
  if(isDesktopApp()) return desktopRest(session,'rpc/history_sync_v3',{method:'POST',body:JSON.stringify({p_request:request})});
  return parseResponse(await accountApiFetch('/api/account-sync',{method:'POST',headers:authHeaders(session),body:JSON.stringify({version:3,request})}));
}
export async function fetchLegacyHistoryRows(session:AuthSession):Promise<any[]> {
  const user=session.user?.id ? session.user : await fetchSessionUser(session);
  return readCollection(session,`user_watch_history?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=history_key.asc`);
}

function libraryRows(userId: string, rows: AccountLibraryItem[]) {
  return rows.map((item) => ({
    user_id: userId,
    anime_id: item.animeId,
    anime_title: item.animeTitle,
    anime: item.anime || { mal_id: item.animeId, title: item.animeTitle },
    bookmarked: item.deletedAt ? false : Boolean(item.bookmarked),
    liked: item.deletedAt ? false : Boolean(item.liked),
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt || null,
  }));
}

function watchRows(userId: string, rows: AccountWatchHistoryItem[]) {
  return rows.map((item) => ({
    user_id: userId,
    history_key: item.key,
    source: item.watchedCoverage ? {watchedCoverage:item.watchedCoverage} : null,
    anime_id: item.animeId || null,
    anime_title: item.animeTitle || null,
    poster_url: item.poster || null,
    episode: item.episode == null ? null : String(item.episode),
    progress_percent: finiteNumber(item.watchedPercent),
    resume_seconds: finiteNumber(item.positionSeconds),
    duration_seconds: finiteNumber(item.durationSeconds),
    completed: Boolean(item.completed),
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt || null,
  }));
}

export async function replaceAccountSyncData(
  session: AuthSession,
  payload: { library?: AccountLibraryItem[]; watchHistory?: AccountWatchHistoryItem[]; displayName?: string },
) {
  if (!isDesktopApp()) {
    try {
      const upgraded=Boolean(session.user?.id && webV3Accounts.has(session.user.id));
      const response = await accountApiFetch('/api/account-sync', {
        method: 'POST', headers: authHeaders(session), body: JSON.stringify(upgraded?{...payload,watchHistory:undefined}:payload),
      });
      const result=await parseResponse(response);
      if(upgraded && payload.watchHistory)await syncWebRecentHistory(session,payload.watchHistory);
      return result;
    } catch (error) {
      throw normalizeFetchError(error);
    }
  }

  const user = session.user?.id ? session.user : await fetchSessionUser(session);
  await desktopRest(session, 'user_profiles?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      user_id: user.id,
      email: user.email || null,
      ...(payload.displayName !== undefined ? { display_name: payload.displayName } : {}),
      updated_at: new Date().toISOString(),
    }]),
  });
  for (let offset = 0; offset < (payload.library?.length || 0); offset += 500) {
    await desktopRest(session, 'user_library?on_conflict=user_id,anime_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(libraryRows(user.id, payload.library!.slice(offset, offset + 500))),
    });
  }
  for (let offset = 0; offset < (payload.watchHistory?.length || 0); offset += 500) {
    await desktopRest(session, 'user_watch_history?on_conflict=user_id,history_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(watchRows(user.id, payload.watchHistory!.slice(offset, offset + 500))),
    });
  }
  return { ok: true };
}

async function syncWebRecentHistory(session:AuthSession,rows:AccountWatchHistoryItem[]) {
  const key=`streamnyaa.web.historyOutbox.v3.${session.user!.id}`;
  const previous=JSON.parse(localStorage.getItem(key)||'{"sequence":0,"signatures":{},"pending":[]}');
  const deviceKey='streamnyaa.web.historyDevice.v3';let deviceId=localStorage.getItem(deviceKey);
  if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem(deviceKey,deviceId);}
  for(const row of [...rows].sort((a,b)=>Date.parse(a.updatedAt)-Date.parse(b.updatedAt))){
    const signature=JSON.stringify(row);if(previous.signatures[row.key]===signature)continue;
    const identity=/^(mal|anilist|legacy):/.test(row.animeId || '')?row.animeId!:`legacy:${row.animeId || row.animeTitle}`;
    const updatedAt=Date.parse(row.updatedAt)||0;
    const base={identity,episode:String(row.episode || 1),updatedAt,epoch:0};
    if(row.deletedAt)previous.pending.push({...base,kind:'clearResume',sequence:++previous.sequence});
    else {
      if(row.completed)previous.pending.push({...base,kind:'watch',watched:true,manual:false,sequence:++previous.sequence});
      if(!(row.completed && row.positionSeconds===0 && row.watchedPercent===100))previous.pending.push({...base,kind:'progress',title:row.animeTitle,animeId:row.animeId,poster:row.poster,positionSeconds:row.positionSeconds,durationSeconds:row.durationSeconds,progressPercent:row.watchedPercent,completed:row.completed,watchedCoverage:row.watchedCoverage,lastPlayedAt:updatedAt,sequence:++previous.sequence});
    }
    previous.signatures[row.key]=signature;
  }
  localStorage.setItem(key,JSON.stringify(previous));
  while(previous.pending.length){
    const result=await accountHistoryV3(session,{action:'apply',deviceId,operations:previous.pending.slice(0,200)});
    previous.pending=previous.pending.filter((op:any)=>op.sequence>result.acknowledgedThrough);
    localStorage.setItem(key,JSON.stringify(previous));
  }
}
