import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Anime, LibraryItem, PlaybackHistoryItem } from '../types';
import { isPlaybackComplete } from '../../../shared/account';
import {
  DEFAULT_AUDIO_PREFERENCE,
  DEFAULT_AUTO_OPEN_BEST_SOURCE,
  DEFAULT_MOBILE_RESOURCE_POLICY,
  DEFAULT_PLAYER_PREFERENCES,
  normalizeMobileResourcePolicy,
  normalizePlayerPreferences,
  normalizeSyncedPreferences,
  type AudioPreference,
  type MobileResourcePolicy,
  type PlayerPreferences,
  type PlayerPreferencesPatch,
  type SyncedPreferences,
} from '../../../shared/preferences';

type ThemeMode = 'dark' | 'light' | 'system';

export type AiringReminderRecord = {
  notificationId: string;
  animeId: string;
  animeTitle: string;
  episode?: number;
  airingAt: number;
};

export type SourceFailureRecord = { count: number; lastFailedAt: string; reason: string };

type AppState = {
  hydrated: boolean;
  permissionsOnboardingCompleted: boolean;
  themeMode: ThemeMode;
  nsfwMode: boolean;
  audioPreference: AudioPreference;
  autoPlayNext: boolean;
  autoOpenBestSource: boolean;
  playerPreferences: PlayerPreferences;
  resourcePolicy: MobileResourcePolicy;
  preferencesUpdatedAt: string;
  recentExploreSearches: string[];
  recentSourceSearches: string[];
  airingReminders: Record<string, AiringReminderRecord>;
  sourceFailures: Record<string, SourceFailureRecord>;
  library: LibraryItem[];
  history: PlaybackHistoryItem[];
  setHydrated: (value: boolean) => void;
  completePermissionsOnboarding: () => void;
  setThemeMode: (value: ThemeMode) => void;
  setNsfwMode: (value: boolean) => void;
  setAudioPreference: (value: AudioPreference) => void;
  setAutoPlayNext: (value: boolean) => void;
  setAutoOpenBestSource: (value: boolean) => void;
  setPlayerPreferences: (value: PlayerPreferencesPatch) => void;
  setResourcePolicy: (value: Partial<MobileResourcePolicy>) => void;
  replaceSyncedPreferences: (value: SyncedPreferences) => void;
  addRecentExploreSearch: (value: string) => void;
  addRecentSourceSearch: (value: string) => void;
  saveAiringReminder: (key: string, value: AiringReminderRecord) => void;
  removeAiringReminder: (key: string) => void;
  recordSourceFailure: (key: string, reason: string) => void;
  clearSourceFailure: (key: string) => void;
  toggleBookmark: (anime: Anime) => void;
  toggleLike: (anime: Anime) => void;
  replaceLibrary: (items: LibraryItem[]) => void;
  saveProgress: (item: PlaybackHistoryItem) => void;
  replaceHistory: (items: PlaybackHistoryItem[]) => void;
  removeHistory: (key: string) => void;
  clearHistory: () => void;
  clearCompletedHistory: () => void;
};

