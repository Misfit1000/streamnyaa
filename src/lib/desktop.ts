import { animeIdentity, animeTitleKey } from './animeIdentity';

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
  resumeSeconds?: number;
  durationSeconds?: number;
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
  current_seconds?: number | null;
  duration_seconds?: number | null;
  paused?: boolean | null;
  volume?: number | null;
  downloaded_bytes?: number | null;
  total_bytes?: number | null;
  peers?: number | null;
  download_speed?: number | null;
  playlist_url: string;
  media_url?: string | null;
};

export type DesktopPlayerControlAction =
  | 'toggle_pause'
  | 'play'
  | 'pause'
  | 'seek_relative'
  | 'seek_absolute'
  | 'volume_relative'
  | 'volume'
  | 'mute'
  | 'fullscreen'
  | 'speed'
  | 'subtitle'
  | 'audio'
  | 'auto_next_episode'
  | 'player_preference'
  | 'show_status';

export type DesktopSubtitleStylePreferences = {
  fontSize: string;
  position: string;
  textColor: string;
  outline: string;
  shadow: string;
  background: string;
  custom: boolean;
};

export type DesktopPlayerPreferences = {
  autoNextEpisode: boolean;
  autoSkipIntro: boolean;
  autoSkipOutro: boolean;
  rememberSpeed: boolean;
  playbackSpeed: number;
  volume: number;
  muted: boolean;
  subtitleStyle: DesktopSubtitleStylePreferences;
};

export type DesktopPlayerPreferencesPatch = Partial<Omit<DesktopPlayerPreferences, 'subtitleStyle'>> & {
  subtitleStyle?: Partial<DesktopSubtitleStylePreferences>;
};

export type DesktopPlayerControlStatus = {
  ok: boolean;
  message: string;
  paused?: boolean | null;
  volume?: number | null;
  current_seconds?: number | null;
  duration_seconds?: number | null;
};

export type DesktopSourceApiResponse = {
  data: unknown;
  fetched_at: number;
};

export type DesktopMetadataApiRequest = {
  provider: 'anilist' | 'jikan' | 'anidb' | 'animeschedule' | 'tmdb';
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

export type DesktopAudioPreference = 'sub-preferred' | 'dual-preferred' | 'dub-only';

const LOCAL_PLAYBACK_KEY = 'streamnyaa.localPlayback';
const LOCAL_PLAYBACK_HISTORY_KEY = 'streamnyaa.localPlaybackHistory';
const DESKTOP_SETTINGS_KEY = 'streamnyaa.desktopSettings';
const DESKTOP_RUNTIME_STATUS_KEY = 'streamnyaa.desktopRuntimeStatus';
const DESKTOP_AUDIO_PREFERENCE_KEY = 'streamnyaa.desktopAudioPreference';
const DESKTOP_AUTO_OPEN_BEST_SOURCE_KEY = 'streamnyaa.desktopAutoOpenBestSource';
const DESKTOP_AUTO_PLAY_NEXT_EPISODE_KEY = 'streamnyaa.desktopAutoPlayNextEpisode';
const DESKTOP_PLAYER_PREFERENCES_KEY = 'streamnyaa.desktopPlayerPreferences';
const DESKTOP_AUDIO_PREFERENCE_EVENT = 'streamnyaa:desktop-audio-preference';
const DESKTOP_AUTO_OPEN_BEST_SOURCE_EVENT = 'streamnyaa:desktop-auto-open-best-source';
const DESKTOP_AUTO_PLAY_NEXT_EPISODE_EVENT = 'streamnyaa:desktop-auto-play-next-episode';
const DESKTOP_PLAYER_PREFERENCES_EVENT = 'streamnyaa:desktop-player-preferences';
const LOCAL_PLAYBACK_HISTORY_EVENT = 'streamnyaa:local-playback-history';
const LOCAL_PLAYBACK_HISTORY_LIMIT = 18;
const COMPLETION_PERCENT_THRESHOLD = 92;

export const DEFAULT_DESKTOP_SETTINGS: DesktopPlaybackSettings = {
  torrent_engine_path: '',
  player_path: '',
  cache_dir: '',
};

export const DEFAULT_DESKTOP_AUDIO_PREFERENCE: DesktopAudioPreference = 'sub-preferred';
export const DEFAULT_DESKTOP_AUTO_OPEN_BEST_SOURCE = false;
export const DEFAULT_DESKTOP_AUTO_PLAY_NEXT_EPISODE = false;
export const DEFAULT_DESKTOP_PLAYER_PREFERENCES: DesktopPlayerPreferences = {
  autoNextEpisode: DEFAULT_DESKTOP_AUTO_PLAY_NEXT_EPISODE,
  autoSkipIntro: false,
  autoSkipOutro: false,
  rememberSpeed: true,
  playbackSpeed: 1,
  volume: 100,
  muted: false,
  subtitleStyle: {
    fontSize: 'medium',
    position: 'normal',
    textColor: 'white',
    outline: 'medium',
    shadow: 'soft',
    background: 'off',
    custom: false,
  },
};

function emitDesktopEvent(eventName: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(eventName));
}

