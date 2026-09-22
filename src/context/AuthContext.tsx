import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuthSession,
  AuthUser,
  RecoveryState,
  createGoogleOAuthUrl,
  fetchAccount,
  fetchSessionUser,
  loadStoredSession,
  normalizeOAuthSessionFromHash,
  parseDesktopAuthCallback,
  refreshSession,
  requestPasswordReset,
  revokeRecoverySession,
  signInWithGoogle,
  signInWithPassword,
  signOutSession,
  signUpWithPassword,
  storeSession,
  updatePassword,
} from '../lib/supabaseAuth';
import {
  beginDesktopGoogleOAuth,
  isDesktopApp,
  listenDesktopOAuthCallback,
} from '../lib/desktop';

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  error: string;
  desktopRoute: string;
  recoveryAccessToken: string;
  recoveryState: RecoveryState;
  recoveryError: string;
  clearDesktopRoute: () => void;
  clearRecovery: () => void;
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
  const [desktopRoute, setDesktopRoute] = useState('');
  const [recoveryAccessToken, setRecoveryAccessToken] = useState('');
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('idle');
  const [recoveryError, setRecoveryError] = useState('');

  const accountRevision = useRef(0);
  const applySession = async (nextSession: AuthSession | null, allowRefresh = true) => {
    const revision = ++accountRevision.current;
    setIsAdmin(false);
    setSession(nextSession);
    if (!nextSession?.access_token) {
      setUser(null);
      setIsAdmin(false);
      return;
    }

    try {
      const account = await fetchAccount(nextSession);
      if (revision !== accountRevision.current) return;
      setUser(account.user);
      setIsAdmin(Boolean(account.isAdmin));
    } catch (accountError: any) {
      if (revision !== accountRevision.current) return;
      if (allowRefresh && nextSession.refresh_token && accountError?.status === 401) {
        const refreshedSession = await refreshSession(nextSession);
        if (revision !== accountRevision.current) return;
        setSession(refreshedSession);
        const account = await fetchAccount(refreshedSession);
        if (revision !== accountRevision.current) return;
        setUser(account.user);
        setIsAdmin(Boolean(account.isAdmin));
        return;
      }
      if (isRecoverableAccountLookupError(accountError)) {
        const fallbackUser = nextSession.user || await fetchSessionUser(nextSession);
        if (revision !== accountRevision.current) return;
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

  useEffect(() => {
    if (!isDesktopApp()) return undefined;

    let active = true;
    let dispose = () => {};

    listenDesktopOAuthCallback(async (payload) => {
      if (!active) return;
      try {
        if (payload.error) throw new Error(payload.error);
        const callback = parseDesktopAuthCallback(String(payload.url || ''));
        if (callback.action === 'recovery' && callback.error) {
          setRecoveryAccessToken('');
          setRecoveryState('expired');
          setRecoveryError(callback.error);
          setDesktopRoute('/reset-password');
          return;
        }
        if (callback.error) throw new Error(callback.error);
        const nextSession = callback.session;
        if (!nextSession?.access_token) {
          throw new Error(callback.action === 'recovery'
            ? 'This password reset link is missing or expired.'
            : 'Authentication did not return a valid desktop session.');
        }

        setError('');
        if (callback.action === 'recovery') {
          const now = Math.floor(Date.now() / 1000);
          if (nextSession.expires_at && nextSession.expires_at <= now) {
            setRecoveryAccessToken('');
            setRecoveryState('expired');
            setRecoveryError('This password reset link has expired. Request a new link and try again.');
            setDesktopRoute('/reset-password');
            return;
          }
          setRecoveryAccessToken(nextSession.access_token);
          setRecoveryState('ready');
          setRecoveryError('');
          setDesktopRoute('/reset-password');
        } else {
          setLoading(true);
          storeSession(nextSession);
          await applySession(nextSession);
          setDesktopRoute(callback.next);
        }
      } catch (authError) {
        if (!active) return;
        const message = authError instanceof Error ? authError.message : 'Desktop authentication failed.';
        if (String(payload.action || '').toLowerCase() === 'recovery') {
          setRecoveryAccessToken('');
          setRecoveryState(/expired|missing|invalid/i.test(message) ? 'expired' : 'error');
          setRecoveryError(message);
          setDesktopRoute('/reset-password');
        } else {
          setError(message);
          setDesktopRoute('/login');
        }
      } finally {
        if (active) setLoading(false);
      }
    }).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    }).catch((listenError) => {
      if (active) setError(listenError instanceof Error ? listenError.message : 'Desktop sign-in could not start.');
    });

    return () => {
      active = false;
      dispose();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user,
    isAdmin,
    loading,
    error,
    desktopRoute,
    recoveryAccessToken,
    recoveryState,
    recoveryError,
    clearDesktopRoute: () => setDesktopRoute(''),
    clearRecovery: () => {
      setRecoveryAccessToken('');
      setRecoveryState('idle');
      setRecoveryError('');
    },
    signIn: async (email, password) => {
      setError('');
      const nextSession = await signInWithPassword(email, password);
      await applySession(nextSession);
    },
    signInGoogle: async (redirectPath) => {
      setError('');
      if (isDesktopApp()) {
        const authorizeUrl = await createGoogleOAuthUrl(redirectPath, true);
        await beginDesktopGoogleOAuth(authorizeUrl);
        return;
      }
      await signInWithGoogle(redirectPath);
    },
    signUp: async (email, password) => {
      setError('');
      const nextSession = await signUpWithPassword(email, password);
      if (nextSession.access_token) await applySession(nextSession);
    },
    sendPasswordReset: async (email) => {
      setError('');
      setRecoveryAccessToken('');
      setRecoveryState('idle');
      setRecoveryError('');
      await requestPasswordReset(email);
    },
    resetPassword: async (accessToken, password) => {
      setError('');
      setRecoveryState('submitting');
      try {
        await updatePassword(accessToken, password);
        if (isDesktopApp()) await revokeRecoverySession(accessToken);
        storeSession(null);
        setRecoveryAccessToken('');
        setRecoveryState('idle');
        setRecoveryError('');
        await applySession(null, false);
      } catch (resetError) {
        const message = resetError instanceof Error ? resetError.message : 'Password could not be updated.';
        setRecoveryState(/expired|invalid|unauthorized|jwt/i.test(message) ? 'expired' : 'error');
        setRecoveryError(message);
        throw resetError;
      }
    },
    signOut: async () => {
      const previous = session;
      await applySession(null, false);
      await signOutSession(previous);
    },
    refreshAccount,
  }), [session, user, isAdmin, loading, error, desktopRoute, recoveryAccessToken, recoveryState, recoveryError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
