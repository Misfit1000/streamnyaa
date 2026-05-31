export type LocalPlaybackSource = {
  magnet: string;
  torrentUrl?: string;
  infoHash?: string;
  title: string;
  animeTitle?: string;
  animeId?: string | number;
  episode?: string | number | null;
  size?: string;
  seeders?: string | number;
  image?: string;
  poster?: string;
  banner?: string;
  savedAt?: number;
  progressPercent?: number;
  progressUpdatedAt?: number;
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
  media_url?: string | null;
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
  media_url?: string | null;
};

export type DesktopSourceApiResponse = {
  data: unknown;
  fetched_at: number;
};

export type DesktopMetadataApiRequest = {
  provider: 'anilist' | 'jikan';
  path?: string;
  body?: Record<string, unknown>;
  ttl_seconds?: number;
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
  pressure: 'normal' | 'guarded' | 'low' | 'critical' | 'unknown' | 'removed';
  entries: DesktopCacheEntry[];
};

export type DesktopDiagnosticsStatus = {
  app_version: string;
  runtime: DesktopRuntimeStatus;
  cache: DesktopCacheStatus;
  recent_errors: string[];
  logs_dir: string;
  active_session?: {
    torrent_id: string;
    session_dir: string;
    cache_bytes: number;
    media_url?: string | null;
  } | null;
};

export type DesktopPlaybackSettings = {
  torrent_engine_path: string;
  player_path: string;
  cache_dir: string;
};

const LOCAL_PLAYBACK_KEY = 'streamnyaa.localPlayback';
const LOCAL_PLAYBACK_HISTORY_KEY = 'streamnyaa.localPlaybackHistory';
const DESKTOP_SETTINGS_KEY = 'streamnyaa.desktopSettings';
const DESKTOP_RUNTIME_STATUS_KEY = 'streamnyaa.desktopRuntimeStatus';
const LOCAL_PLAYBACK_HISTORY_LIMIT = 18;

export const DEFAULT_DESKTOP_SETTINGS: DesktopPlaybackSettings = {
  torrent_engine_path: '',
  player_path: '',
  cache_dir: '',
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
    __STREAMNYAA_DESKTOP__?: boolean;
  }
}

export function isDesktopApp() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.__STREAMNYAA_DESKTOP__
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
    // Local streaming can continue even if history storage is unavailable.
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
      .filter((item) => Number(item.progressPercent || 0) > 0)
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

export async function openLocalSourceNow(source: LocalPlaybackSource, settings = loadDesktopPlaybackSettings()) {
  const result = await startLocalPlaybackWithSettings(source, settings);
  if (result?.ok) {
    saveLocalPlaybackSource({
      ...source,
      progressPercent: source.progressPercent ?? 0,
      progressUpdatedAt: Date.now(),
    });
  }
  return result;
}

export function loadDesktopPlaybackSettings(): DesktopPlaybackSettings {
  try {
    const raw = localStorage.getItem(DESKTOP_SETTINGS_KEY);
    if (!raw) return DEFAULT_DESKTOP_SETTINGS;
    const parsed = JSON.parse(raw);
    const parsedCacheDir = typeof parsed?.cache_dir === 'string' ? parsed.cache_dir : '';
    const cacheDir = /[\\/]temp[\\/]/i.test(parsedCacheDir) ? parsedCacheDir : DEFAULT_DESKTOP_SETTINGS.cache_dir;
    const playerPath = typeof parsed?.player_path === 'string'
      ? parsed.player_path
      : typeof parsed?.mpv_path === 'string'
        ? parsed.mpv_path
        : DEFAULT_DESKTOP_SETTINGS.player_path;
    const settings: DesktopPlaybackSettings = {
      torrent_engine_path: typeof parsed?.torrent_engine_path === 'string' ? parsed.torrent_engine_path : DEFAULT_DESKTOP_SETTINGS.torrent_engine_path,
      player_path: playerPath,
      cache_dir: cacheDir,
    };
    localStorage.setItem(DESKTOP_SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  } catch {
    return DEFAULT_DESKTOP_SETTINGS;
  }
}

export function saveDesktopPlaybackSettings(settings: DesktopPlaybackSettings) {
  const cleanSettings: DesktopPlaybackSettings = {
    torrent_engine_path: settings.torrent_engine_path || DEFAULT_DESKTOP_SETTINGS.torrent_engine_path,
    player_path: settings.player_path || DEFAULT_DESKTOP_SETTINGS.player_path,
    cache_dir: settings.cache_dir || DEFAULT_DESKTOP_SETTINGS.cache_dir,
  };
  localStorage.setItem(DESKTOP_SETTINGS_KEY, JSON.stringify(cleanSettings));
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
    throw new Error('Desktop streaming is only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopPlaybackStatus>('play_local_torrent', {
    request: {
      magnet: source.magnet,
      torrent_url: source.torrentUrl || '',
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

export async function clearDesktopPlaybackCache(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Playback cache cleanup is only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopCacheStatus>('clear_playback_cache', { settings });
}

export async function stopDesktopPlayback(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Stopping playback is only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopPlaybackStatus>('stop_local_playback', { settings });
}

export async function getDesktopDiagnostics(settings = loadDesktopPlaybackSettings()) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    return null;
  }

  return invoke<DesktopDiagnosticsStatus>('get_desktop_diagnostics', { settings });
}

export function buildDesktopDiagnosticsReport(diagnostics: DesktopDiagnosticsStatus | null) {
  if (!diagnostics) {
    return 'StreamNyaa desktop diagnostics are unavailable.';
  }

  const activeSession = diagnostics.active_session
    ? `Active session: ${diagnostics.active_session.torrent_id} (${diagnostics.active_session.session_dir}, ${diagnostics.active_session.cache_bytes} bytes${diagnostics.active_session.media_url ? `, ${diagnostics.active_session.media_url}` : ''})`
    : 'Active session: none';

  return [
    `StreamNyaa desktop v${diagnostics.app_version}`,
    `Runtime ready: ${diagnostics.runtime.ready ? 'yes' : 'no'}`,
    `Engine path: ${diagnostics.runtime.torrent_engine_path || 'auto bundled lookup'}`,
    `Native player path: ${diagnostics.runtime.player_path || 'auto bundled lookup'}`,
    `Cache dir: ${diagnostics.cache.cache_dir}`,
    `Cache usage: ${diagnostics.cache.total_bytes}/${diagnostics.cache.max_bytes}`,
    `Cache pressure: ${diagnostics.cache.pressure}`,
    `Logs dir: ${diagnostics.logs_dir}`,
    activeSession,
    diagnostics.recent_errors?.length ? `Recent error: ${diagnostics.recent_errors[0]}` : 'Recent error: none',
  ].join('\n');
}

export async function copyDesktopDiagnosticsReport(diagnostics: DesktopDiagnosticsStatus | null) {
  const text = buildDesktopDiagnosticsReport(diagnostics);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return text;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return text;
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

export async function fetchDesktopSourceApi(url: string) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (invoke) {
    try {
      return await invoke<DesktopSourceApiResponse>('fetch_desktop_source_api', { url });
    } catch {
      // Fall through to the browser fetch path. Some dev or installed builds can briefly
      // miss the bridge during startup, but source search should not leave the UI blank.
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Source search failed with status ${response.status}`);
  }
  return { data: await response.json(), fetched_at: Date.now() };
}

export async function fetchDesktopMetadataApi(request: DesktopMetadataApiRequest) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Desktop metadata requests are only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopSourceApiResponse>('fetch_desktop_metadata_api', { request });
}
