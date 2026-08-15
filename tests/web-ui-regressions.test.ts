import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseWebRecoveryCallback } from '../src/lib/webRecovery';

test('download page keeps memo hooks ahead of loading and empty returns', () => {
  const source = readFileSync(new URL('../src/pages/AnimeDownloads.tsx', import.meta.url), 'utf8');
  const lastMemoHook = source.indexOf('const highSeederCount = useMemo');
  const firstRenderGuard = source.indexOf('if (animeLoading)');

  assert.ok(lastMemoHook > 0, 'Expected download-source memo hooks');
  assert.ok(firstRenderGuard > lastMemoHook, 'All hooks must run before the first conditional render return');
});

test('production shell does not load click-intercepting ad scripts', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /n6wxm\.com|nap5k\.com|vignette\.min\.js|tag\.min\.js/);
});

test('navigation exposes a real, accessible search submit control', () => {
  const source = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
  assert.match(source, /type="submit"[\s\S]*?aria-label="Search anime"/);
});

test('web recovery accepts verified fragment and query callbacks', () => {
  assert.deepEqual(
    parseWebRecoveryCallback('https://www.streamnyaa.xyz/reset-password#type=recovery&access_token=fragment-token'),
    { status: 'valid', accessToken: 'fragment-token' },
  );
  assert.deepEqual(
    parseWebRecoveryCallback('https://www.streamnyaa.xyz/reset-password?type=recovery&access_token=query-token'),
    { status: 'valid', accessToken: 'query-token' },
  );
});

test('web recovery rejects direct, expired, and unrelated callbacks', () => {
  const direct = parseWebRecoveryCallback('https://www.streamnyaa.xyz/reset-password');
  const expired = parseWebRecoveryCallback('https://www.streamnyaa.xyz/reset-password#error=access_denied&error_description=Link+expired');

  assert.equal(direct.status, 'invalid');
  assert.deepEqual(expired, { status: 'invalid', message: 'Link expired' });
  assert.deepEqual(parseWebRecoveryCallback('https://www.streamnyaa.xyz/login#type=signup&access_token=not-recovery'), { status: 'none' });
});
