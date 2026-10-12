import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type VercelConfig = {
  rewrites?: Array<{ source?: string; destination?: string }>;
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as VercelConfig;
const rewrites = new Map((config.rewrites || []).map((rewrite) => [rewrite.source, rewrite.destination]));

test('immutable browser caching is restricted to build assets', () => {
  const immutable = (config.headers || []).filter(rule => rule.headers.some(header => header.value.includes('immutable')));
  assert.deepEqual(immutable.map(rule => rule.source), ['/assets/(.*)']);
  assert.equal(immutable[0].headers[0].value, 'public, max-age=31536000, immutable');
});

test('Vercel serves every bookmarkable web route through the SPA shell', () => {
  const expectedRoutes = [
    '/search',
    '/schedule',
    '/anime/:id/downloads',
    '/anime/popular',
    '/anime/genre/:genre',
    '/anime/season/:seasonSlug',
    '/season/:seasonSlug',
    '/anime/:id',
    '/manga/:id',
    '/watch/:id',
    '/my-list',
    '/nyaa',
    '/compare',
    '/blog',
    '/blog/:slug',
    '/login',
    '/reset-password',
    '/dashboard',
    '/about',
    '/privacy-policy',
    '/terms',
    '/disclaimer',
  ];

  for (const route of expectedRoutes) {
    assert.equal(rewrites.get(route), '/index.html', `Missing SPA rewrite for ${route}`);
  }
});

test('API routes stay ahead of the SPA rewrites', () => {
  const apiIndex = (config.rewrites || []).findIndex((rewrite) => rewrite.source === '/api/(.*)');
  const firstSpaIndex = (config.rewrites || []).findIndex((rewrite) => rewrite.destination === '/index.html');
  assert.ok(apiIndex >= 0);
  assert.ok(firstSpaIndex > apiIndex);
});
