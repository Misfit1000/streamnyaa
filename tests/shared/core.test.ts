import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSharedHistory, mergeSharedLibrary } from '../../shared/account';
import {
  DEFAULT_MOBILE_RESOURCE_POLICY,
  normalizeMobileResourcePolicy,
  normalizePlayerPreferences,
} from '../../shared/preferences';
import { buildSourceQuery, selectBackupSource, sourceQualityScore } from '../../shared/sources';

test('library changes merge by identity without losing flags from another client', () => {
  const remote = [{ animeId: '1', animeTitle: 'One', anime: { id: 1 }, bookmarked: true, liked: false, updatedAt: '2026-01-01T00:00:00Z' }];
  const local = [{ animeId: '1', animeTitle: 'One', anime: { id: 1 }, bookmarked: false, liked: true, updatedAt: '2026-01-02T00:00:00Z' }];
  assert.deepEqual(mergeSharedLibrary(local, remote), [{ ...local[0], bookmarked: true, liked: true }]);
});

test('watch history keeps the newest progress from desktop or Android', () => {
  const remote = [{ key: '1::1', source: { position: 10 }, updatedAt: '2026-01-01T00:00:00Z' }];
  const local = [{ key: '1::1', source: { position: 90 }, updatedAt: '2026-01-02T00:00:00Z' }];
  assert.deepEqual(mergeSharedHistory(local, remote, 100)[0]?.source, { position: 90 });
});

test('shared preference normalization clamps unsafe resource values', () => {
  assert.equal(normalizePlayerPreferences({ volume: 999, playbackSpeed: 99 }).volume, 130);
  assert.equal(normalizePlayerPreferences({ volume: 999, playbackSpeed: 99 }).playbackSpeed, 4);
  assert.deepEqual(normalizeMobileResourcePolicy({ maxCacheMiB: 64 }), { ...DEFAULT_MOBILE_RESOURCE_POLICY, maxCacheMiB: 512 });
});

test('source query and ranking rules are shared across clients', () => {
  assert.equal(buildSourceQuery('Frieren', 3, 'dual-preferred'), 'Frieren 03 dual audio');
  assert.ok(sourceQualityScore({ title: '[SubsPlease] Show 1080p HEVC', seeders: 100 }) >= 80);
});

test('backup selection skips failed and unseeded releases', () => {
  const sources = [
    { infoHash: 'failed', magnet: 'magnet:?failed', seeders: 50 },
    { infoHash: 'dead', magnet: 'magnet:?dead', seeders: 0 },
    { infoHash: 'healthy', magnet: 'magnet:?healthy', seeders: 12 },
  ];
  assert.equal(selectBackupSource(sources, new Set(['failed']))?.infoHash, 'healthy');
});
