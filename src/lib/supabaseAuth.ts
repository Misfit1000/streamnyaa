import { accountApiFetch, accountApiUrl } from './accountApi';

const STORAGE_KEY = 'streamnyaa.auth.session';
const FALLBACK_SUPABASE_URL = 'https://opteiijnvuwstpdjxwlk.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_oHAwXtg1wXcPybVYfLBUuQ_GiYz3Fxv';
const DESKTOP_AUTH_CALLBACK_ORIGIN = 'streamnyaa://auth/callback';
const NATIVE_AUTH_RELAY_URL = 'https://www.streamnyaa.xyz/api/auth/native-callback';

export type DesktopAuthAction = 'login' | 'recovery' | 'confirmation';

export interface AuthUser {
  id: string;
  email: string;
  created_at?: string;
  last_sign_in_at?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user?: AuthUser;
}

export interface AuthConfig {
  supabaseUrl: string;
  publishableKey: string;
}

let cachedConfig: AuthConfig | null = null;

type RuntimeEnv = Partial<Record<string, string>>;

function runtimeEnv(): RuntimeEnv {
  return ((import.meta as unknown as { env?: RuntimeEnv }).env) || {};
}

function isDesktopRuntime() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.__STREAMNYAA_DESKTOP__ || window.__TAURI__ || window.__TAURI_INTERNALS__);
}

function cleanSupabaseUrl(value?: string) {
  return String(value || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
}

function envAuthConfig(): AuthConfig | null {
  const env = runtimeEnv();
  const supabaseUrl = cleanSupabaseUrl(
    env.VITE_SUPABASE_URL
      || env.VITE_PUBLIC_SUPABASE_URL
      || env.VITE_SUPABASE_PROJECT_URL,
  );
  const publishableKey = String(
    env.VITE_SUPABASE_ANON_KEY
      || env.VITE_SUPABASE_PUBLISHABLE_KEY
      || env.VITE_PUBLIC_SUPABASE_ANON_KEY
      || '',
  ).trim();

  return supabaseUrl && publishableKey ? { supabaseUrl, publishableKey } : null;
}

function hostedFallbackConfig(): AuthConfig {
  return {
    supabaseUrl: FALLBACK_SUPABASE_URL,
    publishableKey: FALLBACK_SUPABASE_PUBLISHABLE_KEY,
  };
}

function normalizeAuthNetworkError(error: unknown) {
  if (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(String((error as any)?.message || error))) {
    return new Error('Could not reach StreamNyaa login services. Check your connection and try again.');
  }
  return error instanceof Error ? error : new Error('Authentication request failed.');
}

export async function getAuthConfig() {
  if (cachedConfig) return cachedConfig;

  const directConfig = envAuthConfig();
  if (directConfig) {
    cachedConfig = directConfig;
    return cachedConfig;
  }

  try {
    const response = await accountApiFetch('/api/auth/config');
    if (!response.ok) throw new Error('Login is not configured yet.');
    const data = await response.json();
    const supabaseUrl = cleanSupabaseUrl(data?.supabaseUrl);
    const publishableKey = String(data?.publishableKey || '').trim();
    if (!supabaseUrl || !publishableKey) throw new Error('Login is not configured yet.');
    cachedConfig = { supabaseUrl, publishableKey };
  } catch {
    cachedConfig = hostedFallbackConfig();
  }

  return cachedConfig!;
}

async function authFetch(path: string, options: RequestInit = {}) {
  const config = await getAuthConfig();
  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.publishableKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw normalizeAuthNetworkError(error);
  }

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(data?.msg || data?.message || 'Authentication request failed.');
    (error as any).status = response.status;
    (error as any).code = data?.error_code || data?.code || undefined;
    throw error;
  }

  return data;
}

export function loadStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeSession(session: AuthSession | null) {
  if (!session) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function normalizeSession(data: any): AuthSession {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || (data.expires_in ? Math.floor(Date.now() / 1000) + Number(data.expires_in) : undefined),
    user: data.user,
  };
}

export function safeAuthRedirectPath(path = '/login') {
  const normalized = String(path || '/login').trim();
  if (!normalized.startsWith('/') || normalized.startsWith('//') || /[\r\n]/.test(normalized)) return '/login';
  return normalized;
}

function currentRuntimeOrigin() {
  return typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin.replace(/\/+$/, '')
    : '';
}

function siteRedirectUrl(path = '/login') {
  const safePath = safeAuthRedirectPath(path);
  if (isDesktopRuntime()) {
    const desktopOrigin = currentRuntimeOrigin();
    if (desktopOrigin) return `${desktopOrigin}${safePath}`;
  }

  const env = runtimeEnv();
  const configuredOrigin = String(
    env.VITE_AUTH_REDIRECT_ORIGIN
      || env.VITE_APP_URL
      || env.VITE_PUBLIC_APP_URL
      || '',
  ).trim().replace(/\/+$/, '');
  const origin = configuredOrigin || currentRuntimeOrigin() || 'https://www.streamnyaa.xyz';
  return `${origin}${safePath}`;
}

export type RecoverySession = AuthSession & {
  access_token: string;
};

export type RecoveryState = 'idle' | 'ready' | 'submitting' | 'expired' | 'error';

export function desktopAuthRedirectUrl(action: DesktopAuthAction, next = '/profile') {
  const params = new URLSearchParams({ action, next: safeAuthRedirectPath(next) });
  return `${DESKTOP_AUTH_CALLBACK_ORIGIN}?${params.toString()}`;
}

export function nativeRecoveryRedirectUrl(platform: 'desktop' | 'android') {
  const params = new URLSearchParams({ platform, action: 'recovery' });
  return `${NATIVE_AUTH_RELAY_URL}?${params.toString()}`;
}

