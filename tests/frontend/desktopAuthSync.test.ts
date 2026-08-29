import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGoogleOAuthUrl,
  desktopAuthRedirectUrl,
  nativeRecoveryRedirectUrl,
  parseDesktopAuthCallback,
  refreshSession,
  requestPasswordReset,
  safeAuthRedirectPath,
  signUpWithPassword,
  updatePassword,
} from '../../src/lib/supabaseAuth';
import {
  hasOnlyNativeRecoveryQueryParameters,
  nativeRecoveryRelayHtml,
  parseNativeRecoveryPlatform,
} from '../../api/_shared/nativeAuthRelay';
import {
  AccountSyncError,
  fetchAccountSync,
  replaceAccountSyncData,
  selectNewestAccountRecord,
} from '../../src/lib/accountSync';

describe('desktop authentication isolation', () => {
  beforeEach(() => {
    window.__STREAMNYAA_DESKTOP__ = true;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  });

  it('builds distinct native callbacks and sanitizes next routes', () => {
    expect(desktopAuthRedirectUrl('login', '/my-list')).toContain('streamnyaa://auth/callback?');
    expect(desktopAuthRedirectUrl('recovery', '/reset-password')).toContain('action=recovery');
    expect(desktopAuthRedirectUrl('confirmation', '/login')).toContain('action=confirmation');
    expect(safeAuthRedirectPath('https://example.com')).toBe('/login');
    expect(safeAuthRedirectPath('//example.com')).toBe('/login');
  });

  it('forces the Google account chooser and keeps the internal next route', async () => {
    const authorizeUrl = new URL(await createGoogleOAuthUrl('/my-list', true));
    expect(authorizeUrl.searchParams.get('provider')).toBe('google');
    expect(authorizeUrl.searchParams.get('prompt')).toBe('select_account');
    const redirect = new URL(authorizeUrl.searchParams.get('redirect_to') || '');
    expect(redirect.protocol).toBe('streamnyaa:');
    expect(redirect.hostname).toBe('auth');
    expect(redirect.pathname).toBe('/callback');
    expect(redirect.searchParams.get('action')).toBe('login');
    expect(redirect.searchParams.get('next')).toBe('/my-list');
  });

  it('parses recovery sessions and rejects unrelated callbacks', () => {
    const callback = parseDesktopAuthCallback(
      'streamnyaa://auth/callback?action=recovery&next=%2Freset-password&access_token=secret&expires_in=60&type=recovery',
    );
    expect(callback.action).toBe('recovery');
    expect(callback.next).toBe('/reset-password');
    expect(callback.session?.access_token).toBe('secret');
    expect(() => parseDesktopAuthCallback('streamnyaa://profile?action=login')).toThrow(/rejected/i);
    expect(() => parseDesktopAuthCallback('streamnyaa://auth/callback?action=unknown')).toThrow(/action/i);
  });

  it('builds a restricted HTTPS recovery relay for each native app', () => {
    expect(nativeRecoveryRedirectUrl('desktop')).toBe(
      'https://www.streamnyaa.xyz/api/auth/native-callback?platform=desktop&action=recovery',
    );
    expect(parseNativeRecoveryPlatform('desktop')).toBe('desktop');
    expect(parseNativeRecoveryPlatform('android')).toBe('android');
    expect(parseNativeRecoveryPlatform('web')).toBeNull();
    const html = nativeRecoveryRelayHtml('desktop');
    expect(html).toContain('streamnyaa://auth/callback?action=recovery');
    expect(html).toContain('const allowed = ["access_token","refresh_token"');
    expect(html).toContain('const ignored = ["sb"]');
    expect(hasOnlyNativeRecoveryQueryParameters({ platform: 'android', action: 'recovery', sb: 'opaque' })).toBe(true);
    expect(hasOnlyNativeRecoveryQueryParameters({ platform: 'android', action: 'recovery', next: '/unsafe' })).toBe(false);
    expect(html).not.toContain('localStorage');
    expect(html).not.toContain('analytics');
  });

  it('rejects a recovery token without a recovery type', () => {
    expect(() => parseDesktopAuthCallback(
      'streamnyaa://auth/callback?action=recovery&access_token=secret',
    )).toThrow(/recovery session was rejected/i);
  });

  it('surfaces callback cancellation without accepting a session', () => {
    const callback = parseDesktopAuthCallback(
      'streamnyaa://auth/callback?action=login&next=%2Fprofile&error=access_denied&error_description=Cancelled',
    );
    expect(callback.error).toBe('Cancelled');
    expect(callback.session).toBeNull();
  });

  it('uses native confirmation and recovery redirects and authorizes password updates', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 'new-user' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await signUpWithPassword('user@example.com', 'password');
    await requestPasswordReset('user@example.com');
    await updatePassword('recovery-token', 'replacement');

    const signupUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const confirmation = new URL(signupUrl.searchParams.get('redirect_to') || '');
    expect(confirmation.searchParams.get('action')).toBe('confirmation');
    const recoveryUrl = new URL(String(fetchMock.mock.calls[1][0]));
    const recovery = new URL(recoveryUrl.searchParams.get('redirect_to') || '');
    expect(recovery.origin + recovery.pathname).toBe('https://www.streamnyaa.xyz/api/auth/native-callback');
    expect(recovery.searchParams.get('platform')).toBe('desktop');
    expect(recovery.searchParams.get('action')).toBe('recovery');
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({ Authorization: 'Bearer recovery-token' });
  });

  it('refreshes an expired desktop session without a website endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'fresh-token',
      refresh_token: 'fresh-refresh',
      expires_in: 3600,
      user: { id: 'user-1', email: 'user@example.com' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const refreshed = await refreshSession({ access_token: 'expired-token', refresh_token: 'refresh-token' });
    expect(refreshed.access_token).toBe('fresh-token');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/v1/token?grant_type=refresh_token');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('streamnyaa.xyz');
  });
});

