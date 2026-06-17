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
  size?: string;
  seeders?: string | number;
  createdAt: string;
};

const RECENT_ANIME_KEY = 'streamnyaa.recentAnime';
const DOWNLOAD_HISTORY_KEY = 'streamnyaa.downloadHistory';

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

export function getDownloadHistory(limit = 8) {
  return readList<DownloadHistoryEntry>(DOWNLOAD_HISTORY_KEY).slice(0, limit);
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
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  const existing = readList<DownloadHistoryEntry>(DOWNLOAD_HISTORY_KEY).filter((item) => item.magnet !== nextItem.magnet || item.action !== nextItem.action);
  writeList(DOWNLOAD_HISTORY_KEY, [nextItem, ...existing].slice(0, 30));

  if (!session?.access_token) return;
  try {
    await accountApiFetch('/api/download-history', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nextItem),
    });
  } catch {
    // Keep the local entry even if the optional remote table is not configured yet.
  }
}

export async function syncLocalDownloadHistoryToAccount(session?: AuthSession | null) {
  if (!session?.access_token) return;
  const localHistory = getDownloadHistory(30);
  for (const entry of localHistory) {
    try {
      await accountApiFetch('/api/download-history', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });
    } catch {
      // Download/source history sync is best-effort. Keep local history intact.
    }
  }
}
