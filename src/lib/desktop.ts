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
  completed?: boolean;
};

export type DesktopWatchProgressRecord = {
  animeId: string | number;
  title: string;
  poster?: string;
  episode: string | number;
  positionSeconds: number;
  durationSeconds?: number;
  progressPercent?: number;
  updatedAt: number;
  completed?: boolean;
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
  torrent_progress_percent?: number | null;
  buffer_percent?: number | null;
  buffered_seconds?: number | null;
  buffering?: boolean;
  buffer_advancing?: boolean;
  stall_seconds?: number;
  recovery_stage?: 'idle' | 'buffering' | 'retrying' | 'switching' | 'failed' | string;
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
  cache_status?: 'memory' | 'disk' | 'network' | 'stale';
  provider?: string;
  duration_ms?: number;
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
export const DESKTOP_WATCH_PROGRESS_KEY = 'streamnyaa.desktop.watchProgress.v1';
export const DESKTOP_WATCHED_SERIES_KEY = 'streamnyaa.desktop.watchedSeries.v1';
const DESKTOP_AUDIO_PREFERENCE_EVENT = 'streamnyaa:desktop-audio-preference';
const DESKTOP_AUTO_OPEN_BEST_SOURCE_EVENT = 'streamnyaa:desktop-auto-open-best-source';
const DESKTOP_AUTO_PLAY_NEXT_EPISODE_EVENT = 'streamnyaa:desktop-auto-play-next-episode';
const DESKTOP_PLAYER_PREFERENCES_EVENT = 'streamnyaa:desktop-player-preferences';
const DESKTOP_WATCH_PROGRESS_EVENT = 'streamnyaa:desktop-watch-progress';
const LOCAL_PLAYBACK_HISTORY_EVENT = 'streamnyaa:local-playback-history';
const LOCAL_PLAYBACK_HISTORY_LIMIT = 18;
const DESKTOP_WATCH_PROGRESS_LIMIT = 150;
const DESKTOP_WATCHED_SERIES_LIMIT = 500;
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

export function subscribeDesktopWatchProgress(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const wrapped = () => listener();
  window.addEventListener(DESKTOP_WATCH_PROGRESS_EVENT, wrapped);
  return () => window.removeEventListener(DESKTOP_WATCH_PROGRESS_EVENT, wrapped);
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

export type DesktopEpisodeWatchState = {
  started: boolean;
  completed: boolean;
  progressPercent: number;
  positionSeconds: number;
  updatedAt: number;
};

export type DesktopWatchedSeriesRecord = {
  animeId: string | number;
  title: string;
  poster?: string;
  lastEpisode?: string | number;
  updatedAt: number;
};

export type DesktopPlayerRecoveryRequestEvent = {
  action?: 'retry' | 'backup' | string;
  media_key?: string;
  position_seconds?: number;
};

export type DesktopOAuthCallbackEvent = {
  url?: string;
  action?: 'login' | 'recovery' | 'confirmation';
  next?: string;
  error?: string;
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

function watchProgressMatchesSource(
  record: Partial<DesktopWatchProgressRecord>,
  source: Partial<LocalPlaybackSource>,
) {
  const sourceEpisode = normalizedEpisodeNumber(source.episode);
  const recordEpisode = normalizedEpisodeNumber(record.episode);
  if (!sourceEpisode || sourceEpisode !== recordEpisode) return false;

  const recordId = String(record.animeId || '').trim();
  const sourceId = String(source.animeId || '').trim();
  if (recordId && sourceId && recordId === sourceId) return true;

  const recordTitle = animeTitleKey(record.title || '');
  const sourceTitle = animeTitleKey(source.animeTitle || source.title || '');
  return Boolean(recordTitle && sourceTitle && recordTitle === sourceTitle);
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

function watchProgressKey(record: Partial<DesktopWatchProgressRecord>) {
  const animeKey = String(record.animeId || record.title || '').trim().toLowerCase();
  const episodeKey = String(record.episode || '').trim();
  return `${animeKey}::${episodeKey}`;
}

function watchProgressFromSource(source: Partial<LocalPlaybackSource>): DesktopWatchProgressRecord | null {
  const title = String(source.animeTitle || source.title || '').trim();
  if (!title) return null;

  const durationSeconds = Math.max(0, Number(source.durationSeconds || 0));
  const positionSeconds = Math.max(0, Number(source.resumeSeconds || 0));
  return {
    animeId: source.animeId || title,
    title,
    poster: source.poster || source.image || source.banner,
    episode: source.episode || 1,
    positionSeconds,
    durationSeconds: durationSeconds || undefined,
    progressPercent: playbackProgressPercent(source),
    updatedAt: Number(source.progressUpdatedAt || source.savedAt || Date.now()),
    completed: source.completed ?? isPlaybackEntryComplete(source),
  };
}

function watchedSeriesFromProgress(record: Partial<DesktopWatchProgressRecord>): DesktopWatchedSeriesRecord | null {
  const title = String(record.title || '').trim();
  if (!title) return null;
  return {
    animeId: record.animeId || title,
    title,
    poster: record.poster,
    lastEpisode: record.episode,
    updatedAt: Number(record.updatedAt || Date.now()),
  };
}

function watchedSeriesFromSource(source: Partial<LocalPlaybackSource>): DesktopWatchedSeriesRecord | null {
  const title = String(source.animeTitle || source.title || '').trim();
  if (!title) return null;
  return {
    animeId: source.animeId || title,
    title,
    poster: source.poster || source.image || source.banner,
    lastEpisode: source.episode || undefined,
    updatedAt: Number(source.progressUpdatedAt || source.savedAt || Date.now()),
  };
}

function watchedSeriesKey(record: Partial<DesktopWatchedSeriesRecord>) {
  return seriesTitleKey(record.title) || animeTitleKey(String(record.animeId || ''));
}

function mergeWatchedSeriesRecords(records: DesktopWatchedSeriesRecord[]) {
  const merged = new Map<string, DesktopWatchedSeriesRecord>();
  records
    .filter((record) => Boolean(record?.title))
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
    .forEach((record) => {
      const key = watchedSeriesKey(record);
      if (!key || merged.has(key)) return;
      merged.set(key, record);
    });
  return Array.from(merged.values()).slice(0, DESKTOP_WATCHED_SERIES_LIMIT);
}

function readStoredWatchedSeries(): DesktopWatchedSeriesRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DESKTOP_WATCHED_SERIES_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((record): record is DesktopWatchedSeriesRecord => Boolean(record?.title));
  } catch {
    return [];
  }
}

function writeWatchedSeries(records: DesktopWatchedSeriesRecord[], notify = true) {
  const next = mergeWatchedSeriesRecords(records);
  localStorage.setItem(DESKTOP_WATCHED_SERIES_KEY, JSON.stringify(next));
  if (notify) emitDesktopEvent(DESKTOP_WATCH_PROGRESS_EVENT);
  return next;
}

function upsertWatchedSeries(record: DesktopWatchedSeriesRecord) {
  const key = watchedSeriesKey(record);
  if (!key) return;
  writeWatchedSeries([
    record,
    ...readStoredWatchedSeries().filter((item) => watchedSeriesKey(item) !== key),
  ]);
}

function rebuildWatchedSeriesFromHistory(history: LocalPlaybackSource[]) {
  const records = history
    .map(watchedSeriesFromSource)
    .filter((record): record is DesktopWatchedSeriesRecord => Boolean(record));
  writeWatchedSeries(records);
}

export function loadDesktopWatchedSeries(): DesktopWatchedSeriesRecord[] {
  try {
    const stored = readStoredWatchedSeries();
    const migrated = [
      ...loadDesktopWatchProgress()
        .map(watchedSeriesFromProgress)
        .filter((record): record is DesktopWatchedSeriesRecord => Boolean(record)),
      ...loadLocalPlaybackHistory()
        .map(watchedSeriesFromSource)
        .filter((record): record is DesktopWatchedSeriesRecord => Boolean(record)),
    ];
    const merged = mergeWatchedSeriesRecords([...stored, ...migrated]);
    if (JSON.stringify(merged) !== JSON.stringify(stored)) {
      writeWatchedSeries(merged, false);
    }
    return merged;
  } catch {
    return [];
  }
}

function rebuildWatchProgressFromHistory(history = loadLocalPlaybackHistory()) {
  const records = history
    .map(watchProgressFromSource)
    .filter((item): item is DesktopWatchProgressRecord => Boolean(item))
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
    .slice(0, DESKTOP_WATCH_PROGRESS_LIMIT);
  localStorage.setItem(DESKTOP_WATCH_PROGRESS_KEY, JSON.stringify(records));
  emitDesktopEvent(DESKTOP_WATCH_PROGRESS_EVENT);
}

export function loadDesktopWatchProgress(): DesktopWatchProgressRecord[] {
  try {
    const raw = localStorage.getItem(DESKTOP_WATCH_PROGRESS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is DesktopWatchProgressRecord => Boolean(item?.title && item?.episode))
      .slice(0, DESKTOP_WATCH_PROGRESS_LIMIT);
  } catch {
    return [];
  }
}

export function saveDesktopWatchProgress(record: DesktopWatchProgressRecord) {
  try {
    const normalized: DesktopWatchProgressRecord = {
      ...record,
      positionSeconds: Math.max(0, Number(record.positionSeconds || 0)),
      durationSeconds: record.durationSeconds ? Math.max(0, Number(record.durationSeconds)) : undefined,
      progressPercent: record.progressPercent === undefined
        ? undefined
        : Math.max(0, Math.min(100, Number(record.progressPercent || 0))),
      updatedAt: record.updatedAt || Date.now(),
      completed: record.completed ?? isPlaybackEntryComplete({
        progressPercent: record.progressPercent,
        resumeSeconds: record.positionSeconds,
        durationSeconds: record.durationSeconds,
      }),
    };
    const key = watchProgressKey(normalized);
    const current = loadDesktopWatchProgress();
    const existing = current.find((item) => watchProgressKey(item) === key);
    if (existing && Number(existing.updatedAt || 0) > normalized.updatedAt) {
      return;
    }
    if (
      existing
      && Math.abs(Number(existing.positionSeconds || 0) - normalized.positionSeconds) < 5
      && Math.abs(Number(existing.progressPercent || 0) - Number(normalized.progressPercent || 0)) < 1
    ) {
      return;
    }
    const next = [
      normalized,
      ...current.filter((item) => watchProgressKey(item) !== key),
    ].slice(0, DESKTOP_WATCH_PROGRESS_LIMIT);
    localStorage.setItem(DESKTOP_WATCH_PROGRESS_KEY, JSON.stringify(next));
    const watchedSeries = watchedSeriesFromProgress(normalized);
    if (watchedSeries) upsertWatchedSeries(watchedSeries);
    emitDesktopEvent(DESKTOP_WATCH_PROGRESS_EVENT);
  } catch {
    // Progress is convenience data. Playback must never depend on it.
  }
}

export function replaceDesktopWatchProgress(records: DesktopWatchProgressRecord[]) {
  try {
    const next = records
      .filter((item): item is DesktopWatchProgressRecord => Boolean(item?.title && item?.episode))
      .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
      .slice(0, DESKTOP_WATCH_PROGRESS_LIMIT);
    localStorage.setItem(DESKTOP_WATCH_PROGRESS_KEY, JSON.stringify(next));
    const watchedSeries = next
      .map(watchedSeriesFromProgress)
      .filter((item): item is DesktopWatchedSeriesRecord => Boolean(item));
    writeWatchedSeries(watchedSeries, false);
    emitDesktopEvent(DESKTOP_WATCH_PROGRESS_EVENT);
  } catch {
    // Synced progress is optional and must never block playback.
  }
}

export function findDesktopWatchProgressForSource(
  source: Partial<LocalPlaybackSource>,
  records = loadDesktopWatchProgress(),
) {
  return records
    .filter((record) => watchProgressMatchesSource(record, source))
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0] || null;
}

export function resolveDesktopPlaybackCheckpoint(source: Partial<LocalPlaybackSource>) {
  const history = findLocalPlaybackHistoryItem(source);
  const watchProgress = findDesktopWatchProgressForSource(source);
  const candidates = [
    source.resumeSeconds !== undefined ? {
      positionSeconds: Math.max(0, Number(source.resumeSeconds || 0)),
      durationSeconds: Math.max(0, Number(source.durationSeconds || 0)),
      progressPercent: playbackProgressPercent(source),
      updatedAt: Number(source.progressUpdatedAt || source.savedAt || 0),
      completed: source.completed ?? isPlaybackEntryComplete(source),
    } : null,
    history ? {
      positionSeconds: Math.max(0, Number(history.resumeSeconds || 0)),
      durationSeconds: Math.max(0, Number(history.durationSeconds || 0)),
      progressPercent: playbackProgressPercent(history),
      updatedAt: Number(history.progressUpdatedAt || history.savedAt || 0),
      completed: history.completed ?? isPlaybackEntryComplete(history),
    } : null,
    watchProgress ? {
      positionSeconds: Math.max(0, Number(watchProgress.positionSeconds || 0)),
      durationSeconds: Math.max(0, Number(watchProgress.durationSeconds || 0)),
      progressPercent: playbackProgressPercent({
        progressPercent: watchProgress.progressPercent,
        resumeSeconds: watchProgress.positionSeconds,
        durationSeconds: watchProgress.durationSeconds,
      }),
      updatedAt: Number(watchProgress.updatedAt || 0),
      completed: watchProgress.completed ?? isPlaybackEntryComplete({
        progressPercent: watchProgress.progressPercent,
        resumeSeconds: watchProgress.positionSeconds,
        durationSeconds: watchProgress.durationSeconds,
      }),
    } : null,
  ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  return candidates.sort((left, right) => right.updatedAt - left.updatedAt)[0] || null;
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
    localStorage.removeItem(DESKTOP_WATCH_PROGRESS_KEY);
    localStorage.removeItem(DESKTOP_WATCHED_SERIES_KEY);
    emitDesktopEvent(LOCAL_PLAYBACK_HISTORY_EVENT);
    emitDesktopEvent(DESKTOP_WATCH_PROGRESS_EVENT);
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
    rebuildWatchProgressFromHistory(next);
    rebuildWatchedSeriesFromHistory(next);
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
    rebuildWatchProgressFromHistory(next);
    rebuildWatchedSeriesFromHistory(next);
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
    const progress = watchProgressFromSource(normalized);
    if (progress) saveDesktopWatchProgress(progress);
    emitDesktopEvent(LOCAL_PLAYBACK_HISTORY_EVENT);
  } catch {
    // Playback history is a convenience feature. Failing to persist it should not block playback.
  }
}

export async function openLocalSourceNow(source: LocalPlaybackSource, settings = loadDesktopPlaybackSettings()) {
  const existing = findLocalPlaybackHistoryItem(source);
  const checkpoint = resolveDesktopPlaybackCheckpoint(source);
  const preparedSource: LocalPlaybackSource = {
    ...(existing || {}),
    ...source,
    progressPercent: checkpoint?.progressPercent ?? 0,
    progressUpdatedAt: checkpoint?.updatedAt || source.progressUpdatedAt || existing?.progressUpdatedAt,
    resumeSeconds: checkpoint?.positionSeconds ?? 0,
    durationSeconds: checkpoint?.durationSeconds ?? 0,
    completed: checkpoint?.completed ?? false,
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
  // Torrent completion and watched completion are independent metrics. Watch
  // progress must always come from the media timeline when duration is known.
  const percent = durationSeconds > 0
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
    completed: isPlaybackEntryComplete({
      progressPercent: percent,
      resumeSeconds: currentSeconds,
      durationSeconds,
    }),
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

const SAFE_DESKTOP_BACKUP_KEYS = [
  DESKTOP_SETTINGS_KEY,
  DESKTOP_AUDIO_PREFERENCE_KEY,
  DESKTOP_AUTO_OPEN_BEST_SOURCE_KEY,
  DESKTOP_AUTO_PLAY_NEXT_EPISODE_KEY,
  DESKTOP_PLAYER_PREFERENCES_KEY,
  LOCAL_PLAYBACK_HISTORY_KEY,
  DESKTOP_WATCH_PROGRESS_KEY,
  DESKTOP_WATCHED_SERIES_KEY,
  'streamnyaa.desktop.scheduleReminders.v1',
] as const;

export function exportDesktopSettingsBackup() {
  const entries: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    SAFE_DESKTOP_BACKUP_KEYS.forEach((key) => {
      const value = localStorage.getItem(key);
      if (typeof value === 'string') entries[key] = value;
    });
  }

  return JSON.stringify({
    app: 'StreamNyaa Desktop',
    version: 1,
    exportedAt: new Date().toISOString(),
    keys: entries,
  }, null, 2);
}

export function importDesktopSettingsBackup(payload: string) {
  const parsed = JSON.parse(payload);
  const keys = parsed?.keys;
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
    throw new Error('This backup file is not a valid StreamNyaa desktop backup.');
  }

  let imported = 0;
  SAFE_DESKTOP_BACKUP_KEYS.forEach((key) => {
    const value = keys[key];
    if (typeof value === 'string') {
      localStorage.setItem(key, value);
      imported += 1;
    }
  });

  emitDesktopEvent(DESKTOP_AUDIO_PREFERENCE_EVENT);
  emitDesktopEvent(DESKTOP_AUTO_OPEN_BEST_SOURCE_EVENT);
  emitDesktopEvent(DESKTOP_AUTO_PLAY_NEXT_EPISODE_EVENT);
  emitDesktopEvent(DESKTOP_PLAYER_PREFERENCES_EVENT);
  emitDesktopEvent(LOCAL_PLAYBACK_HISTORY_EVENT);
  emitDesktopEvent(DESKTOP_WATCH_PROGRESS_EVENT);
  return imported;
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

  try {
    const result = await invoke<DesktopPlaybackStatus>('play_local_torrent', {
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
    if (!result?.ok && result?.message) {
      return { ...result, message: describeDesktopPlaybackError(result.message) };
    }
    return result;
  } catch (error) {
    throw new Error(describeDesktopPlaybackError(error));
  }
}

export function describeDesktopPlaybackError(error: unknown) {
  const raw = String(
    error instanceof Error
      ? error.message
      : (error as { message?: unknown })?.message || error || '',
  ).replace(/^Playback task could not finish:\s*/i, '').trim();
  if (!raw) return 'Playback could not start. Try another verified release.';
  if (/no peers?|zero peers?|waiting for the first peers?|did not respond/i.test(raw)) {
    return 'No peers responded for this release. StreamNyaa will try another verified source.';
  }
  if (/metadata|no matching playable|expose(?:d)? a playable|episode file/i.test(raw)) {
    return 'Torrent metadata did not expose the requested playable episode. Try another release.';
  }
  if (/delivered no video data|buffer.*not advancing|stalled/i.test(raw)) {
    return 'Peers connected, but video data stopped advancing. StreamNyaa will recover or switch sources.';
  }
  if (/local stream engine|torrent engine|rqbit/i.test(raw)) {
    return `The local torrent engine could not start this release. ${raw}`;
  }
  if (/native player|mpv|decoder|load the stream/i.test(raw)) {
    return `The native video player could not open this release. ${raw}`;
  }
  return raw;
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

function progressRecordMatchesAnime(record: DesktopWatchProgressRecord, anime: any) {
  const recordId = String(record.animeId || '').trim();
  const targetIds = [anime?.mal_id, anime?.idMal, anime?.id, anime?.anilist_id]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (recordId && targetIds.includes(recordId)) return true;

  const recordTitle = animeTitleKey(record.title || '');
  const targetTitles = [anime?.title, anime?.title_english, anime?.title_romaji, anime?.title_japanese]
    .map((value) => animeTitleKey(value || ''))
    .filter(Boolean);
  return Boolean(recordTitle && targetTitles.includes(recordTitle));
}

function seriesTitleKey(value: unknown) {
  return animeTitleKey(String(value || ''))
    .replace(/\b(?:season|part|cour)\s*\d+\b/g, ' ')
    .replace(/\b(?:second|third|fourth|fifth|final)\s+season\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function desktopWatchedSeriesMatchesAnime(record: DesktopWatchedSeriesRecord, anime: any) {
  const recordId = String(record.animeId || '').trim();
  const targetIds = [anime?.mal_id, anime?.idMal, anime?.id, anime?.anilist_id]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (recordId && targetIds.includes(recordId)) return true;

  const recordSeriesKey = seriesTitleKey(record.title);
  const targetSeriesKeys = [anime?.title, anime?.title_english, anime?.title_romaji, anime?.title_japanese]
    .map(seriesTitleKey)
    .filter((value) => value.length >= 4);
  return Boolean(recordSeriesKey && targetSeriesKeys.includes(recordSeriesKey));
}

export function desktopEpisodeWatchState(
  anime: any,
  episode: number,
  records = loadDesktopWatchProgress(),
): DesktopEpisodeWatchState {
  const match = records
    .filter((record) => progressRecordMatchesAnime(record, anime))
    .find((record) => normalizedEpisodeNumber(record.episode) === normalizedEpisodeNumber(episode));
  if (!match) {
    return { started: false, completed: false, progressPercent: 0, positionSeconds: 0, updatedAt: 0 };
  }

  const progressPercent = playbackProgressPercent({
    progressPercent: match.progressPercent,
    resumeSeconds: match.positionSeconds,
    durationSeconds: match.durationSeconds,
  });
  const completed = isPlaybackEntryComplete({
    progressPercent,
    resumeSeconds: match.positionSeconds,
    durationSeconds: match.durationSeconds,
  });
  return {
    started: completed || progressPercent >= 1 || Number(match.positionSeconds || 0) >= 5,
    completed,
    progressPercent,
    positionSeconds: Number(match.positionSeconds || 0),
    updatedAt: Number(match.updatedAt || 0),
  };
}

export function setDesktopEpisodeWatched(anime: any, episode: number, watched: boolean) {
  const normalizedEpisode = normalizedEpisodeNumber(episode);
  if (!normalizedEpisode) return;

  if (watched) {
    const title = String(
      (typeof anime?.title === 'string' ? anime.title : '')
      || anime?.title_english
      || anime?.title_romaji
      || anime?.title?.english
      || anime?.title?.romaji
      || anime?.title?.native
      || '',
    ).trim();
    if (!title) return;
    saveDesktopWatchProgress({
      animeId: animeIdentity(anime) || title,
      title,
      poster: anime?.images?.jpg?.large_image_url
        || anime?.images?.webp?.large_image_url
        || anime?.cover_image
        || anime?.coverImage?.extraLarge
        || anime?.coverImage?.large
        || anime?.image,
      episode: normalizedEpisode,
      positionSeconds: 0,
      progressPercent: 100,
      updatedAt: Date.now(),
      completed: true,
    });
    return;
  }

  try {
    const nextProgress = loadDesktopWatchProgress().filter((record) => !(
      progressRecordMatchesAnime(record, anime)
      && normalizedEpisodeNumber(record.episode) === normalizedEpisode
    ));
    localStorage.setItem(DESKTOP_WATCH_PROGRESS_KEY, JSON.stringify(nextProgress));

    const nextHistory = loadLocalPlaybackHistory().map((source) => {
      if (!playbackHistoryMatchesAnime(source, anime)) return source;
      if (normalizedEpisodeNumber(source.episode) !== normalizedEpisode) return source;
      return {
        ...source,
        progressPercent: 0,
        progressUpdatedAt: Date.now(),
        resumeSeconds: 0,
        completed: false,
      };
    });
    localStorage.setItem(LOCAL_PLAYBACK_HISTORY_KEY, JSON.stringify(nextHistory));
    emitDesktopEvent(DESKTOP_WATCH_PROGRESS_EVENT);
    emitDesktopEvent(LOCAL_PLAYBACK_HISTORY_EVENT);
  } catch {
    // Manual watch state is convenience data and must never affect playback.
  }
}

export function hasDesktopWatchedSeries(anime: any, records = loadDesktopWatchProgress()) {
  const targetSeriesKeys = [anime?.title, anime?.title_english, anime?.title_romaji, anime?.title_japanese]
    .map(seriesTitleKey)
    .filter((value) => value.length >= 4);
  if (loadDesktopWatchedSeries().some((record) => desktopWatchedSeriesMatchesAnime(record, anime))) {
    return true;
  }
  return records.some((record) => {
    const hasPlayback = Number(record.positionSeconds || 0) >= 5 || Number(record.progressPercent || 0) >= 1;
    if (!hasPlayback) return false;
    if (progressRecordMatchesAnime(record, anime)) return true;
    const recordSeriesKey = seriesTitleKey(record.title);
    return Boolean(recordSeriesKey && targetSeriesKeys.includes(recordSeriesKey));
  });
}

export async function beginDesktopGoogleOAuth(authorizeUrl: string) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    throw new Error('Desktop Google sign-in is unavailable in this runtime.');
  }

  return invoke<void>('begin_desktop_google_oauth', { authorizeUrl });
}

export async function listenDesktopOAuthCallback(listener: (event: DesktopOAuthCallbackEvent) => void) {
  if (typeof window === 'undefined') return () => {};
  const listen = window.__TAURI__?.event?.listen;
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!listen || !invoke) return () => {};
  const takePending = () => invoke<DesktopOAuthCallbackEvent | null>('take_pending_desktop_oauth_callback');
  const unlisten = await listen<DesktopOAuthCallbackEvent>('streamnyaa-desktop-oauth-callback', (event) => {
    void takePending().then((pending) => {
      if (pending?.url || pending?.error) listener(pending);
    }).catch(() => {
      if (event.payload?.url || event.payload?.error) listener(event.payload);
    });
  });
  const pending = await takePending();
  if (pending?.url || pending?.error) queueMicrotask(() => listener(pending));
  return unlisten;
}

export async function listenDesktopPlayerRecoveryRequest(listener: (event: DesktopPlayerRecoveryRequestEvent) => void) {
  if (typeof window === 'undefined') return () => {};
  const listen = window.__TAURI__?.event?.listen;
  if (!listen) return () => {};
  return listen<DesktopPlayerRecoveryRequestEvent>('streamnyaa-player-recovery-request', (event) => {
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

export async function fetchDesktopSourceApi(url: string): Promise<DesktopSourceApiResponse> {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (invoke) {
    return invoke<DesktopSourceApiResponse>('fetch_desktop_source_api', { url });
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