describe('account record conflict resolution', () => {
  const older = { value: 'older', updatedAt: '2026-08-15T01:00:00.000Z' };
  const newer = { value: 'newer', updatedAt: '2026-08-15T02:00:00.000Z' };

  it('selects the latest update, including deliberate backward-seek records', () => {
    expect(selectNewestAccountRecord(older, newer)).toBe(newer);
    expect(selectNewestAccountRecord(newer, older)).toBe(newer);
  });

  it('prefers the existing remote record when timestamps are equal', () => {
    const remote = { value: 'remote', updatedAt: newer.updatedAt };
    expect(selectNewestAccountRecord(newer, remote)).toBe(remote);
  });

  it('syncs canonical checkpoints without source or magnet history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await replaceAccountSyncData({
      access_token: 'session-token',
      user: { id: 'user-1', email: 'user@example.com' },
    }, {
      watchHistory: [{
        key: 'anime-1::2',
        animeId: 'anime-1',
        animeTitle: 'Anime One',
        episode: 2,
        positionSeconds: 125,
        durationSeconds: 1440,
        watchedPercent: 8.7,
        completed: false,
        updatedAt: '2026-08-15T02:00:00.000Z',
        source: { magnet: 'magnet:?xt=urn:btih:private-source' },
      }],
    });
    const requestBodies = fetchMock.mock.calls
      .map((call) => String(call[1]?.body || ''))
      .filter(Boolean)
      .join('\n');
    expect(requestBodies).not.toContain('magnet:');
    expect(requestBodies).toContain('"resume_seconds":125');
    expect(requestBodies).toContain('"source":null');
  });

  it('reports a missing sync schema distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      code: 'PGRST205',
      message: 'Could not find the table in the schema cache',
    }), { status: 404 })));
    await expect(fetchAccountSync({
      access_token: 'session-token',
      user: { id: 'user-1', email: 'user@example.com' },
    })).rejects.toMatchObject<AccountSyncError>({ code: 'missing-schema' });
  });
});
