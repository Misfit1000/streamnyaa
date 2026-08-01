import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  fetchAccountSync,
  replaceAccountSyncData,
  type AccountLibraryItem,
  type AccountWatchHistoryItem,
} from '../lib/accountSync';
import { syncLocalDownloadHistoryToAccount } from '../lib/activity';
import {
  loadLocalPlaybackHistory,
  loadDesktopSyncedPreferences,
  applyDesktopSyncedPreferences,
  replaceLocalPlaybackHistory,
  subscribeDesktopAudioPreference,
  subscribeDesktopAutoOpenBestSource,
  subscribeDesktopPlayerPreferences,
  subscribeLocalPlaybackHistory,
  type LocalPlaybackSource,
} from '../lib/desktop';
import { useStore } from '../store/useStore';
import { mergeSharedHistory, mergeSharedLibrary } from '../../shared/account';
import { mergeSyncedPreferences } from '../../shared/preferences';

type AccountSyncState = 'idle' | 'syncing' | 'synced' | 'unavailable';

type AccountSyncContextValue = {
  state: AccountSyncState;
  message: string;
  lastSyncedAt: number | null;
  syncNow: () => Promise<void>;
};

const AccountSyncContext = createContext<AccountSyncContextValue | null>(null);
const PUSH_DEBOUNCE_MS = 900;

function storeAnimeId(anime: any) {
  return String(anime?.mal_id ?? anime?.id ?? anime?.title ?? '').trim();
}

function storeAnimeTitle(anime: any) {
  return String(anime?.title || anime?.title_english || anime?.title_romaji || 'Untitled anime').trim();
}

function libraryFromStore(): AccountLibraryItem[] {
  const state = useStore.getState();
  const rows = new Map<string, AccountLibraryItem>();
  const now = new Date().toISOString();

  state.myList.forEach((anime: any) => {
    const animeId = storeAnimeId(anime);
    if (!animeId) return;
    rows.set(animeId, {
      animeId,
      animeTitle: storeAnimeTitle(anime),
      anime,
      bookmarked: true,
      liked: Boolean(state.likes.some((id: any) => String(id) === animeId)),
      updatedAt: now,
    });
  });

  (state.likedAnimes || []).forEach((anime: any) => {
    const animeId = storeAnimeId(anime);
    if (!animeId) return;
    const existing = rows.get(animeId);
    rows.set(animeId, {
      animeId,
      animeTitle: storeAnimeTitle(anime),
      anime: existing?.anime || anime,
      bookmarked: Boolean(existing?.bookmarked),
      liked: true,
      updatedAt: now,
    });
  });

  state.likes.forEach((id: any) => {
    const animeId = String(id || '').trim();
    if (!animeId || rows.has(animeId)) return;
    rows.set(animeId, {
      animeId,
      animeTitle: animeId,
      anime: { mal_id: animeId, title: animeId },
      bookmarked: false,
      liked: true,
      updatedAt: now,
    });
  });

  return Array.from(rows.values()).slice(0, 500);
}

function mergeLibrary(local: AccountLibraryItem[], remote: AccountLibraryItem[]) {
  return mergeSharedLibrary(local, remote);
}

function applyLibraryToStore(library: AccountLibraryItem[]) {
  const myList = library.filter((item) => item.bookmarked).map((item) => item.anime);
  const likedAnimes = library.filter((item) => item.liked).map((item) => item.anime);
  const likes = library.filter((item) => item.liked).map((item) => item.animeId);
  useStore.setState({ myList, likedAnimes, likes });
}

function historyKey(source: Partial<LocalPlaybackSource>) {
  const animeKey = String(source.animeId || source.animeTitle || source.title || '').trim().toLowerCase();
  const episodeKey = String(source.episode || '').trim();
  return `${animeKey}::${episodeKey}`;
}

function historyUpdatedAt(source: Partial<LocalPlaybackSource>) {
  return Number(source.progressUpdatedAt || source.savedAt || 0);
}

function watchHistoryFromLocal(): AccountWatchHistoryItem[] {
  return loadLocalPlaybackHistory().map((source) => ({
    key: historyKey(source),
    source,
    animeId: source.animeId ? String(source.animeId) : undefined,
    animeTitle: source.animeTitle,
    episode: source.episode ?? null,
    updatedAt: new Date(historyUpdatedAt(source) || Date.now()).toISOString(),
  }));
}

