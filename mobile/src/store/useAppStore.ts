import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Anime, LibraryItem, PlaybackHistoryItem } from '../types';

type ThemeMode = 'dark' | 'light' | 'system';
type AudioPreference = 'sub-preferred' | 'dual-preferred' | 'dub-only';

type AppState = {
  hydrated: boolean;
  themeMode: ThemeMode;
  nsfwMode: boolean;
  audioPreference: AudioPreference;
  autoPlayNext: boolean;
  autoOpenBestSource: boolean;
  library: LibraryItem[];
  history: PlaybackHistoryItem[];
  setHydrated: (value: boolean) => void;
  setThemeMode: (value: ThemeMode) => void;
  setNsfwMode: (value: boolean) => void;
  setAudioPreference: (value: AudioPreference) => void;
  setAutoPlayNext: (value: boolean) => void;
  setAutoOpenBestSource: (value: boolean) => void;
  toggleBookmark: (anime: Anime) => void;
  toggleLike: (anime: Anime) => void;
  replaceLibrary: (items: LibraryItem[]) => void;
  saveProgress: (item: PlaybackHistoryItem) => void;
  replaceHistory: (items: PlaybackHistoryItem[]) => void;
  removeHistory: (key: string) => void;
  clearHistory: () => void;
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
      themeMode: 'dark',
      nsfwMode: false,
      audioPreference: 'sub-preferred',
      autoPlayNext: true,
      autoOpenBestSource: false,
      library: [],
      history: [],
      setHydrated: (hydrated) => set({ hydrated }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setNsfwMode: (nsfwMode) => set({ nsfwMode }),
      setAudioPreference: (audioPreference) => set({ audioPreference }),
      setAutoPlayNext: (autoPlayNext) => set({ autoPlayNext }),
      setAutoOpenBestSource: (autoOpenBestSource) => set({ autoOpenBestSource }),
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
    }),
    {
      name: 'streamnyaa.mobile.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hydrated: _hydrated, ...state }) => state,
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
);
