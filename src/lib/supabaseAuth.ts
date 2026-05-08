const STORAGE_KEY = 'streamnyaa.auth.session';

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

async function authConfig() {
  if (cachedConfig) return cachedConfig;

  const response = await fetch('/api/auth/config');
  if (!response.ok) throw new Error('Login is not configured yet.');
  cachedConfig = await response.json();
  return cachedConfig!;
}

async function authFetch(path: string, options: RequestInit = {}) {
  const config = await authConfig();
  const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.publishableKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });

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

export async function signInWithPassword(email: string, password: string) {
  const data = await authFetch('token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const session = normalizeSession(data);
  storeSession(session);
  return session;
}

export async function signUpWithPassword(email: string, password: string) {
  const data = await authFetch('signup', {
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
  const redirectTo = 'https://www.streamnyaa.xyz/reset-password';
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
  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
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
