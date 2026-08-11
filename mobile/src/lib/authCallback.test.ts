import { describe, expect, it } from 'vitest';
import { APP_AUTH_REDIRECT_URL, authCallbackParams, googleOAuthUrl, isAppAuthCallback } from './authCallback';

describe('native auth callbacks', () => {
  it('only accepts the StreamNyaa application callback', () => {
    expect(isAppAuthCallback('streamnyaa://auth#access_token=token')).toBe(true);
    expect(isAppAuthCallback('https://www.streamnyaa.xyz/#access_token=token')).toBe(false);
  });

  it('parses implicit sessions from fragments and errors from query parameters', () => {
    expect(authCallbackParams('streamnyaa://auth#access_token=abc&refresh_token=def')?.get('access_token')).toBe('abc');
    expect(authCallbackParams('streamnyaa://auth?error_description=Denied')?.get('error_description')).toBe('Denied');
  });

  it('always sends Google back to the native application', () => {
    const url = new URL(googleOAuthUrl('https://project.supabase.co/'));
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe(APP_AUTH_REDIRECT_URL);
  });
});