export function normalizeOAuthSessionFromHash(hash: string): AuthSession | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  if (!accessToken) return null;

  return {
    access_token: accessToken,
    refresh_token: params.get('refresh_token') || undefined,
    expires_at: params.get('expires_at')
      ? Number(params.get('expires_at'))
      : params.get('expires_in')
        ? Math.floor(Date.now() / 1000) + Number(params.get('expires_in'))
        : undefined,
  };
}

function callbackParams(url: URL) {
  const params = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  fragment.forEach((value, key) => params.set(key, value));
  return params;
}

function normalizeOAuthSessionFromCallback(url: URL): AuthSession | null {
  const params = callbackParams(url);
  const accessToken = params.get('access_token');
  if (!accessToken) return null;
  return {
    access_token: accessToken,
    refresh_token: params.get('refresh_token') || undefined,
    expires_at: params.get('expires_at')
      ? Number(params.get('expires_at'))
      : params.get('expires_in')
        ? Math.floor(Date.now() / 1000) + Number(params.get('expires_in'))
        : undefined,
  };
}

export type DesktopAuthCallback = {
  action: DesktopAuthAction;
  next: string;
  session: AuthSession | null;
  error: string;
};

function callbackParam(url: URL, name: string) {
  return callbackParams(url).get(name) || '';
}

export function parseDesktopAuthCallback(value: string): DesktopAuthCallback {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The desktop authentication callback is invalid.');
  }
  if (url.protocol !== 'streamnyaa:' || url.hostname !== 'auth' || url.pathname !== '/callback') {
    throw new Error('The desktop authentication callback was rejected.');
  }
  const rawAction = url.searchParams.get('action');
  if (rawAction !== 'login' && rawAction !== 'recovery' && rawAction !== 'confirmation') {
    throw new Error('The desktop authentication action was rejected.');
  }
  const defaultRoute = rawAction === 'login' ? '/profile' : '/login';
  const session = normalizeOAuthSessionFromCallback(url);
  const callbackType = callbackParam(url, 'type');
  if (rawAction === 'recovery' && session?.access_token && callbackType !== 'recovery') {
    throw new Error('The desktop password recovery session was rejected.');
  }
  return {
    action: rawAction,
    next: safeAuthRedirectPath(url.searchParams.get('next') || defaultRoute),
    session,
    error: callbackParam(url, 'error_description') || callbackParam(url, 'error'),
  };
}

export async function createGoogleOAuthUrl(redirectPath = '/login', desktopCallback = false) {
  const config = await getAuthConfig();
  const redirectTo = desktopCallback
    ? desktopAuthRedirectUrl('login', redirectPath)
    : siteRedirectUrl(redirectPath);
  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: redirectTo,
  });
  if (desktopCallback) params.set('prompt', 'select_account');
  return `${config.supabaseUrl}/auth/v1/authorize?${params.toString()}`;
}

export async function signInWithPassword(email: string, password: string) {
  const data = await authFetch('token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const session = normalizeSession(data);
  storeSession(session);
  return session;
}

export async function signInWithGoogle(redirectPath = '/login') {
  window.location.href = await createGoogleOAuthUrl(redirectPath);
}

export async function signUpWithPassword(email: string, password: string) {
  const redirectTo = isDesktopRuntime()
    ? desktopAuthRedirectUrl('confirmation', '/login')
    : siteRedirectUrl('/login');
  const data = await authFetch(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (data.access_token) {
    const session = normalizeSession(data);
    storeSession(session);
    return session;
  }

  return { user: data.user } as AuthSession;
}

export async function requestPasswordReset(email: string) {
  const redirectTo = isDesktopRuntime()
    ? nativeRecoveryRedirectUrl('desktop')
    : siteRedirectUrl('/reset-password');
  await authFetch(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function updatePassword(accessToken: string, password: string) {
  if (!accessToken) throw new Error('Password reset link is missing or expired.');
  await authFetch('user', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
}

export async function revokeRecoverySession(accessToken: string) {
  if (!accessToken) return;
  try {
    await authFetch('logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // The password update may already have invalidated this short-lived session.
  }
}

export async function fetchSessionUser(session: AuthSession) {
  const data = await authFetch('user', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const user = data?.user || data;
  if (!user?.id) throw new Error('Your account profile could not be loaded.');
  return user as AuthUser;
}

export async function refreshSession(session: AuthSession) {
  if (!session.refresh_token) return session;
  const data = await authFetch('token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const nextSession = normalizeSession(data);
  storeSession(nextSession);
  return nextSession;
}

export async function signOutSession(session: AuthSession | null) {
  if (session?.access_token) {
    try {
      await authFetch('logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    } catch {
      // Local sign-out should still work if the remote token already expired.
    }
  }
  storeSession(null);
}

export async function fetchAccount(session: AuthSession) {
  if (isDesktopRuntime()) {
    const user = await fetchSessionUser(session);
    // Role lookup is optional for local features, but only the server can grant it.
    try {
      const response = await fetch(accountApiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: AbortSignal.timeout(5000),
      });
      const account = response.ok ? await response.json() : null;
      return { user, isAdmin: account?.user?.id === user.id && account?.isAdmin === true };
    } catch {
      return { user, isAdmin: false };
    }
  }
  let response: Response;
  try {
    response = await fetch(accountApiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch (error) {
    throw normalizeAuthNetworkError(error);
  }
  if (!response.ok) {
    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    const error = new Error(
      response.status === 401
        ? 'Your sign-in expired. Please sign in again.'
        : data?.error || 'Account status could not be checked. Please try again.',
    );
    (error as any).status = response.status;
    throw error;
  }
  return response.json();
}
