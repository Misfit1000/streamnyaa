export type LocalPlaybackSource = {
  magnet: string;
  title: string;
  animeTitle?: string;
  animeId?: string | number;
  episode?: string | number | null;
  size?: string;
  seeders?: string | number;
};

const LOCAL_PLAYBACK_KEY = 'streamnyaa.localPlayback';

export const DESKTOP_RELEASES_URL = 'https://github.com/Misfit1000/streamnyaa/releases';

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
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Local playback is only available inside the StreamNyaa desktop app.');
  }

  return invoke('play_local_torrent', {
    magnet: source.magnet,
    title: source.title,
    animeTitle: source.animeTitle || '',
    episode: source.episode ? String(source.episode) : '',
  });
}
