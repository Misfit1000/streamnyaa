import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { AccountUser, AuthSession } from '../types';
import { useAppStore } from '../store/useAppStore';
import {
  fetchAccountUser,
  loadSession,
  refreshAuthSession,
  signInWithGoogle,
  signInWithPassword,
  signOut as signOutService,
  signUpWithPassword,
} from '../services/auth';
import { fetchAccountSync, mergeHistory, mergeLibrary, pushAccountSync } from '../services/accountSync';
import { mergeSyncedPreferences, normalizeSyncedPreferences } from '../../../shared/preferences';

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

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialSyncDone = useRef(false);

  const applySession = useCallback(async (next: AuthSession | null) => {
    setSession(next);
    if (!next?.access_token) { setUser(null); return; }
    const account = await fetchAccountUser(next);
    setUser(account);
  }, []);

  const syncNow = useCallback(async () => {
    if (!session?.access_token) return;
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
      await pushAccountSync(session, { library, watchHistory: history, preferences });
      initialSyncDone.current = true;
      setSyncState('synced');
      setLastSyncedAt(Date.now());
    } catch (syncError) {
      setSyncState('offline');
      setError(syncError instanceof Error ? syncError.message : 'Account sync is unavailable.');
    }
  }, [session]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let stored = await loadSession();
        if (stored?.expires_at && stored.expires_at < Math.floor(Date.now() / 1000) + 60) {
          stored = await refreshAuthSession(stored);
        }
        if (active) await applySession(stored);
      } catch (bootError) {
        if (active) setError(bootError instanceof Error ? bootError.message : 'Sign-in could not be restored.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [applySession]);

  useEffect(() => {
    initialSyncDone.current = false;
    if (session?.access_token) void syncNow();
    else setSyncState('idle');
  }, [session?.access_token, syncNow]);

  useEffect(() => useAppStore.subscribe((state, previous) => {
    if (!session?.access_token || !initialSyncDone.current) return;
    if (
      state.library === previous.library
      && state.history === previous.history
      && state.preferencesUpdatedAt === previous.preferencesUpdatedAt
    ) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const latest = useAppStore.getState();
      void pushAccountSync(session, { library: latest.library, watchHistory: latest.history, preferences: preferencesFromStore() })
        .then(() => { setSyncState('synced'); setLastSyncedAt(Date.now()); })
        .catch(() => setSyncState('offline'));
    }, 1000);
  }), [session]);

  const value = useMemo<AuthValue>(() => ({
    session, user, loading, error, syncState, lastSyncedAt,
    signIn: async (email, password) => { setError(''); await applySession(await signInWithPassword(email, password)); },
    signUp: async (email, password) => {
      setError('');
      const next = await signUpWithPassword(email, password);
      if (next.access_token) await applySession(next);
    },
    signInGoogle: async () => { setError(''); await applySession(await signInWithGoogle()); },
    signOut: async () => { await signOutService(session); initialSyncDone.current = false; await applySession(null); },
    syncNow,
  }), [applySession, error, lastSyncedAt, loading, session, syncNow, syncState, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
