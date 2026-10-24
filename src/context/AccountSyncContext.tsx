import { isDesktopApp } from '../lib/desktop';
import { WebAccountSyncProvider } from './WebAccountSyncContext';
import {mergeCoverage,coveragePercent} from '../lib/desktopCoverage';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  fetchAccountSync,
  replaceAccountSyncData,
  selectNewestAccountRecord,
  type AccountLibraryItem,
  type AccountWatchHistoryItem,
} from '../lib/accountSync';
import { replaceDesktopWatchProgress, subscribeDesktopWatchProgress, type DesktopWatchProgressRecord } from '../lib/desktop';
import { useStore } from '../store/useStore';
import { ensureHistoryArchive } from '../lib/desktopHistoryArchive';
import { syncDesktopHistory } from '../lib/desktopHistorySync';

type AccountSyncState = 'idle' | 'syncing' | 'synced' | 'unavailable';

type AccountSyncContextValue = {
  state: AccountSyncState;
  message: string;
  lastSyncedAt: number | null;
  syncNow: () => Promise<void>;
};

type SyncJournal = {
  library: Record<string, AccountLibraryItem>;
  watchHistory: Record<string, AccountWatchHistoryItem>;
};

import { AccountSyncContext } from './accountSyncShared';
const PUSH_DEBOUNCE_MS = 900;
const JOURNAL_PREFIX = 'streamnyaa.desktop.accountSync.v2.';
const PROJECTION_OWNER_KEY = 'streamnyaa.desktop.accountProjectionOwner.v1';
const GUEST_OWNER = '__guest__';

function storeAnimeId(anime: any) {
  return String(anime?.mal_id ?? anime?.id ?? anime?.title ?? '').trim();
}

function storeAnimeTitle(anime: any) {
  return String(anime?.title || anime?.title_english || anime?.title_romaji || 'Untitled anime').trim();
}

function timestamp(value?: string | number | null) {
  const parsed = typeof value === 'number' ? value : Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value?: string | number | null) {
  const time = timestamp(value) || Date.now();
  return new Date(time).toISOString();
}

function journalKey(userId: string) {
  return `${JOURNAL_PREFIX}${userId}`;
}

function emptyJournal(): SyncJournal {
  return { library: {}, watchHistory: {} };
}

function loadJournal(userId: string): SyncJournal {
  try {
    const parsed = JSON.parse(localStorage.getItem(journalKey(userId)) || 'null');
    return {
      library: parsed?.library && typeof parsed.library === 'object' ? parsed.library : {},
      watchHistory: parsed?.watchHistory && typeof parsed.watchHistory === 'object' ? parsed.watchHistory : {},
    };
  } catch {
    return emptyJournal();
  }
}

function saveJournal(userId: string, journal: SyncJournal) {
  localStorage.setItem(journalKey(userId), JSON.stringify(journal));
}

function librarySignature(item: Pick<AccountLibraryItem, 'animeTitle' | 'anime' | 'bookmarked' | 'liked' | 'deletedAt'>) {
  return JSON.stringify([item.animeTitle, item.anime, item.bookmarked, item.liked, item.deletedAt || null]);
}

function currentLibraryMap() {
  const state = useStore.getState();
  const rows = new Map<string, Omit<AccountLibraryItem, 'updatedAt'>>();
  state.myList.forEach((anime: any) => {
    const animeId = storeAnimeId(anime);
    if (!animeId) return;
    rows.set(animeId, {
      animeId,
      animeTitle: storeAnimeTitle(anime),
      anime,
      bookmarked: true,
      liked: Boolean(state.likes.some((id: any) => String(id) === animeId)),
      deletedAt: null,
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
      deletedAt: null,
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
      deletedAt: null,
    });
  });
  return rows;
}

function progressKey(record: Pick<DesktopWatchProgressRecord, 'animeId' | 'title' | 'episode'>) {
  const animeKey = String(record.animeId || record.title || '').trim().toLowerCase();
  return `${animeKey}::${String(record.episode || '').trim()}`;
}

function progressToSync(record: DesktopWatchProgressRecord): AccountWatchHistoryItem {
  return {
    key: progressKey(record),
    animeId: String(record.animeId || ''),
    animeTitle: record.title,
    poster: record.poster,
    episode: record.episode,
    watchedCoverage:record.watchedCoverage,
    positionSeconds: Math.max(0, Number(record.positionSeconds || 0)),
    durationSeconds: record.durationSeconds,
    watchedPercent: record.progressPercent,
    completed: Boolean(record.completed),
    updatedAt: iso(record.updatedAt),
    deletedAt: null,
  };
}