export function subscribeDesktopAudioPreference(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const wrapped = () => listener();
  window.addEventListener(DESKTOP_AUDIO_PREFERENCE_EVENT, wrapped);
  return () => window.removeEventListener(DESKTOP_AUDIO_PREFERENCE_EVENT, wrapped);
}

export function subscribeDesktopAutoOpenBestSource(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const wrapped = () => listener();
  window.addEventListener(DESKTOP_AUTO_OPEN_BEST_SOURCE_EVENT, wrapped);
  return () => window.removeEventListener(DESKTOP_AUTO_OPEN_BEST_SOURCE_EVENT, wrapped);
}

export function subscribeDesktopAutoPlayNextEpisode(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const wrapped = () => listener();
  window.addEventListener(DESKTOP_AUTO_PLAY_NEXT_EPISODE_EVENT, wrapped);
  return () => window.removeEventListener(DESKTOP_AUTO_PLAY_NEXT_EPISODE_EVENT, wrapped);
}

export function subscribeDesktopPlayerPreferences(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const wrapped = () => listener();
  window.addEventListener(DESKTOP_PLAYER_PREFERENCES_EVENT, wrapped);
  return () => window.removeEventListener(DESKTOP_PLAYER_PREFERENCES_EVENT, wrapped);
}

export function subscribeLocalPlaybackHistory(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const wrapped = () => listener();
  window.addEventListener(LOCAL_PLAYBACK_HISTORY_EVENT, wrapped);
  return () => window.removeEventListener(LOCAL_PLAYBACK_HISTORY_EVENT, wrapped);
}

export type DesktopPlayerNextEpisodeEvent = {
  reason?: 'manual' | 'ended' | string;
};

export type DesktopPlayerAutoNextChangedEvent = {
  enabled?: boolean;
};

export type DesktopPlayerSettingChangedEvent = {
  key?: string;
  value?: string;
};

export type DesktopPlayerReadyEvent = {
  ready?: boolean;
  at?: number;
};

type TauriListenEvent<T> = {
  payload: T;
};

type TauriUnlisten = () => void;

