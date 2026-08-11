export const APP_AUTH_REDIRECT_URL = 'streamnyaa://auth';

export function isAppAuthCallback(url?: string | null) {
  return Boolean(url && /^streamnyaa:\/\/auth(?:[/?#]|$)/i.test(url));
}

export function authCallbackParams(url?: string | null) {
  if (!isAppAuthCallback(url) || !url) return null;
  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  return new URLSearchParams(fragment || query);
}

export function googleOAuthUrl(supabaseUrl: string) {
  const base = supabaseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({ provider: 'google', redirect_to: APP_AUTH_REDIRECT_URL });
  return `${base}/auth/v1/authorize?${params.toString()}`;
}
