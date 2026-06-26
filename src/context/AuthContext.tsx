import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  AuthSession,
  AuthUser,
  fetchAccount,
  fetchSessionUser,
  loadStoredSession,
  normalizeOAuthSessionFromHash,
  refreshSession,
  requestPasswordReset,
  signInWithGoogle,
  signInWithPassword,
  signOutSession,
  signUpWithPassword,
  storeSession,
  updatePassword,
} from '../lib/supabaseAuth';

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  error: string;
  signIn: (email: string, password: string) => Promise<void>;
  signInGoogle: (redirectPath?: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resetPassword: (accessToken: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isRecoverableAccountLookupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /Could not reach StreamNyaa login services|Failed to fetch|NetworkError|Account status could not be checked/i.test(message);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const applySession = async (nextSession: AuthSession | null, allowRefresh = true) => {
    setSession(nextSession);
    if (!nextSession?.access_token) {
      setUser(null);
      setIsAdmin(false);
      return;
    }

    try {
      const account = await fetchAccount(nextSession);
      setUser(account.user);
      setIsAdmin(Boolean(account.isAdmin));
    } catch (accountError: any) {
      if (allowRefresh && nextSession.refresh_token && accountError?.status === 401) {
        const refreshedSession = await refreshSession(nextSession);
        setSession(refreshedSession);
        const account = await fetchAccount(refreshedSession);
        setUser(account.user);
        setIsAdmin(Boolean(account.isAdmin));
        return;
      }
      if (isRecoverableAccountLookupError(accountError)) {
        const fallbackUser = nextSession.user || await fetchSessionUser(nextSession);
        setUser(fallbackUser);
        setIsAdmin(false);
        return;
      }
      throw accountError;
    }
  };

  const refreshAccount = async () => {
    if (!session) return;
    await applySession(session);
  };

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const oauthSession = normalizeOAuthSessionFromHash(window.location.hash);
      const stored = oauthSession || loadStoredSession();
      try {
        if (!stored?.access_token) return;
        const now = Math.floor(Date.now() / 1000);
        const usableSession = stored.expires_at && stored.expires_at < now + 60
          ? await refreshSession(stored)
          : stored;
        if (oauthSession) {
          storeSession(usableSession);
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        if (mounted) await applySession(usableSession);
      } catch (authError) {
        storeSession(null);
        if (mounted) {
          setError(authError instanceof Error ? authError.message : 'Please sign in again.');
          setUser(null);
          setIsAdmin(false);
          setSession(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    boot();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user,
    isAdmin,
    loading,
    error,
    signIn: async (email, password) => {
      setError('');
      const nextSession = await signInWithPassword(email, password);
      await applySession(nextSession);
    },
    signInGoogle: async (redirectPath) => {
      setError('');
      await signInWithGoogle(redirectPath);
    },
    signUp: async (email, password) => {
      setError('');
      const nextSession = await signUpWithPassword(email, password);
      if (nextSession.access_token) await applySession(nextSession);
    },
    sendPasswordReset: async (email) => {
      setError('');
      await requestPasswordReset(email);
    },
    resetPassword: async (accessToken, password) => {
      setError('');
      await updatePassword(accessToken, password);
      storeSession(null);
      await applySession(null, false);
    },
    signOut: async () => {
      await signOutSession(session);
      await applySession(null, false);
    },
    refreshAccount,
  }), [session, user, isAdmin, loading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
