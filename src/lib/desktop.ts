export type LocalPlaybackSource = {
  magnet: string;
  title: string;
  animeTitle?: string;
  animeId?: string | number;
  episode?: string | number | null;
  size?: string;
  seeders?: string | number;
  savedAt?: number;
};

export type DesktopRuntimeStatus = {
  ready: boolean;
  torrent_engine_configured: boolean;
  player_configured: boolean;
  torrent_engine_path?: string | null;
  player_path?: string | null;
  torrent_engine_version?: string | null;
  player_version?: string | null;
  cache_dir: string;
  message: string;
};

export type DesktopPlaybackStatus = {
  ok: boolean;
  state: string;
  message: string;
  title: string;
  torrent_id?: string | null;
  playlist_url?: string | null;
};

export type DesktopPlaybackProgress = {
  ok: boolean;
  torrent_id: string;
  state: string;
  message: string;
  progress?: number | null;
  downloaded_bytes?: number | null;
  total_bytes?: number | null;
  peers?: number | null;
  download_speed?: number | null;
  playlist_url: string;
};

export type DesktopToolTestStatus = {
  ok: boolean;
  message: string;
  path?: string | null;
  version?: string | null;
};

export type DesktopSourceApiResponse = {
  data: unknown;
  fetched_at: number;
};

export type DesktopPlaybackSettings = {
  torrent_engine_path: string;
  mpv_path: string;
  cache_dir: string;
  player_mode: 'mpv';
};

const LOCAL_PLAYBACK_KEY = 'streamnyaa.localPlayback';
const LOCAL_PLAYBACK_HISTORY_KEY = 'streamnyaa.localPlaybackHistory';
const DESKTOP_SETTINGS_KEY = 'streamnyaa.desktopSettings';
const LOCAL_PLAYBACK_HISTORY_LIMIT = 18;

export const DESKTOP_RELEASES_URL = 'https://github.com/Misfit1000/streamnyaa/releases';
export const DEFAULT_DESKTOP_SETTINGS: DesktopPlaybackSettings = {
  torrent_engine_path: 'rqbit',
  mpv_path: 'mpv',
  cache_dir: '',
  player_mode: 'mpv',
};

type TauriGlobal = {
  core?: {
    invoke?: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
  };
  invoke?: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
};

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isDesktopApp() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return Boolean(
    import.meta.env.VITE_STREAMNYAA_APP_TARGET === 'desktop'
    || params.get('desktop') === '1'
    || window.localStorage.getItem('streamnyaa.desktopMode') === '1'
    || window.__TAURI__
    || window.__TAURI_INTERNALS__,
  );
}

export function saveLocalPlaybackSource(source: LocalPlaybackSource) {
  try {
    const normalized = { ...source, savedAt: Date.now() };
    sessionStorage.setItem(LOCAL_PLAYBACK_KEY, JSON.stringify(normalized));
    saveLocalPlaybackHistoryItem(normalized);
  } catch {
    // The local player can still open, but it will ask the user to select a source again.
  }
}

export function loadLocalPlaybackSource(): LocalPlaybackSource | null {
  try {
    const raw = sessionStorage.getItem(LOCAL_PLAYBACK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadLocalPlaybackHistory(): LocalPlaybackSource[] {
  try {
    const raw = localStorage.getItem(LOCAL_PLAYBACK_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is LocalPlaybackSource => Boolean(item?.magnet && item?.title))
      .slice(0, LOCAL_PLAYBACK_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveLocalPlaybackHistoryItem(source: LocalPlaybackSource) {
  try {
    const normalized = { ...source, savedAt: source.savedAt || Date.now() };
    const next = [
      normalized,
      ...loadLocalPlaybackHistory().filter((item) => item.magnet !== normalized.magnet),
    ].slice(0, LOCAL_PLAYBACK_HISTORY_LIMIT);
    localStorage.setItem(LOCAL_PLAYBACK_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Playback history is a convenience feature. Failing to persist it should not block playback.
  }
}

export function clearLocalPlaybackHistory() {
  try {
    localStorage.removeItem(LOCAL_PLAYBACK_HISTORY_KEY);
    sessionStorage.removeItem(LOCAL_PLAYBACK_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export async function startLocalPlayback(source: LocalPlaybackSource) {
  return startLocalPlaybackWithSettings(source, loadDesktopPlaybackSettings());
}

export async function startLocalDownloadWithSettings(source: LocalPlaybackSource, settings: DesktopPlaybackSettings) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Local download is only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopPlaybackStatus>('download_local_torrent', {
    request: {
      magnet: source.magnet,
      title: source.title,
      anime_title: source.animeTitle || '',
      episode: source.episode ? String(source.episode) : '',
      settings,
    },
  });
}

export function loadDesktopPlaybackSettings(): DesktopPlaybackSettings {
  try {
    const raw = localStorage.getItem(DESKTOP_SETTINGS_KEY);
    if (!raw) return DEFAULT_DESKTOP_SETTINGS;
    return { ...DEFAULT_DESKTOP_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_DESKTOP_SETTINGS;
  }
}

export function saveDesktopPlaybackSettings(settings: DesktopPlaybackSettings) {
  localStorage.setItem(DESKTOP_SETTINGS_KEY, JSON.stringify(settings));
}

export async function startLocalPlaybackWithSettings(source: LocalPlaybackSource, settings: DesktopPlaybackSettings) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Local playback is only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopPlaybackStatus>('play_local_torrent', {
    request: {
      magnet: source.magnet,
      title: source.title,
      anime_title: source.animeTitle || '',
      episode: source.episode ? String(source.episode) : '',
      settings,
    },
  });
}

export async function getDesktopRuntimeStatus(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    return null;
  }

  return invoke<DesktopRuntimeStatus>('get_desktop_runtime_status', { settings });
}

export async function openDesktopCacheFolder(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Cache folder can only be opened inside the StreamNyaa desktop app.');
  }

  return invoke<void>('open_cache_folder', { settings });
}

export async function getLocalPlaybackProgress(torrentId: string) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Playback progress is only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopPlaybackProgress>('get_local_playback_progress', {
    request: {
      torrent_id: torrentId,
    },
  });
}

export async function stopLocalPlayback(torrentId: string) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Local playback can only be stopped inside the StreamNyaa desktop app.');
  }

  return invoke<void>('stop_local_playback', {
    request: {
      torrent_id: torrentId,
    },
  });
}

export async function testDesktopMpv(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('MPV can only be tested inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopToolTestStatus>('test_mpv_player', { settings });
}

export async function fetchDesktopSourceApi(url: string) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Desktop source search is only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopSourceApiResponse>('fetch_desktop_source_api', { url });
}
