import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { API_ORIGIN } from '../config';
import type { AccountUser, AuthSession } from '../types';
import { requestJson } from '../lib/network';

const SESSION_KEY = 'streamnyaa.auth.session.v1';
export type SupabasePublicConfig = { supabaseUrl: string; supabaseAnonKey: string };
let configPromise: Promise<SupabasePublicConfig> | null = null;
const APP_REDIRECT_URL = Linking.createURL('auth');
const MOBILE_AUTH_CALLBACK_URL = `${API_ORIGIN}/api/auth/mobile-callback`;

WebBrowser.maybeCompleteAuthSession();

export async function authConfig() {
  if (!configPromise) {
    configPromise = requestJson<any>(`${API_ORIGIN}/api/auth/config`).then((data) => {
      const supabaseAnonKey = data.supabaseAnonKey || data.publishableKey;
      if (!data.supabaseUrl || !supabaseAnonKey) throw new Error(data.error || 'Login service is unavailable.');
      return { supabaseUrl: data.supabaseUrl, supabaseAnonKey };
    }).catch((error) => { configPromise = null; throw error; });
  }
  return configPromise;
}

async function authFetch(path: string, init: RequestInit = {}) {
  const config = await authConfig();
  const data = await requestJson<any>(`${config.supabaseUrl}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.supabaseAnonKey,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  return data;
}

function normalizeSession(data: any): AuthSession {
  return {
    ...data,
    expires_at: data.expires_at || (data.expires_in ? Math.floor(Date.now() / 1000) + Number(data.expires_in) : undefined),
  };
}

export async function sessionFromAuthUrl(url?: string | null) {
  if (!url || !/^streamnyaa:\/\/auth(?:[/?#]|$)/i.test(url)) return null;
  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const params = new URLSearchParams(fragment || query);
  const authError = params.get('error_description') || params.get('error');
  if (authError) throw new Error(authError);
  const accessToken = params.get('access_token');
  if (!accessToken) return null;
  const session: AuthSession = {
    access_token: accessToken,
    refresh_token: params.get('refresh_token') || undefined,
    expires_at: Math.floor(Date.now() / 1000) + Number(params.get('expires_in') || 3600),
  };
  await storeSession(session);
  return session;
}

export async function storeSession(session: AuthSession | null) {
  if (!session) return SecureStore.deleteItemAsync(SESSION_KEY);
  return SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession() {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthSession; } catch { return null; }
}

export async function signInWithPassword(email: string, password: string) {
  const session = normalizeSession(await authFetch('token?grant_type=password', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }));
  await storeSession(session);
  return session;
}

export async function signUpWithPassword(email: string, password: string) {
  const session = normalizeSession(await authFetch(`signup?redirect_to=${encodeURIComponent(MOBILE_AUTH_CALLBACK_URL)}`, {
    method: 'POST', body: JSON.stringify({ email, password }),
  }));
  if (session.access_token) await storeSession(session);
  return session;
}

export async function signInWithGoogle() {
  const config = await authConfig();
  const url = `${config.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(MOBILE_AUTH_CALLBACK_URL)}`;
  const result = await WebBrowser.openAuthSessionAsync(url, APP_REDIRECT_URL);
  if (result.type !== 'success') throw new Error('Google sign-in was cancelled.');
  const session = await sessionFromAuthUrl(result.url);
  if (!session) throw new Error('Google sign-in did not return to the Android app.');
  return session;
}

export async function refreshAuthSession(session: AuthSession) {
  if (!session.refresh_token) return session;
  const next = normalizeSession(await authFetch('token?grant_type=refresh_token', {
    method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }),
  }));
  await storeSession(next);
  return next;
}

export async function fetchAccountUser(session: AuthSession): Promise<AccountUser> {
  const data = await requestJson<any>(`${API_ORIGIN}/api/auth/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  return data.user || data;
}

export async function signOut(session: AuthSession | null) {
  if (session?.access_token) {
    await authFetch('logout', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => undefined);
  }
  await storeSession(null);
}
