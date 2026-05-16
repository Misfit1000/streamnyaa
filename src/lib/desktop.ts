export type LocalPlaybackSource = {
  magnet: string;
  title: string;
  animeTitle?: string;
  animeId?: string | number;
  episode?: string | number | null;
  size?: string;
  seeders?: string | number;
};

export type DesktopRuntimeStatus = {
  ready: boolean;
  torrent_engine_configured: boolean;
  player_configured: boolean;
  torrent_engine_path?: string | null;
  player_path?: string | null;
  cache_dir: string;
  message: string;
};

export type DesktopPlaybackStatus = {
  ok: boolean;
  state: string;
  message: string;
  title: string;
};

export type DesktopPlaybackSettings = {
  torrent_engine_path: string;
  mpv_path: string;
  cache_dir: string;
  player_mode: 'mpv';
};

const LOCAL_PLAYBACK_KEY = 'streamnyaa.localPlayback';
const DESKTOP_SETTINGS_KEY = 'streamnyaa.desktopSettings';

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
    sessionStorage.setItem(LOCAL_PLAYBACK_KEY, JSON.stringify(source));
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

export async function startLocalPlayback(source: LocalPlaybackSource) {
  return startLocalPlaybackWithSettings(source, loadDesktopPlaybackSettings());
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
