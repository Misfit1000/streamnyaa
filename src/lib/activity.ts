import { animeIdentity } from './animeIdentity';
import { accountApiFetch } from './accountApi';
import type { AuthSession } from './supabaseAuth';

export type RecentAnime = {
  mal_id: number | string;
  title: string;
  images?: any;
  score?: number;
  type?: string;
  episodes?: number;
  year?: number;
  viewedAt: string;
};

export type DownloadHistoryEntry = {
  id: string;
  title: string;
  magnet: string;
  animeTitle?: string;
  animeId?: number | string;
  episode?: number | string | null;
  action: 'copy' | 'open';
  ownerId?: string;
  size?: string;
  seeders?: string | number;
  createdAt: string;
};

const RECENT_ANIME_KEY = 'streamnyaa.recentAnime';
const DOWNLOAD_HISTORY_KEY = 'streamnyaa.downloadHistory';
const LEGACY_DOWNLOAD_OWNER = 'streamnyaa.downloadHistory.legacyOwner.v1';

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, value: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local history is a convenience feature; storage failures should not break actions.
  }
}

export function getRecentAnime(limit = 8) {
  return readList<RecentAnime>(RECENT_ANIME_KEY).slice(0, limit);
}

export function saveRecentAnime(anime: any) {
  const id = animeIdentity(anime);
  if (!id || !anime?.title) return;
  const nextItem: RecentAnime = {
    mal_id: id,
    title: anime.title,
    images: anime.images,
    score: anime.score,
    type: anime.type,
    episodes: anime.episodes,
    year: anime.year,
    viewedAt: new Date().toISOString(),
  };
  const existing = readList<RecentAnime>(RECENT_ANIME_KEY).filter((item) => String(item.mal_id) !== String(nextItem.mal_id));
  writeList(RECENT_ANIME_KEY, [nextItem, ...existing].slice(0, 12));
}

export function getDownloadHistory(limit = 8, owner?: string) {
  const rows = readList<DownloadHistoryEntry>(DOWNLOAD_HISTORY_KEY);
  if (!owner) return rows.slice(0, limit);
  let legacyOwner: string | null = null;
  try { legacyOwner = localStorage.getItem(LEGACY_DOWNLOAD_OWNER); if (!legacyOwner) { localStorage.setItem(LEGACY_DOWNLOAD_OWNER, owner); legacyOwner = owner; } } catch { /* Do not expose unowned rows when storage is unavailable. */ }
  return rows.filter(row => row.ownerId ? row.ownerId === owner : legacyOwner === owner).slice(0, limit);
}

function normalizeRemoteHistory(row: any): DownloadHistoryEntry | null {
  if (!row?.title || !row?.magnet) return null;
  return {
    id: String(row.id || `${row.created_at || Date.now()}-${row.magnet}`),
    title: String(row.title),
    magnet: String(row.magnet),
    animeTitle: row.anime_title || row.animeTitle || undefined,
    animeId: row.anime_id || row.animeId || undefined,
    episode: row.episode || null,
    action: row.action === 'open' ? 'open' : 'copy',
    size: row.size || undefined,
    seeders: row.seeders || undefined,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  };
}

export function mergeDownloadHistory(...lists: DownloadHistoryEntry[][]) {
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((entry) => {
      const key = `${entry.magnet}-${entry.action}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function fetchAccountDownloadHistory(session?: AuthSession | null, limit = 20) {
  if (!session?.access_token) return [];
  const boundedLimit = Math.min(50, Math.max(1, Math.floor(limit) || 20));
  const key = `${session.access_token}:${boundedLimit}`;
  const pending = historyReads.get(key);
  if (pending) return pending;
  const request = readRemoteHistory(session, boundedLimit).finally(() => historyReads.delete(key));
  historyReads.set(key, request);
  return request;
}

const historyReads = new Map<string, Promise<DownloadHistoryEntry[]>>();
const historyUploads = new Map<string, Promise<void>>();

async function readRemoteHistory(session: AuthSession, limit: number) {

  const response = await accountApiFetch(`/api/download-history?limit=${encodeURIComponent(String(limit))}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error('Saved source history could not be loaded.');

  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeRemoteHistory).filter(Boolean) as DownloadHistoryEntry[];
}

export async function saveDownloadHistory(entry: Omit<DownloadHistoryEntry, 'id' | 'createdAt'>, session?: AuthSession | null) {
  const nextItem: DownloadHistoryEntry = {
    ...entry,
    ownerId: session?.user?.id || '__guest__',
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  const existing = readList<DownloadHistoryEntry>(DOWNLOAD_HISTORY_KEY).filter(item => item.ownerId !== nextItem.ownerId || item.magnet !== nextItem.magnet || item.action !== nextItem.action);
  writeList(DOWNLOAD_HISTORY_KEY, [...[nextItem, ...existing.filter(item => item.ownerId === nextItem.ownerId)].slice(0,30), ...existing.filter(item => item.ownerId !== nextItem.ownerId)]);

  await syncLocalDownloadHistoryToAccount(session);
}

export async function syncLocalDownloadHistoryToAccount(session?: AuthSession | null) {
  if (!session?.access_token) return;
  const owner = session.user?.id;
  const key = owner || session.access_token;
  const pending = historyUploads.get(key);
  if (pending) return pending;
  const upload = uploadHistory(session, owner).catch(() => {
    // Failed entries remain pending locally for the next sync opportunity.
  }).finally(() => historyUploads.delete(key));
  historyUploads.set(key, upload);
  return upload;
}

async function uploadHistory(session: AuthSession, owner?: string) {
  const markerKey = owner ? `streamnyaa.downloadHistory.synced.v1:${owner}` : null;
  const acknowledged = new Set(markerKey ? readList<string>(markerKey) : []);
  for (;;) {
    const entries = getDownloadHistory(30, owner).filter(entry => !acknowledged.has(JSON.stringify(entry)));
    if (!entries.length) return;
    const response = await accountApiFetch('/api/download-history', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entries }),
    });
    if (!response.ok || (await response.json())?.ok !== true) return;
    entries.forEach(entry => acknowledged.add(JSON.stringify(entry)));
    if (markerKey) writeList(markerKey, getDownloadHistory(30, owner).map(entry => JSON.stringify(entry)).filter(entry => acknowledged.has(entry)));
    // Include actions saved while this batch was in flight without concurrent writes.
  }
}