function updateLibrary(items: LibraryItem[], anime: Anime, field: 'bookmarked' | 'liked') {
  const animeId = String(anime.malId || anime.id);
  const existing = items.find((item) => item.animeId === animeId);
  const next: LibraryItem = {
    animeId,
    animeTitle: anime.title,
    anime,
    bookmarked: existing?.bookmarked || false,
    liked: existing?.liked || false,
    updatedAt: new Date().toISOString(),
    [field]: !existing?.[field],
  };
  return [next, ...items.filter((item) => item.animeId !== animeId)]
    .filter((item) => item.bookmarked || item.liked)
    .slice(0, 500);
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hydrated: false,
      permissionsOnboardingCompleted: false,
      themeMode: 'dark',
      nsfwMode: false,
      audioPreference: DEFAULT_AUDIO_PREFERENCE,
      autoPlayNext: DEFAULT_PLAYER_PREFERENCES.autoNextEpisode,
      autoOpenBestSource: DEFAULT_AUTO_OPEN_BEST_SOURCE,
      playerPreferences: DEFAULT_PLAYER_PREFERENCES,
      resourcePolicy: DEFAULT_MOBILE_RESOURCE_POLICY,
      preferencesUpdatedAt: new Date(0).toISOString(),
      recentExploreSearches: [],
      recentSourceSearches: [],
      airingReminders: {},
      sourceFailures: {},
      library: [],
      history: [],
      setHydrated: (hydrated) => set({ hydrated }),
      completePermissionsOnboarding: () => set({ permissionsOnboardingCompleted: true }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setNsfwMode: (nsfwMode) => set({ nsfwMode }),
      setAudioPreference: (audioPreference) => set({ audioPreference, preferencesUpdatedAt: new Date().toISOString() }),
      setAutoPlayNext: (autoPlayNext) => set((state) => ({
        autoPlayNext,
        playerPreferences: normalizePlayerPreferences({ ...state.playerPreferences, autoNextEpisode: autoPlayNext }),
        preferencesUpdatedAt: new Date().toISOString(),
      })),
      setAutoOpenBestSource: (autoOpenBestSource) => set({ autoOpenBestSource, preferencesUpdatedAt: new Date().toISOString() }),
      setPlayerPreferences: (value) => set((state) => {
        const playerPreferences = normalizePlayerPreferences({
          ...state.playerPreferences,
          ...value,
          subtitleStyle: { ...state.playerPreferences.subtitleStyle, ...(value.subtitleStyle || {}) },
        });
        return { playerPreferences, autoPlayNext: playerPreferences.autoNextEpisode, preferencesUpdatedAt: new Date().toISOString() };
      }),
      setResourcePolicy: (value) => set((state) => ({ resourcePolicy: normalizeMobileResourcePolicy({ ...state.resourcePolicy, ...value }) })),
      replaceSyncedPreferences: (value) => set(() => {
        const preferences = normalizeSyncedPreferences(value);
        return {
          audioPreference: preferences.audioPreference,
          autoOpenBestSource: preferences.autoOpenBestSource,
          autoPlayNext: preferences.playerPreferences.autoNextEpisode,
          playerPreferences: preferences.playerPreferences,
          preferencesUpdatedAt: preferences.updatedAt,
        };
      }),
      addRecentExploreSearch: (value) => set((state) => ({
        recentExploreSearches: [value.trim(), ...state.recentExploreSearches.filter((item) => item.toLowerCase() !== value.trim().toLowerCase())].filter(Boolean).slice(0, 6),
      })),
      addRecentSourceSearch: (value) => set((state) => ({
        recentSourceSearches: [value.trim(), ...state.recentSourceSearches.filter((item) => item.toLowerCase() !== value.trim().toLowerCase())].filter(Boolean).slice(0, 6),
      })),
      saveAiringReminder: (key, value) => set((state) => ({ airingReminders: { ...state.airingReminders, [key]: value } })),
      removeAiringReminder: (key) => set((state) => {
        const airingReminders = { ...state.airingReminders };
        delete airingReminders[key];
        return { airingReminders };
      }),
      recordSourceFailure: (key, reason) => set((state) => {
        const previous = state.sourceFailures[key];
        const next = { ...state.sourceFailures, [key]: { count: Math.min(9, Number(previous?.count || 0) + 1), lastFailedAt: new Date().toISOString(), reason: reason.slice(0, 180) } };
        const kept = Object.entries(next).sort((left, right) => Date.parse(right[1].lastFailedAt) - Date.parse(left[1].lastFailedAt)).slice(0, 50);
        return { sourceFailures: Object.fromEntries(kept) };
      }),
      clearSourceFailure: (key) => set((state) => {
        if (!state.sourceFailures[key]) return state;
        const sourceFailures = { ...state.sourceFailures };
        delete sourceFailures[key];
        return { sourceFailures };
      }),
      toggleBookmark: (anime) => set((state) => ({ library: updateLibrary(state.library, anime, 'bookmarked') })),
      toggleLike: (anime) => set((state) => ({ library: updateLibrary(state.library, anime, 'liked') })),
      replaceLibrary: (library) => set({ library: library.slice(0, 500) }),
      saveProgress: (item) => set((state) => ({
        history: [item, ...state.history.filter((entry) => entry.key !== item.key)]
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
          .slice(0, 100),
      })),
      replaceHistory: (history) => set({ history: history.slice(0, 100) }),
      removeHistory: (key) => set((state) => ({ history: state.history.filter((item) => item.key !== key) })),
      clearHistory: () => set({ history: [] }),
      clearCompletedHistory: () => set((state) => ({
        history: state.history.filter((item) => !isPlaybackComplete(item.progressPercent, item.resumeSeconds, item.durationSeconds)),
      })),
    }),
    {
      name: 'streamnyaa.mobile.v1',
      version: 5,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted: unknown, version) => {
        const state = (persisted || {}) as Partial<AppState>;
        const playerPreferences = normalizePlayerPreferences({
          ...(state.playerPreferences || {}),
          autoNextEpisode: state.autoPlayNext ?? state.playerPreferences?.autoNextEpisode,
        });
        return {
          ...state,
          permissionsOnboardingCompleted: state.permissionsOnboardingCompleted ?? false,
          audioPreference: state.audioPreference || DEFAULT_AUDIO_PREFERENCE,
          autoPlayNext: playerPreferences.autoNextEpisode,
          autoOpenBestSource: version < 5 ? true : state.autoOpenBestSource ?? DEFAULT_AUTO_OPEN_BEST_SOURCE,
          playerPreferences,
          resourcePolicy: normalizeMobileResourcePolicy(state.resourcePolicy),
          preferencesUpdatedAt: state.preferencesUpdatedAt || new Date(0).toISOString(),
          recentExploreSearches: state.recentExploreSearches || [],
          recentSourceSearches: state.recentSourceSearches || [],
          airingReminders: state.airingReminders || {},
          sourceFailures: state.sourceFailures || {},
        } as AppState;
      },
      partialize: (state) => ({
        permissionsOnboardingCompleted: state.permissionsOnboardingCompleted,
        themeMode: state.themeMode,
        nsfwMode: state.nsfwMode,
        audioPreference: state.audioPreference,
        autoPlayNext: state.autoPlayNext,
        autoOpenBestSource: state.autoOpenBestSource,
        playerPreferences: state.playerPreferences,
        resourcePolicy: state.resourcePolicy,
        preferencesUpdatedAt: state.preferencesUpdatedAt,
        recentExploreSearches: state.recentExploreSearches,
        recentSourceSearches: state.recentSourceSearches,
        airingReminders: state.airingReminders,
        sourceFailures: state.sourceFailures,
        library: state.library,
        history: state.history,
      }) as AppState,
      onRehydrateStorage: () => (state) => {
        if (state) state.setHydrated(true);
        else useAppStore.setState({ hydrated: true });
      },
    },
  ),
);
