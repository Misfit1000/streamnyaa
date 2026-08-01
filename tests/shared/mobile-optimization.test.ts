import assert from 'node:assert/strict';
import test from 'node:test';
import { accountPayloadFingerprint, accountSyncDelayMs } from '../../mobile/src/lib/accountSyncPolicy';
import { HttpError, shouldRetryRequest } from '../../mobile/src/lib/network';

test('account sync fingerprints ignore collection ordering but detect progress changes', () => {
  const base = {
    library: [
      { animeId: '2', bookmarked: true, liked: false, updatedAt: '2026-08-01T00:00:00.000Z' },
      { animeId: '1', bookmarked: false, liked: true, updatedAt: '2026-08-01T00:00:01.000Z' },
    ],
    watchHistory: [{ key: '1::1', updatedAt: '2026-08-01T00:00:02.000Z' }],
    preferences: { updatedAt: '2026-08-01T00:00:03.000Z' },
  };
  const reordered = { ...base, library: [...base.library].reverse() };
  assert.equal(accountPayloadFingerprint(base), accountPayloadFingerprint(reordered));
  assert.notEqual(accountPayloadFingerprint(base), accountPayloadFingerprint({
    ...base,
    watchHistory: [{ key: '1::1', updatedAt: '2026-08-01T00:00:04.000Z' }],
  }));
});

test('playback sync is battery-aware while library and preferences remain urgent', () => {
  assert.equal(accountSyncDelayMs({ libraryChanged: false, preferencesChanged: false, batterySaver: true }), 45_000);
  assert.equal(accountSyncDelayMs({ libraryChanged: false, preferencesChanged: false, batterySaver: false }), 30_000);
  assert.equal(accountSyncDelayMs({ libraryChanged: true, preferencesChanged: false, batterySaver: true }), 1_200);
  assert.equal(accountSyncDelayMs({ libraryChanged: false, preferencesChanged: true, batterySaver: true }), 1_200);
});

test('network retries only transient failures and caps attempts', () => {
  assert.equal(shouldRetryRequest(0, new HttpError('rate limited', 429)), true);
  assert.equal(shouldRetryRequest(0, new HttpError('server unavailable', 503)), true);
  assert.equal(shouldRetryRequest(0, new HttpError('not found', 404)), false);
  assert.equal(shouldRetryRequest(2, new HttpError('timeout', 408)), false);
});
