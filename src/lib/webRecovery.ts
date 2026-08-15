export type WebRecoveryCallback =
  | { status: 'valid'; accessToken: string }
  | { status: 'invalid'; message: string }
  | { status: 'none' };

function firstParam(query: URLSearchParams, fragment: URLSearchParams, key: string) {
  return fragment.get(key) || query.get(key) || '';
}

export function parseWebRecoveryCallback(rawUrl: string): WebRecoveryCallback {
  const url = new URL(rawUrl, 'https://www.streamnyaa.xyz');
  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const action = firstParam(query, fragment, 'type');
  const accessToken = firstParam(query, fragment, 'access_token');
  const callbackError = firstParam(query, fragment, 'error_description') || firstParam(query, fragment, 'error');
  const recoveryRoute = url.pathname === '/reset-password';

  if (!recoveryRoute && action !== 'recovery') return { status: 'none' };
  if (callbackError) {
    return { status: 'invalid', message: callbackError };
  }
  if (action === 'recovery' && accessToken) return { status: 'valid', accessToken };
  return {
    status: 'invalid',
    message: 'This password reset link is missing, expired, or has already been used. Send another link to continue.',
  };
}