function captureLocalChanges(userId: string, journal = loadJournal(userId)) {
  const now = new Date().toISOString();
  const currentLibrary = currentLibraryMap();
  currentLibrary.forEach((item, animeId) => {
    const previous = journal.library[animeId];
    if (!previous || previous.deletedAt || librarySignature(previous) !== librarySignature(item)) {
      journal.library[animeId] = { ...item, updatedAt: now, deletedAt: null };
    }
  });
  Object.values(journal.library).forEach((previous) => {
    if (!previous.deletedAt && !currentLibrary.has(previous.animeId)) {
      journal.library[previous.animeId] = {
        ...previous,
        bookmarked: false,
        liked: false,
        updatedAt: now,
        deletedAt: now,
      };
    }
  });

  // History uses the native transactional outbox. Absence from a UI projection
  // is never evidence of a user deletion.
  saveJournal(userId, journal);
  return journal;
}

function mergeByKey<T extends { updatedAt: string }>(
  local: Record<string, T>,
  remote: T[],
  keyFor: (item: T) => string,
) {
  const merged = { ...local };
  remote.forEach((item) => {
    const key = keyFor(item);
    const winner = selectNewestAccountRecord(merged[key], item);
    if (winner) {
      const old=merged[key] as any, next=item as any;
      if(!(winner as any).deletedAt && old && !old.deletedAt && !next.deletedAt && (old.watchedCoverage || next.watchedCoverage)) {
        const duration=next.durationSeconds || old.durationSeconds || 0;
        const coverage=mergeCoverage(old.watchedCoverage,next.watchedCoverage,duration,old.watchedCoverage?0:old.positionSeconds || 0);
        merged[key]={...winner,watchedCoverage:coverage,positionSeconds:coverage.furthest,watchedPercent:coveragePercent(coverage,duration),completed:coveragePercent(coverage,duration)>=92};
      } else merged[key]=winner;
    }
  });
  return merged;
}

function applyLibraryToStore(library: AccountLibraryItem[]) {
  const active = library.filter((item) => !item.deletedAt && (item.bookmarked || item.liked));
  useStore.setState({
    myList: active.filter((item) => item.bookmarked).map((item) => item.anime),
    likedAnimes: active.filter((item) => item.liked).map((item) => item.anime),
    likes: active.filter((item) => item.liked).map((item) => item.animeId),
  });
}

function applyWatchHistory(items: AccountWatchHistoryItem[]) {
  const records: DesktopWatchProgressRecord[] = items
    .filter((item) => !item.deletedAt && item.animeTitle && item.episode != null)
    .map((item) => ({
      animeId: item.animeId || item.animeTitle || '',
      title: item.animeTitle || '',
      poster: item.poster,
      episode: item.episode || 1,
      watchedCoverage:item.watchedCoverage,
      positionSeconds: item.positionSeconds,
      durationSeconds: item.durationSeconds,
      progressPercent: item.watchedPercent,
      updatedAt: timestamp(item.updatedAt),
      completed: item.completed,
    }));
  replaceDesktopWatchProgress(records);
}

