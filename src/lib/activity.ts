import type { AuthSession } from './supabaseAuth';

export type RecentAnime = {
  mal_id: number;
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
  if (!anime?.mal_id || !anime?.title) return;
  const nextItem: RecentAnime = {
    mal_id: anime.mal_id,
    title: anime.title,
    images: anime.images,
    score: anime.score,
    type: anime.type,
    episodes: anime.episodes,
    year: anime.year,
    viewedAt: new Date().toISOString(),
  };
  const existing = readList<RecentAnime>(RECENT_ANIME_KEY).filter((item) => item.mal_id !== nextItem.mal_id);
  writeList(RECENT_ANIME_KEY, [nextItem, ...existing].slice(0, 12));
}

export function getDownloadHistory(limit = 8) {
  return readList<DownloadHistoryEntry>(DOWNLOAD_HISTORY_KEY).slice(0, limit);
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
    await fetch('/api/download-history', {
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
