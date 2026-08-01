export type AudioPreference = 'sub-preferred' | 'dual-preferred' | 'dub-only';

export type SubtitleStylePreferences = {
  fontSize: string;
  position: string;
  textColor: string;
  outline: string;
  shadow: string;
  background: string;
  custom: boolean;
};

export type PlayerPreferences = {
  autoNextEpisode: boolean;
  autoSkipIntro: boolean;
  autoSkipOutro: boolean;
  rememberSpeed: boolean;
  playbackSpeed: number;
  volume: number;
  muted: boolean;
  subtitleStyle: SubtitleStylePreferences;
};

export type PlayerPreferencesPatch = Partial<Omit<PlayerPreferences, 'subtitleStyle'>> & {
  subtitleStyle?: Partial<SubtitleStylePreferences>;
};

export type MobileResourcePolicy = {
  batterySaver: boolean;
  allowBackgroundPlayback: boolean;
  wifiOnly: boolean;
  maxCacheMiB: number;
};

export type SyncedPreferences = {
  updatedAt: string;
  audioPreference: AudioPreference;
  autoOpenBestSource: boolean;
  playerPreferences: PlayerPreferences;
};

export const DEFAULT_AUDIO_PREFERENCE: AudioPreference = 'sub-preferred';
export const DEFAULT_AUTO_OPEN_BEST_SOURCE = false;
export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
  autoNextEpisode: false,
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

export const DEFAULT_MOBILE_RESOURCE_POLICY: MobileResourcePolicy = {
  batterySaver: true,
  allowBackgroundPlayback: false,
  wifiOnly: false,
  maxCacheMiB: 2048,
};

export const DEFAULT_SYNCED_PREFERENCES: SyncedPreferences = {
  updatedAt: new Date(0).toISOString(),
  audioPreference: DEFAULT_AUDIO_PREFERENCE,
  autoOpenBestSource: DEFAULT_AUTO_OPEN_BEST_SOURCE,
  playerPreferences: DEFAULT_PLAYER_PREFERENCES,
};

export function asBooleanPreference(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value >= 0.5;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

export function asNumberPreference(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizePlayerPreferences(value: PlayerPreferencesPatch = {}): PlayerPreferences {
  const subtitleStyle = value.subtitleStyle || {};
  return {
    autoNextEpisode: asBooleanPreference(value.autoNextEpisode, DEFAULT_PLAYER_PREFERENCES.autoNextEpisode),
    autoSkipIntro: asBooleanPreference(value.autoSkipIntro, DEFAULT_PLAYER_PREFERENCES.autoSkipIntro),
    autoSkipOutro: asBooleanPreference(value.autoSkipOutro, DEFAULT_PLAYER_PREFERENCES.autoSkipOutro),
    rememberSpeed: asBooleanPreference(value.rememberSpeed, DEFAULT_PLAYER_PREFERENCES.rememberSpeed),
    playbackSpeed: asNumberPreference(value.playbackSpeed, DEFAULT_PLAYER_PREFERENCES.playbackSpeed, 0.25, 4),
    volume: asNumberPreference(value.volume, DEFAULT_PLAYER_PREFERENCES.volume, 0, 130),
    muted: asBooleanPreference(value.muted, DEFAULT_PLAYER_PREFERENCES.muted),
    subtitleStyle: {
      fontSize: typeof subtitleStyle.fontSize === 'string' ? subtitleStyle.fontSize : DEFAULT_PLAYER_PREFERENCES.subtitleStyle.fontSize,
      position: typeof subtitleStyle.position === 'string' ? subtitleStyle.position : DEFAULT_PLAYER_PREFERENCES.subtitleStyle.position,
      textColor: typeof subtitleStyle.textColor === 'string' ? subtitleStyle.textColor : DEFAULT_PLAYER_PREFERENCES.subtitleStyle.textColor,
      outline: typeof subtitleStyle.outline === 'string' ? subtitleStyle.outline : DEFAULT_PLAYER_PREFERENCES.subtitleStyle.outline,
      shadow: typeof subtitleStyle.shadow === 'string' ? subtitleStyle.shadow : DEFAULT_PLAYER_PREFERENCES.subtitleStyle.shadow,
      background: typeof subtitleStyle.background === 'string' ? subtitleStyle.background : DEFAULT_PLAYER_PREFERENCES.subtitleStyle.background,
      custom: asBooleanPreference(subtitleStyle.custom, DEFAULT_PLAYER_PREFERENCES.subtitleStyle.custom),
    },
  };
}

export function normalizeMobileResourcePolicy(value: Partial<MobileResourcePolicy> = {}): MobileResourcePolicy {
  return {
    batterySaver: asBooleanPreference(value.batterySaver, DEFAULT_MOBILE_RESOURCE_POLICY.batterySaver),
    allowBackgroundPlayback: asBooleanPreference(value.allowBackgroundPlayback, DEFAULT_MOBILE_RESOURCE_POLICY.allowBackgroundPlayback),
    wifiOnly: asBooleanPreference(value.wifiOnly, DEFAULT_MOBILE_RESOURCE_POLICY.wifiOnly),
    maxCacheMiB: Math.round(asNumberPreference(value.maxCacheMiB, DEFAULT_MOBILE_RESOURCE_POLICY.maxCacheMiB, 512, 8192)),
  };
}

export function normalizeSyncedPreferences(value: Partial<SyncedPreferences> = {}): SyncedPreferences {
  const parsedTimestamp = Date.parse(value.updatedAt || '');
  return {
    updatedAt: Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp).toISOString() : DEFAULT_SYNCED_PREFERENCES.updatedAt,
    audioPreference: ['sub-preferred', 'dual-preferred', 'dub-only'].includes(String(value.audioPreference))
      ? value.audioPreference as AudioPreference
      : DEFAULT_AUDIO_PREFERENCE,
    autoOpenBestSource: asBooleanPreference(value.autoOpenBestSource, DEFAULT_AUTO_OPEN_BEST_SOURCE),
    playerPreferences: normalizePlayerPreferences(value.playerPreferences),
  };
}

export function mergeSyncedPreferences(local: SyncedPreferences, remote?: Partial<SyncedPreferences> | null) {
  const normalizedLocal = normalizeSyncedPreferences(local);
  const normalizedRemote = normalizeSyncedPreferences(remote || {});
  return Date.parse(normalizedRemote.updatedAt) > Date.parse(normalizedLocal.updatedAt) ? normalizedRemote : normalizedLocal;
}

export function watchTypeForAudioPreference(preference: AudioPreference) {
  return preference === 'sub-preferred' ? 'sub' : 'dub';
}
