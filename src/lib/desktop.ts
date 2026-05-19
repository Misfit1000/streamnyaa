export type LocalPlaybackSource = {
  magnet: string;
  infoHash?: string;
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

export type DesktopCacheEntry = {
  name: string;
  path: string;
  size_bytes: number;
  modified_ms: number;
};

export type DesktopCacheStatus = {
  cache_dir: string;
  total_bytes: number;
  file_count: number;
  max_bytes: number;
  free_bytes?: number | null;
  pressure: 'normal' | 'guarded' | 'low' | 'critical' | 'unknown';
  entries: DesktopCacheEntry[];
};

export type DesktopDiagnosticsStatus = {
  app_version: string;
  runtime: DesktopRuntimeStatus;
  cache: DesktopCacheStatus;
  recent_errors: string[];
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
const DESKTOP_RUNTIME_STATUS_KEY = 'streamnyaa.desktopRuntimeStatus';
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

export async function openLocalSourceNow(source: LocalPlaybackSource, settings = loadDesktopPlaybackSettings()) {
  saveLocalPlaybackSource(source);
  return startLocalPlaybackWithSettings(source, settings);
}

export async function startLocalDownloadWithSettings(source: LocalPlaybackSource, settings: DesktopPlaybackSettings) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Local download is only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopPlaybackStatus>('download_local_torrent', {
    request: {
      magnet: source.magnet,
      info_hash: source.infoHash || '',
      title: source.title,
      anime_title: source.animeTitle || '',
      episode: source.episode ? String(source.episode) : '',
      size: source.size || '',
      settings,
    },
  });
}

export function loadDesktopPlaybackSettings(): DesktopPlaybackSettings {
  try {
    const raw = localStorage.getItem(DESKTOP_SETTINGS_KEY);
    if (!raw) return DEFAULT_DESKTOP_SETTINGS;
    const settings = { ...DEFAULT_DESKTOP_SETTINGS, ...JSON.parse(raw) };
    if (/\\temp\\streamnyaa-desktop$/i.test(settings.cache_dir || '') || /\/temp\/streamnyaa-desktop$/i.test(settings.cache_dir || '')) {
      settings.cache_dir = '';
      localStorage.setItem(DESKTOP_SETTINGS_KEY, JSON.stringify(settings));
    }
    return settings;
  } catch {
    return DEFAULT_DESKTOP_SETTINGS;
  }
}

export function saveDesktopPlaybackSettings(settings: DesktopPlaybackSettings) {
  localStorage.setItem(DESKTOP_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadCachedDesktopRuntimeStatus(): DesktopRuntimeStatus | null {
  try {
    const raw = localStorage.getItem(DESKTOP_RUNTIME_STATUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.status) return null;
    return parsed.status;
  } catch {
    return null;
  }
}

function saveCachedDesktopRuntimeStatus(status: DesktopRuntimeStatus | null) {
  if (!status) return;
  try {
    localStorage.setItem(DESKTOP_RUNTIME_STATUS_KEY, JSON.stringify({ savedAt: Date.now(), status }));
  } catch {
    // Runtime status is only a startup speed hint.
  }
}

export async function startLocalPlaybackWithSettings(source: LocalPlaybackSource, settings: DesktopPlaybackSettings) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Local playback is only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopPlaybackStatus>('play_local_torrent', {
    request: {
      magnet: source.magnet,
      info_hash: source.infoHash || '',
      title: source.title,
      anime_title: source.animeTitle || '',
      episode: source.episode ? String(source.episode) : '',
      size: source.size || '',
      settings,
    },
  });
}

export async function getDesktopRuntimeStatus(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    return null;
  }

  const status = await invoke<DesktopRuntimeStatus>('get_desktop_runtime_status', { settings });
  saveCachedDesktopRuntimeStatus(status);
  return status;
}

export async function prepareLocalPlayback(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    return null;
  }

  const status = await invoke<DesktopRuntimeStatus>('prepare_local_playback', { settings });
  saveCachedDesktopRuntimeStatus(status);
  return status;
}

export async function openDesktopCacheFolder(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Cache folder can only be opened inside the StreamNyaa desktop app.');
  }

  return invoke<void>('open_cache_folder', { settings });
}

export async function getDesktopCacheStatus(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    return null;
  }

  return invoke<DesktopCacheStatus>('get_cache_status', { settings });
}

export async function clearDesktopPlaybackCache(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Playback storage can only be cleared inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopCacheStatus>('clear_playback_cache', { settings });
}

export async function getDesktopDiagnostics(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    return null;
  }

  return invoke<DesktopDiagnosticsStatus>('get_desktop_diagnostics', { settings });
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

export async function openLocalTorrentPlayer(torrentId: string, title = 'Local stream', settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Local playback is only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopPlaybackStatus>('open_local_torrent_player', {
    request: {
      torrent_id: torrentId,
      title,
      settings,
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
