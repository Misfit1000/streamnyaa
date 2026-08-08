import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import type { AccountUser, AuthSession } from '../types';
import { useAppStore } from '../store/useAppStore';
import {
  fetchAccountUser,
  loadSession,
  refreshAuthSession,
  sessionFromAuthUrl,
  signInWithGoogle,
  signInWithPassword,
  signOut as signOutService,
  signUpWithPassword,
} from '../services/auth';
import { fetchAccountSync, mergeHistory, mergeLibrary, pushAccountSync } from '../services/accountSync';
import { mergeSyncedPreferences, normalizeSyncedPreferences } from '../../../shared/preferences';
import { accountPayloadFingerprint, accountSyncDelayMs } from '../lib/accountSyncPolicy';

type SyncState = 'idle' | 'syncing' | 'synced' | 'offline';

type AuthValue = {
  session: AuthSession | null;
  user: AccountUser | null;
  loading: boolean;
  error: string;
  syncState: SyncState;
  lastSyncedAt: number | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function preferencesFromStore() {
  const state = useAppStore.getState();
  return normalizeSyncedPreferences({
    updatedAt: state.preferencesUpdatedAt,
    audioPreference: state.audioPreference,
    autoOpenBestSource: state.autoOpenBestSource,
    playerPreferences: state.playerPreferences,
  });
}

function payloadFromStore() {
  const state = useAppStore.getState();
  return { library: state.library, watchHistory: state.history, preferences: preferencesFromStore() };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushInFlight = useRef<Promise<void> | null>(null);
  const pushQueued = useRef(false);
  const syncInFlight = useRef<Promise<void> | null>(null);
  const lastPushedFingerprint = useRef('');
  const initialSyncDone = useRef(false);

  const applySession = useCallback(async (next: AuthSession | null) => {
    setSession(next);
    if (!next?.access_token) { setUser(null); return; }
    const account = await fetchAccountUser(next);
    setUser(account);
  }, []);

  const pushLatest = useCallback(async () => {
    if (!session?.access_token || !initialSyncDone.current) return;
    if (pushInFlight.current) {
      pushQueued.current = true;
      return pushInFlight.current;
    }
    const task = (async () => {
      do {
        pushQueued.current = false;
        const payload = payloadFromStore();
        const fingerprint = accountPayloadFingerprint(payload);
        if (fingerprint === lastPushedFingerprint.current) continue;
        await pushAccountSync(session, payload);
        lastPushedFingerprint.current = fingerprint;
        setSyncState('synced');
        setLastSyncedAt(Date.now());
      } while (pushQueued.current);
    })()
      .catch((syncError) => {
        setSyncState('offline');
        throw syncError;
      })
      .finally(() => { pushInFlight.current = null; });
    pushInFlight.current = task;
    return task;
  }, [session]);

  const schedulePush = useCallback((delayMs: number, urgent: boolean) => {
    if (!session?.access_token || !initialSyncDone.current) return;
    if (pushTimer.current) {
      if (!urgent) return;
      clearTimeout(pushTimer.current);
    }
    pushTimer.current = setTimeout(() => {
      pushTimer.current = null;
      void pushLatest().catch(() => undefined);
    }, delayMs);
  }, [pushLatest, session?.access_token]);

  const syncNow = useCallback(async () => {
    if (!session?.access_token) return;
    if (syncInFlight.current) return syncInFlight.current;
    const task = (async () => {
      if (pushTimer.current) { clearTimeout(pushTimer.current); pushTimer.current = null; }
      setSyncState('syncing');
      try {
        const remote = await fetchAccountSync(session);
        const current = useAppStore.getState();
        const library = mergeLibrary(current.library, remote.library);
        const history = mergeHistory(current.history, remote.watchHistory);
        const preferences = mergeSyncedPreferences(preferencesFromStore(), remote.preferences);
        current.replaceLibrary(library);
        current.replaceHistory(history);
        current.replaceSyncedPreferences(preferences);
        const payload = { library, watchHistory: history, preferences };
        await pushAccountSync(session, payload);
        lastPushedFingerprint.current = accountPayloadFingerprint(payload);
        initialSyncDone.current = true;
        setSyncState('synced');
        setError('');
        setLastSyncedAt(Date.now());
      } catch (syncError) {
        setSyncState('offline');
        setError(syncError instanceof Error ? syncError.message : 'Account sync is unavailable.');
      }
    })().finally(() => { syncInFlight.current = null; });
    syncInFlight.current = task;
    return task;
  }, [session]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const callbackSession = await sessionFromAuthUrl(await Linking.getInitialURL());
        let stored = callbackSession || await loadSession();
        if (!active) return;
        setLoading(false);
        if (!stored?.access_token) {
          setSession(null);
          setUser(null);
          return;
        }
        if (stored?.expires_at && stored.expires_at < Math.floor(Date.now() / 1000) + 60) {
          stored = await refreshAuthSession(stored);
        }
        if (!active) return;
        setSession(stored);
        setUser(stored.user || null);
        void fetchAccountUser(stored)
          .then((account) => { if (active) setUser(account); })
          .catch((bootError) => { if (active) setError(bootError instanceof Error ? bootError.message : 'Account details are temporarily unavailable.'); });
      } catch (bootError) {
        if (active) setError(bootError instanceof Error ? bootError.message : 'Sign-in could not be restored.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [applySession]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void sessionFromAuthUrl(url)
        .then((next) => next && applySession(next))
        .catch((authError) => setError(authError instanceof Error ? authError.message : 'Sign-in could not be completed.'));
    });
    return () => subscription.remove();
  }, [applySession]);

  useEffect(() => {
    initialSyncDone.current = false;
    lastPushedFingerprint.current = '';
    if (session?.access_token) void syncNow();
    else setSyncState('idle');
  }, [session?.access_token, syncNow]);

  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (!session?.access_token || !initialSyncDone.current) return;
      const libraryChanged = state.library !== previous.library;
      const historyChanged = state.history !== previous.history;
      const preferencesChanged = state.preferencesUpdatedAt !== previous.preferencesUpdatedAt;
      if (!libraryChanged && !historyChanged && !preferencesChanged) return;
      const urgent = libraryChanged || preferencesChanged;
      schedulePush(accountSyncDelayMs({ libraryChanged, preferencesChanged, batterySaver: state.resourcePolicy.batterySaver }), urgent);
    });
    return () => {
      unsubscribe();
      if (pushTimer.current) { clearTimeout(pushTimer.current); pushTimer.current = null; }
    };
  }, [schedulePush, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' || !initialSyncDone.current) return;
      if (pushTimer.current) { clearTimeout(pushTimer.current); pushTimer.current = null; }
      void pushLatest().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [pushLatest, session?.access_token]);

  const value = useMemo<AuthValue>(() => ({
    session, user, loading, error, syncState, lastSyncedAt,
    signIn: async (email, password) => { setError(''); await applySession(await signInWithPassword(email, password)); },
    signUp: async (email, password) => {
      setError('');
      const next = await signUpWithPassword(email, password);
      if (next.access_token) await applySession(next);
    },
    signInGoogle: async () => { setError(''); await applySession(await signInWithGoogle()); },
    signOut: async () => {
      await pushLatest().catch(() => undefined);
      await signOutService(session);
      initialSyncDone.current = false;
      await applySession(null);
    },
    syncNow,
  }), [applySession, error, lastSyncedAt, loading, pushLatest, session, syncNow, syncState, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
