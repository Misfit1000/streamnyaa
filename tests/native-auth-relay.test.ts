import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasOnlyNativeRecoveryQueryParameters,
  nativeRecoveryRelayHtml,
  parseNativeRecoveryPlatform,
} from '../api/_shared/nativeAuthRelay.ts';

test('native recovery relay accepts supported platforms only', () => {
  assert.equal(parseNativeRecoveryPlatform('desktop'), 'desktop');
  assert.equal(parseNativeRecoveryPlatform('android'), 'android');
  assert.equal(parseNativeRecoveryPlatform('web'), null);
});

test('native recovery relay ignores Supabase decoration without forwarding it', () => {
  assert.equal(hasOnlyNativeRecoveryQueryParameters({
    platform: 'android',
    action: 'recovery',
    sb: 'opaque-value',
  }), true);

  const html = nativeRecoveryRelayHtml('android');
  assert.match(html, /const ignored = \["sb"\]/);
  assert.doesNotMatch(html, /opaque-value/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|analytics/);
});

test('native recovery relay rejects unknown query fields', () => {
  assert.equal(hasOnlyNativeRecoveryQueryParameters({
    platform: 'android',
    action: 'recovery',
    next: 'https://example.invalid',
  }), false);
});