type TauriGlobal = {
  core?: {
    invoke?: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
  };
  invoke?: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
  event?: {
    listen?: <T = unknown>(event: string, handler: (event: TauriListenEvent<T>) => void) => Promise<TauriUnlisten>;
  };
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

function playbackHistoryKey(source: Partial<LocalPlaybackSource>) {
  const animeKey = String(source.animeId || source.animeTitle || source.title || '').trim().toLowerCase();
  const episodeKey = String(source.episode || '').trim();
  return `${animeKey}::${episodeKey}`;
}

function normalizedEpisodeNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function playbackProgressPercent(source: Partial<LocalPlaybackSource>) {
  const explicitPercent = Number(source.progressPercent || 0);
  if (Number.isFinite(explicitPercent) && explicitPercent > 0) {
    return Math.max(0, Math.min(100, explicitPercent));
  }
  const duration = Number(source.durationSeconds || 0);
  const resume = Number(source.resumeSeconds || 0);
  if (duration > 0 && resume > 0) {
    return Math.max(0, Math.min(100, (resume / duration) * 100));
  }
  return 0;
}

function isPlaybackEntryComplete(source: Partial<LocalPlaybackSource>) {
  const percent = playbackProgressPercent(source);
  const duration = Number(source.durationSeconds || 0);
  const resume = Number(source.resumeSeconds || 0);
  const remainingSeconds = duration > 0 ? Math.max(0, duration - resume) : Number.POSITIVE_INFINITY;
  return percent >= COMPLETION_PERCENT_THRESHOLD || (duration > 0 && remainingSeconds <= 90);
}

function playbackHistoryMatchesAnime(source: Partial<LocalPlaybackSource>, anime: any) {
  const sourceAnimeId = String(source.animeId || '').trim();
  const sourceAnimeTitle = animeTitleKey(source.animeTitle || source.title || '');
  const targetAnimeId = animeIdentity(anime);
  const targetAnimeTitle = animeTitleKey(anime?.title || anime?.title_english || anime?.title_romaji || '');
  if (sourceAnimeId && targetAnimeId && sourceAnimeId === targetAnimeId) return true;
  if (sourceAnimeTitle && targetAnimeTitle && sourceAnimeTitle === targetAnimeTitle) return true;
  return false;
}

export function findLocalPlaybackHistoryItem(source: Partial<LocalPlaybackSource>) {
  const key = playbackHistoryKey(source);
  return loadLocalPlaybackHistory().find((item) => playbackHistoryKey(item) === key) || null;
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

export function clearLocalPlaybackHistory() {
  try {
    localStorage.removeItem(LOCAL_PLAYBACK_HISTORY_KEY);
    emitDesktopEvent(LOCAL_PLAYBACK_HISTORY_EVENT);
  } catch {
    // Playback history is optional and should never block app use.
  }
}

export function replaceLocalPlaybackHistory(history: LocalPlaybackSource[]) {
  try {
    const next = history
      .filter((item): item is LocalPlaybackSource => Boolean(item?.magnet && item?.title))
      .slice(0, LOCAL_PLAYBACK_HISTORY_LIMIT);
    localStorage.setItem(LOCAL_PLAYBACK_HISTORY_KEY, JSON.stringify(next));
    emitDesktopEvent(LOCAL_PLAYBACK_HISTORY_EVENT);
  } catch {
    // Playback history sync is optional and should never block app use.
  }
}

export function removeLocalPlaybackHistoryItem(source: Partial<LocalPlaybackSource>) {
  try {
    const key = playbackHistoryKey(source);
    const next = loadLocalPlaybackHistory().filter((item) => playbackHistoryKey(item) !== key);
    localStorage.setItem(LOCAL_PLAYBACK_HISTORY_KEY, JSON.stringify(next));
    emitDesktopEvent(LOCAL_PLAYBACK_HISTORY_EVENT);
  } catch {
    // Playback history is optional and should never block app use.
  }
}

export function saveLocalPlaybackHistoryItem(source: LocalPlaybackSource) {
  try {
    const normalized = { ...source, savedAt: source.savedAt || Date.now() };
    const key = playbackHistoryKey(normalized);
    const next = [
      normalized,
      ...loadLocalPlaybackHistory().filter((item) => playbackHistoryKey(item) !== key),
    ].slice(0, LOCAL_PLAYBACK_HISTORY_LIMIT);
    localStorage.setItem(LOCAL_PLAYBACK_HISTORY_KEY, JSON.stringify(next));
    emitDesktopEvent(LOCAL_PLAYBACK_HISTORY_EVENT);
  } catch {
    // Playback history is a convenience feature. Failing to persist it should not block playback.
  }
}

export async function openLocalSourceNow(source: LocalPlaybackSource, settings = loadDesktopPlaybackSettings()) {
  const existing = findLocalPlaybackHistoryItem(source);
  const preparedSource: LocalPlaybackSource = {
    ...(existing || {}),
    ...source,
    progressPercent: source.progressPercent ?? existing?.progressPercent ?? 0,
    resumeSeconds: source.resumeSeconds ?? existing?.resumeSeconds ?? 0,
    durationSeconds: source.durationSeconds ?? existing?.durationSeconds ?? 0,
  };
  const result = await startLocalPlaybackWithSettings(preparedSource, settings);
  if (result?.ok) {
    saveLocalPlaybackSource({
      ...preparedSource,
      progressPercent: preparedSource.progressPercent ?? 0,
      progressUpdatedAt: Date.now(),
      resumeSeconds: preparedSource.resumeSeconds ?? 0,
      durationSeconds: preparedSource.durationSeconds ?? 0,
    });
  }
  return result;
}

export function updateLocalPlaybackHistoryProgress(
  source: Partial<LocalPlaybackSource>,
  progress: {
    currentSeconds?: number | null;
    durationSeconds?: number | null;
    progressPercent?: number | null;
  },
) {
  const existing = findLocalPlaybackHistoryItem(source);
  if (!existing) return;

  const currentSeconds = Math.max(0, Number(progress.currentSeconds || 0));
  const durationSeconds = Math.max(0, Number(progress.durationSeconds || existing.durationSeconds || 0));
  const percent = Number.isFinite(Number(progress.progressPercent))
    ? Math.max(0, Math.min(100, Number(progress.progressPercent || 0)))
    : durationSeconds > 0
      ? Math.max(0, Math.min(100, (currentSeconds / durationSeconds) * 100))
      : Number(existing.progressPercent || 0);

  const priorSeconds = Math.max(0, Number(existing.resumeSeconds || 0));
  const priorPercent = Math.max(0, Number(existing.progressPercent || 0));
  if (Math.abs(currentSeconds - priorSeconds) < 5 && Math.abs(percent - priorPercent) < 1) {
    return;
  }

  saveLocalPlaybackHistoryItem({
    ...existing,
    ...source,
    progressPercent: percent,
    progressUpdatedAt: Date.now(),
    resumeSeconds: currentSeconds,
    durationSeconds,
  });
}

export function formatPlaybackTime(seconds?: number | null) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function loadDesktopAudioPreference(): DesktopAudioPreference {
  try {
    const value = String(localStorage.getItem(DESKTOP_AUDIO_PREFERENCE_KEY) || '').trim();
    if (value === 'sub-preferred' || value === 'dual-preferred' || value === 'dub-only') {
      return value;
    }
  } catch {
    // Preference falls back to the default desktop behavior.
  }
  return DEFAULT_DESKTOP_AUDIO_PREFERENCE;
}

export function saveDesktopAudioPreference(preference: DesktopAudioPreference) {
  localStorage.setItem(DESKTOP_AUDIO_PREFERENCE_KEY, preference);
  emitDesktopEvent(DESKTOP_AUDIO_PREFERENCE_EVENT);
}

export function loadDesktopAutoOpenBestSource() {
  try {
    return localStorage.getItem(DESKTOP_AUTO_OPEN_BEST_SOURCE_KEY) === 'true';
  } catch {
    return DEFAULT_DESKTOP_AUTO_OPEN_BEST_SOURCE;
  }
}

export function saveDesktopAutoOpenBestSource(enabled: boolean) {
  localStorage.setItem(DESKTOP_AUTO_OPEN_BEST_SOURCE_KEY, enabled ? 'true' : 'false');
  emitDesktopEvent(DESKTOP_AUTO_OPEN_BEST_SOURCE_EVENT);
}

function asBooleanPreference(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value >= 0.5;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function asNumberPreference(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeDesktopPlayerPreferences(value: DesktopPlayerPreferencesPatch = {}): DesktopPlayerPreferences {
  const subtitleStyle = value.subtitleStyle || {};
  return {
    autoNextEpisode: asBooleanPreference(value.autoNextEpisode, DEFAULT_DESKTOP_PLAYER_PREFERENCES.autoNextEpisode),
    autoSkipIntro: asBooleanPreference(value.autoSkipIntro, DEFAULT_DESKTOP_PLAYER_PREFERENCES.autoSkipIntro),
    autoSkipOutro: asBooleanPreference(value.autoSkipOutro, DEFAULT_DESKTOP_PLAYER_PREFERENCES.autoSkipOutro),
    rememberSpeed: asBooleanPreference(value.rememberSpeed, DEFAULT_DESKTOP_PLAYER_PREFERENCES.rememberSpeed),
    playbackSpeed: asNumberPreference(value.playbackSpeed, DEFAULT_DESKTOP_PLAYER_PREFERENCES.playbackSpeed, 0.25, 4),
    volume: asNumberPreference(value.volume, DEFAULT_DESKTOP_PLAYER_PREFERENCES.volume, 0, 130),
    muted: asBooleanPreference(value.muted, DEFAULT_DESKTOP_PLAYER_PREFERENCES.muted),
    subtitleStyle: {
      fontSize: typeof subtitleStyle.fontSize === 'string' ? subtitleStyle.fontSize : DEFAULT_DESKTOP_PLAYER_PREFERENCES.subtitleStyle.fontSize,
      position: typeof subtitleStyle.position === 'string' ? subtitleStyle.position : DEFAULT_DESKTOP_PLAYER_PREFERENCES.subtitleStyle.position,
      textColor: typeof subtitleStyle.textColor === 'string' ? subtitleStyle.textColor : DEFAULT_DESKTOP_PLAYER_PREFERENCES.subtitleStyle.textColor,
      outline: typeof subtitleStyle.outline === 'string' ? subtitleStyle.outline : DEFAULT_DESKTOP_PLAYER_PREFERENCES.subtitleStyle.outline,
      shadow: typeof subtitleStyle.shadow === 'string' ? subtitleStyle.shadow : DEFAULT_DESKTOP_PLAYER_PREFERENCES.subtitleStyle.shadow,
      background: typeof subtitleStyle.background === 'string' ? subtitleStyle.background : DEFAULT_DESKTOP_PLAYER_PREFERENCES.subtitleStyle.background,
      custom: asBooleanPreference(subtitleStyle.custom, DEFAULT_DESKTOP_PLAYER_PREFERENCES.subtitleStyle.custom),
    },
  };
}

export function loadDesktopPlayerPreferences(): DesktopPlayerPreferences {
  try {
    const raw = localStorage.getItem(DESKTOP_PLAYER_PREFERENCES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const legacyAutoNext = localStorage.getItem(DESKTOP_AUTO_PLAY_NEXT_EPISODE_KEY);
    const preferences = normalizeDesktopPlayerPreferences({
      ...parsed,
      autoNextEpisode: typeof parsed?.autoNextEpisode === 'undefined'
        ? asBooleanPreference(legacyAutoNext, DEFAULT_DESKTOP_PLAYER_PREFERENCES.autoNextEpisode)
        : parsed.autoNextEpisode,
    });
    localStorage.setItem(DESKTOP_PLAYER_PREFERENCES_KEY, JSON.stringify(preferences));
    localStorage.setItem(DESKTOP_AUTO_PLAY_NEXT_EPISODE_KEY, preferences.autoNextEpisode ? 'true' : 'false');
    return preferences;
  } catch {
    return DEFAULT_DESKTOP_PLAYER_PREFERENCES;
  }
}

export function saveDesktopPlayerPreferences(next: DesktopPlayerPreferencesPatch) {
  const current = loadDesktopPlayerPreferences();
  const preferences = normalizeDesktopPlayerPreferences({
    ...current,
    ...next,
    subtitleStyle: {
      ...current.subtitleStyle,
      ...(next.subtitleStyle || {}),
    },
  });
  localStorage.setItem(DESKTOP_PLAYER_PREFERENCES_KEY, JSON.stringify(preferences));
  localStorage.setItem(DESKTOP_AUTO_PLAY_NEXT_EPISODE_KEY, preferences.autoNextEpisode ? 'true' : 'false');
  emitDesktopEvent(DESKTOP_PLAYER_PREFERENCES_EVENT);
  if (typeof next.autoNextEpisode !== 'undefined') {
    emitDesktopEvent(DESKTOP_AUTO_PLAY_NEXT_EPISODE_EVENT);
  }
  return preferences;
}

export function saveDesktopPlayerSetting(key: string, value: unknown) {
  const current = loadDesktopPlayerPreferences();
  switch (key) {
    case 'autoNextEpisode':
    case 'auto_next_episode':
      return saveDesktopPlayerPreferences({ autoNextEpisode: asBooleanPreference(value, current.autoNextEpisode) });
    case 'autoSkipIntro':
    case 'auto_skip_intro':
      return saveDesktopPlayerPreferences({ autoSkipIntro: asBooleanPreference(value, current.autoSkipIntro) });
    case 'autoSkipOutro':
    case 'auto_skip_outro':
      return saveDesktopPlayerPreferences({ autoSkipOutro: asBooleanPreference(value, current.autoSkipOutro) });
    case 'rememberSpeed':
    case 'remember_speed':
      return saveDesktopPlayerPreferences({ rememberSpeed: asBooleanPreference(value, current.rememberSpeed) });
    case 'playbackSpeed':
    case 'playback_speed':
      return saveDesktopPlayerPreferences({ playbackSpeed: asNumberPreference(value, current.playbackSpeed, 0.25, 4) });
    case 'volume':
      return saveDesktopPlayerPreferences({ volume: asNumberPreference(value, current.volume, 0, 130) });
    case 'muted':
      return saveDesktopPlayerPreferences({ muted: asBooleanPreference(value, current.muted) });
    case 'subtitleStyle.fontSize':
      return saveDesktopPlayerPreferences({ subtitleStyle: { fontSize: String(value || current.subtitleStyle.fontSize) } });
    case 'subtitleStyle.position':
      return saveDesktopPlayerPreferences({ subtitleStyle: { position: String(value || current.subtitleStyle.position) } });
    case 'subtitleStyle.textColor':
      return saveDesktopPlayerPreferences({ subtitleStyle: { textColor: String(value || current.subtitleStyle.textColor) } });
    case 'subtitleStyle.outline':
      return saveDesktopPlayerPreferences({ subtitleStyle: { outline: String(value || current.subtitleStyle.outline) } });
    case 'subtitleStyle.shadow':
      return saveDesktopPlayerPreferences({ subtitleStyle: { shadow: String(value || current.subtitleStyle.shadow) } });
    case 'subtitleStyle.background':
      return saveDesktopPlayerPreferences({ subtitleStyle: { background: String(value || current.subtitleStyle.background) } });
    case 'subtitleStyle.custom':
      return saveDesktopPlayerPreferences({ subtitleStyle: { custom: asBooleanPreference(value, current.subtitleStyle.custom) } });
    default:
      return current;
  }
}

export function loadDesktopAutoPlayNextEpisode() {
  return loadDesktopPlayerPreferences().autoNextEpisode;
}

export function saveDesktopAutoPlayNextEpisode(enabled: boolean) {
  return saveDesktopPlayerPreferences({ autoNextEpisode: enabled });
}

export function watchTypeForAudioPreference(preference: DesktopAudioPreference) {
  return preference === 'sub-preferred' ? 'sub' : 'dub';
}

export function playbackHistoryForAnime(anime: any, history = loadLocalPlaybackHistory()) {
  return history
    .filter((item) => playbackHistoryMatchesAnime(item, anime))
    .sort((left, right) => {
      const episodeDelta = normalizedEpisodeNumber(right.episode) - normalizedEpisodeNumber(left.episode);
      if (episodeDelta !== 0) return episodeDelta;
      return Number(right.progressUpdatedAt || right.savedAt || 0) - Number(left.progressUpdatedAt || left.savedAt || 0);
    });
}

export function latestUnwatchedEpisodeForAnime(
  anime: any,
  history = loadLocalPlaybackHistory(),
  fallbackEpisode = 1,
  maxEpisode?: number | null,
) {
  const animeHistory = playbackHistoryForAnime(anime, history)
    .filter((item) => normalizedEpisodeNumber(item.episode) > 0);
  if (!animeHistory.length) return Math.max(1, Number(fallbackEpisode || 1));

  const unfinished = animeHistory.find((item) => !isPlaybackEntryComplete(item));
  if (unfinished) {
    return Math.max(1, normalizedEpisodeNumber(unfinished.episode) || Number(fallbackEpisode || 1));
  }

  const highestFinishedEpisode = animeHistory.reduce((current, item) => {
    if (!isPlaybackEntryComplete(item)) return current;
    return Math.max(current, normalizedEpisodeNumber(item.episode));
  }, 0);
  if (highestFinishedEpisode <= 0) return Math.max(1, Number(fallbackEpisode || 1));

  const cappedMax = Number(maxEpisode || anime?.episodes || 0);
  if (cappedMax > 0) {
    return Math.min(cappedMax, highestFinishedEpisode + 1);
  }
  return highestFinishedEpisode + 1;
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
      poster: source.poster || source.image || '',
      banner: source.banner || '',
      resume_seconds: Number(source.resumeSeconds || 0),
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

export async function controlLocalPlayer(action: DesktopPlayerControlAction, value?: number) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Player controls are only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopPlayerControlStatus>('control_local_player', {
    request: {
      action,
      value,
    },
  });
}

export async function controlLocalPlayerPreference(key: string, value: string | number | boolean) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Player controls are only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopPlayerControlStatus>('control_local_player', {
    request: {
      action: 'player_preference',
      key,
      text: String(value),
    },
  });
}

export async function syncDesktopPlayerPreferencesToPlayer(preferences = loadDesktopPlayerPreferences()) {
  const failed: string[] = [];
  const run = async (key: string, task: () => Promise<unknown>) => {
    try {
      await task();
    } catch {
      failed.push(key);
    }
  };

  await run('autoNextEpisode', () => controlLocalPlayer('auto_next_episode', preferences.autoNextEpisode ? 1 : 0));
  await run('autoSkipIntro', () => controlLocalPlayerPreference('autoSkipIntro', preferences.autoSkipIntro));
  await run('autoSkipOutro', () => controlLocalPlayerPreference('autoSkipOutro', preferences.autoSkipOutro));
  await run('rememberSpeed', () => controlLocalPlayerPreference('rememberSpeed', preferences.rememberSpeed));
  await run('playbackSpeed', () => controlLocalPlayerPreference('playbackSpeed', preferences.playbackSpeed));
  await run('volume', () => controlLocalPlayerPreference('volume', preferences.volume));
  await run('muted', () => controlLocalPlayerPreference('muted', preferences.muted));
  await run('subtitleStyle.fontSize', () => controlLocalPlayerPreference('subtitleStyle.fontSize', preferences.subtitleStyle.fontSize));
  await run('subtitleStyle.position', () => controlLocalPlayerPreference('subtitleStyle.position', preferences.subtitleStyle.position));
  await run('subtitleStyle.textColor', () => controlLocalPlayerPreference('subtitleStyle.textColor', preferences.subtitleStyle.textColor));
  await run('subtitleStyle.outline', () => controlLocalPlayerPreference('subtitleStyle.outline', preferences.subtitleStyle.outline));
  await run('subtitleStyle.shadow', () => controlLocalPlayerPreference('subtitleStyle.shadow', preferences.subtitleStyle.shadow));
  await run('subtitleStyle.background', () => controlLocalPlayerPreference('subtitleStyle.background', preferences.subtitleStyle.background));
  await run('subtitleStyle.custom', () => controlLocalPlayerPreference('subtitleStyle.custom', preferences.subtitleStyle.custom));

  return {
    ok: failed.length === 0,
    failed,
  };
}

export async function importSubtitleForCurrentDesktopPlayer() {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Subtitle import is only available inside the StreamNyaa desktop app.');
  }

  return invoke<DesktopPlayerControlStatus>('import_subtitle_for_current_player');
}

export async function listenDesktopPlayerNextEpisode(listener: (event: DesktopPlayerNextEpisodeEvent) => void) {
  if (typeof window === 'undefined') return () => {};
  const listen = window.__TAURI__?.event?.listen;
  if (!listen) return () => {};
  return listen<DesktopPlayerNextEpisodeEvent>('streamnyaa-player-next-episode', (event) => {
    listener(event.payload || {});
  });
}

export async function listenDesktopPlayerAutoNextChanged(listener: (event: DesktopPlayerAutoNextChangedEvent) => void) {
  if (typeof window === 'undefined') return () => {};
  const listen = window.__TAURI__?.event?.listen;
  if (!listen) return () => {};
  return listen<DesktopPlayerAutoNextChangedEvent>('streamnyaa-player-auto-next-changed', (event) => {
    listener(event.payload || {});
  });
}

export async function listenDesktopPlayerSettingChanged(listener: (event: DesktopPlayerSettingChangedEvent) => void) {
  if (typeof window === 'undefined') return () => {};
  const listen = window.__TAURI__?.event?.listen;
  if (!listen) return () => {};
  return listen<DesktopPlayerSettingChangedEvent>('streamnyaa-player-setting-changed', (event) => {
    listener(event.payload || {});
  });
}

export async function listenDesktopPlayerReady(listener: (event: DesktopPlayerReadyEvent) => void) {
  if (typeof window === 'undefined') return () => {};
  const listen = window.__TAURI__?.event?.listen;
  if (!listen) return () => {};
  return listen<DesktopPlayerReadyEvent>('streamnyaa-player-ready', (event) => {
    listener(event.payload || {});
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