function mergeWatchHistory(local: LocalPlaybackSource[], remote: AccountWatchHistoryItem[]) {
  const localRows = local.map((source) => ({
    key: historyKey(source),
    source,
    updatedAt: new Date(historyUpdatedAt(source) || 0).toISOString(),
  }));
  const remoteRows = remote
    .filter((item) => item.source)
    .map((item) => ({ key: item.key, source: item.source as LocalPlaybackSource, updatedAt: item.updatedAt }));
  return mergeSharedHistory(localRows, remoteRows, 18).map((item) => item.source);
}

export function AccountSyncProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const [state, setState] = useState<AccountSyncState>('idle');
  const [message, setMessage] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const initialSyncedRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);

  const pushCurrentState = useCallback(async () => {
    if (!session?.access_token || !initialSyncedRef.current) return;
    await replaceAccountSyncData(session, {
      library: libraryFromStore(),
      watchHistory: watchHistoryFromLocal(),
      preferences: loadDesktopSyncedPreferences(),
    });
    setLastSyncedAt(Date.now());
  }, [session]);

  const schedulePush = useCallback(() => {
    if (!session?.access_token || !initialSyncedRef.current) return;
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      void pushCurrentState().catch(() => {
        setState('unavailable');
        setMessage('Account sync will retry after the next local change.');
      });
    }, PUSH_DEBOUNCE_MS);
  }, [pushCurrentState, session]);

  const syncNow = useCallback(async () => {
    if (!session?.access_token) return;
    setState('syncing');
    setMessage('Syncing your profile, library, and watch history...');
    initialSyncedRef.current = false;

    try {
      const remote = await fetchAccountSync(session);
      const mergedLibrary = mergeLibrary(libraryFromStore(), remote.library);
      applyLibraryToStore(mergedLibrary);

      const mergedWatchHistory = mergeWatchHistory(loadLocalPlaybackHistory(), remote.watchHistory);
      replaceLocalPlaybackHistory(mergedWatchHistory);

      const mergedPreferences = mergeSyncedPreferences(loadDesktopSyncedPreferences(), remote.profile?.preferences);
      applyDesktopSyncedPreferences(mergedPreferences);

      await replaceAccountSyncData(session, {
        library: mergedLibrary,
        watchHistory: watchHistoryFromLocal(),
        preferences: mergedPreferences,
      });
      await syncLocalDownloadHistoryToAccount(session);

      initialSyncedRef.current = true;
      setState('synced');
      setMessage(user?.email ? `Signed in as ${user.email}. Your data is syncing across devices.` : 'Your account data is syncing across devices.');
      setLastSyncedAt(Date.now());
    } catch (error) {
      initialSyncedRef.current = false;
      setState('unavailable');
      setMessage(error instanceof Error ? error.message : 'Account sync is unavailable.');
    }
  }, [session, user?.email]);

  useEffect(() => {
    if (!session?.access_token) {
      initialSyncedRef.current = false;
      setState('idle');
      setMessage('');
      setLastSyncedAt(null);
      return;
    }
    void syncNow();
  }, [session?.access_token, syncNow]);

  useEffect(() => {
    if (!session?.access_token) return undefined;
    const unsubscribeStore = useStore.subscribe(() => schedulePush());
    const unsubscribeHistory = subscribeLocalPlaybackHistory(() => schedulePush());
    const unsubscribeAudio = subscribeDesktopAudioPreference(schedulePush);
    const unsubscribeAutoOpen = subscribeDesktopAutoOpenBestSource(schedulePush);
    const unsubscribePlayer = subscribeDesktopPlayerPreferences(schedulePush);
    return () => {
      unsubscribeStore();
      unsubscribeHistory();
      unsubscribeAudio();
      unsubscribeAutoOpen();
      unsubscribePlayer();
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    };
  }, [schedulePush, session?.access_token]);

  const value = useMemo<AccountSyncContextValue>(() => ({
    state,
    message,
    lastSyncedAt,
    syncNow,
  }), [lastSyncedAt, message, state, syncNow]);

  return <AccountSyncContext.Provider value={value}>{children}</AccountSyncContext.Provider>;
}

export function useAccountSync() {
  const value = useContext(AccountSyncContext);
  if (!value) throw new Error('useAccountSync must be used inside AccountSyncProvider');
  return value;
}

