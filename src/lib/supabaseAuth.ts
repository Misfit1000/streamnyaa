import { accountApiFetch, accountApiUrl } from './accountApi';

const STORAGE_KEY = 'streamnyaa.auth.session';
const FALLBACK_SUPABASE_URL = 'https://opteiijnvuwstpdjxwlk.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_oHAwXtg1wXcPybVYfLBUuQ_GiYz3Fxv';

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

interface AuthConfig {
  supabaseUrl: string;
  publishableKey: string;
}

let cachedConfig: AuthConfig | null = null;

type RuntimeEnv = Partial<Record<string, string>>;

function runtimeEnv(): RuntimeEnv {
  return ((import.meta as unknown as { env?: RuntimeEnv }).env) || {};
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

async function authConfig() {
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
  const config = await authConfig();
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
    throw new Error(data?.msg || data?.message || 'Authentication request failed.');
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

function siteRedirectUrl(path = '/login') {
  const env = runtimeEnv();
  const configuredOrigin = String(
    env.VITE_AUTH_REDIRECT_ORIGIN
      || env.VITE_APP_URL
      || env.VITE_PUBLIC_APP_URL
      || '',
  ).trim().replace(/\/+$/, '');
  const origin = configuredOrigin || (typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://www.streamnyaa.xyz');
  return `${origin}${path}`;
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
  const config = await authConfig();
  const redirectTo = siteRedirectUrl(redirectPath);
  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: redirectTo,
  });
  window.location.href = `${config.supabaseUrl}/auth/v1/authorize?${params.toString()}`;
}

export async function signUpWithPassword(email: string, password: string) {
  const redirectTo = siteRedirectUrl('/login');
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
  const redirectTo = siteRedirectUrl('/reset-password');
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