function DesktopAccountSyncProvider({ children }: { children: React.ReactNode }) {
  const { session, user, loading } = useAuth();
  const [state, setState] = useState<AccountSyncState>('idle');
  const [message, setMessage] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const initialSyncedRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const userId = session ? session.user?.id || user?.id || '' : '';
  const identity = `${userId}:${session?.access_token || ''}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const epochRef = useRef({ identity, value: 0 });
  if (epochRef.current.identity !== identity) epochRef.current = { identity, value: epochRef.current.value + 1 };
  const epoch = epochRef.current.value;
  const flight = useRef<{ identity: string; epoch: number; promise: Promise<void> } | null>(null);
  const resync = useRef(false);
  const projectionReady = useRef(false);
  const [preparedOwner,setPreparedOwner]=useState<string|null>(null);

  // The visible library is a projection, never an implicit transfer between
  // accounts. Retain each outgoing projection in its existing journal.
  useEffect(() => {
    if (loading) return;
    projectionReady.current = false;
    currentIdentity.current = identity;
    const owner = userId || GUEST_OWNER;
    let cancelled=false;setPreparedOwner(null);
    try {
      const preparation=ensureHistoryArchive(userId);
      const previous = localStorage.getItem(PROJECTION_OWNER_KEY);
      if (previous && previous !== owner) {
        captureLocalChanges(previous);
        const journal = loadJournal(owner);
        applyingRemoteRef.current = true;
        try {
          applyLibraryToStore(Object.values(journal.library));
        } finally { applyingRemoteRef.current = false; }
      }
      localStorage.setItem(PROJECTION_OWNER_KEY, owner);
      resync.current = false;
      void preparation.then(()=>{
        if(cancelled || currentIdentity.current!==identity)return;
        projectionReady.current=true;
        const journal=loadJournal(owner);journal.watchHistory={};saveJournal(owner,journal);
        setPreparedOwner(owner);
      }).catch(error=>{
        if(cancelled)return;
        setState('unavailable');setMessage(error instanceof Error?error.message:'Local history could not be opened.');
      });
    } catch {
      currentIdentity.current = '';
      setState('unavailable');
      setMessage('Account data could not be saved locally. Free some storage and restart before syncing.');
    }
    return () => { cancelled=true;currentIdentity.current = ''; };
  }, [userId, loading, identity]);

  const syncNow = useCallback((): Promise<void> => {
    const isCurrent = () => projectionReady.current && currentIdentity.current === identity && epochRef.current.value === epoch;
    if (!isCurrent()) return Promise.resolve();
    if (flight.current?.identity === identity && flight.current.epoch === epoch) {
      resync.current = true;
      return flight.current.promise;
    }
    const run = async () => {
    if (loading || !session?.access_token || !userId) return;
    setState('syncing');
    setMessage('Syncing profile, library, favorites, and watch progress...');
    initialSyncedRef.current = false;
    try {
      captureLocalChanges(userId);
      const remote = await fetchAccountSync(session,false);
      if (!isCurrent()) return;
      // Capture again after I/O: edits, removals and backward seeks made while
      // fetching are newer than the pre-request snapshot.
      const local = captureLocalChanges(userId);
      const merged: SyncJournal = {
        library: mergeByKey(local.library, remote.library, (item) => item.animeId),
        watchHistory: {},
      };
      // Persist first so a quota failure never replaces unsaved local data.
      saveJournal(userId, merged);
      applyingRemoteRef.current = true;
      applyLibraryToStore(Object.values(merged.library));
      applyingRemoteRef.current = false;
      await replaceAccountSyncData(session, {
        library: Object.values(merged.library).filter(item=>!remote.library.some(r=>r.animeId===item.animeId && timestamp(r.updatedAt)>=timestamp(item.updatedAt))),
      });
      if(!isCurrent())return;
      await syncDesktopHistory(session,isCurrent);
      if (!isCurrent()) return;
      initialSyncedRef.current = true;
      setState('synced');
      setMessage(user?.email
        ? `Signed in as ${user.email}. Core account data is synced.`
        : 'Core account data is synced.');
      setLastSyncedAt(Date.now());
    } catch (error) {
      if (!isCurrent()) return;
      applyingRemoteRef.current = false;
      initialSyncedRef.current = true;
      setState('unavailable');
      setMessage(error instanceof Error ? error.message : 'Local changes are saved and will retry.');
    }
    };
    const promise = run().finally(() => {
      if (flight.current?.promise !== promise) return;
      flight.current = null;
      if (isCurrent() && resync.current) {
        resync.current = false;
        void syncNow();
      }
    });
    flight.current = { identity, epoch, promise };
    return promise;
  }, [epoch, identity, loading, session, user?.email, userId,preparedOwner]);

  const schedulePush = useCallback((delay=60_000) => {
    if (!projectionReady.current || currentIdentity.current !== identity || !session?.access_token || !userId || applyingRemoteRef.current) return;
    try { captureLocalChanges(userId); }
    catch {
      setState('unavailable');
      setMessage('Local changes could not be saved. Check available storage before closing the app.');
      return;
    }
    if (pushTimerRef.current) return;
    pushTimerRef.current = window.setTimeout(() => { pushTimerRef.current=null;void syncNow(); }, delay);
  }, [identity, syncNow, session?.access_token, userId]);

  useEffect(() => {
    if (!session?.access_token || !userId) {
      initialSyncedRef.current = false;
      setState('idle');
      setMessage('');
      setLastSyncedAt(null);
      return;
    }
    void syncNow();
  }, [session?.access_token, syncNow, userId]);

  useEffect(() => {
    if (!session?.access_token || !userId) return undefined;
    const unsubscribeStore = useStore.subscribe(() => schedulePush(900));
    const unsubscribeProgress = subscribeDesktopWatchProgress(() => schedulePush());
    const retryOnline = () => void syncNow();
    window.addEventListener('online', retryOnline);
    window.addEventListener('streamnyaa:history-sync-now',retryOnline);
    return () => {
      unsubscribeStore();
      unsubscribeProgress();
      window.removeEventListener('online', retryOnline);
      window.removeEventListener('streamnyaa:history-sync-now',retryOnline);
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    };
  }, [schedulePush, session?.access_token, syncNow, userId]);
  useEffect(()=>{
    if(state!=='unavailable' || !session?.access_token || !userId)return;
    const timer=window.setTimeout(()=>{void syncNow();},60_000);return()=>window.clearTimeout(timer);
  },[state,session?.access_token,userId,syncNow]);

  const value = useMemo<AccountSyncContextValue>(() => ({ state, message, lastSyncedAt, syncNow }), [lastSyncedAt, message, state, syncNow]);
  return <AccountSyncContext.Provider value={value}>{children}</AccountSyncContext.Provider>;
}

export function useAccountSync() {
  const value = useContext(AccountSyncContext);
  if (!value) throw new Error('useAccountSync must be used inside AccountSyncProvider');
  return value;
}

export function AccountSyncProvider({ children }: { children: React.ReactNode }) {
  const Provider = isDesktopApp() ? DesktopAccountSyncProvider : WebAccountSyncProvider;
  return <Provider>{children}</Provider>;
}
