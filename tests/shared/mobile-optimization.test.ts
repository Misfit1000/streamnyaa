import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { accountPayloadFingerprint, accountSyncDelayMs } from '../../mobile/src/lib/accountSyncPolicy';
import { HttpError, shouldRetryRequest } from '../../mobile/src/lib/network';
import { mobileSourceCompatibilityScore, sourceAllowedByMode } from '../../mobile/src/lib/mobileSourcePolicy';
import { normalizeWatchHistoryRows } from '../../api/account-sync';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

test('streaming lifecycle detaches the player and isolates native sessions', () => {
  const watch = readFileSync(path.join(repoRoot, 'mobile/src/screens/WatchScreen.tsx'), 'utf8');
  const engine = readFileSync(path.join(repoRoot, 'mobile/modules/torrent-engine/android/src/main/java/com/misfit1000/streamnyaa/torrent/TorrentStreamEngine.kt'), 'utf8');
  const server = readFileSync(path.join(repoRoot, 'mobile/modules/torrent-engine/android/src/main/java/com/misfit1000/streamnyaa/torrent/LocalTorrentHttpServer.kt'), 'utf8');
  assert.match(watch, /replaceAsync\(null\)/, 'ExoPlayer must detach before its localhost source is stopped');
  assert.match(watch, /playbackGeneration/, 'stale asynchronous player replacements must be ignored');
  assert.match(engine, /sessionGeneration/, 'stale libtorrent alerts must be ignored');
  assert.match(engine, /havePiece/, 'playback readiness must use completed torrent pieces');
  assert.match(server, /readableBytesProvider/, 'the HTTP server must only expose readable contiguous ranges');
});

test('native torrent work runs outside the React Native process', () => {
  const manifest = readFileSync(path.join(repoRoot, 'mobile/modules/torrent-engine/android/src/main/AndroidManifest.xml'), 'utf8');
  const module = readFileSync(path.join(repoRoot, 'mobile/modules/torrent-engine/android/src/main/java/com/misfit1000/streamnyaa/torrent/StreamNyaaTorrentModule.kt'), 'utf8');
  const service = readFileSync(path.join(repoRoot, 'mobile/modules/torrent-engine/android/src/main/java/com/misfit1000/streamnyaa/torrent/TorrentStreamService.kt'), 'utf8');
  assert.match(manifest, /android:process=":torrent"/);
  assert.ok(!module.includes('SessionManager'), 'the UI process must not load libtorrent sessions');
  assert.match(service, /TorrentStreamEngine/);
  assert.match(module, /handleWorkerExit/);
});

test('mobile source ranking avoids expensive codecs on battery saver', () => {
  const base = { infoHash: 'a', magnet: 'magnet:?a', seeders: 20, leechers: 0, matchScore: 80, sourceScore: 70 };
  const h264 = { ...base, title: 'Show 01 1080p AVC x264' };
  const av1 = { ...base, infoHash: 'b', title: 'Show 01 2160p AV1 10-bit' };
  assert.ok(mobileSourceCompatibilityScore(h264, true) > mobileSourceCompatibilityScore(av1, true));
  assert.equal(sourceAllowedByMode({ ...base, title: 'exact' }, 'strict', true), true);
  assert.equal(sourceAllowedByMode({ ...base, title: 'weak', matchScore: 20 }, 'strict', true), false);
});

test('account sync accepts mobile and web history shapes without losing zero progress', () => {
  const flat = { key: '1::1', animeId: '1', animeTitle: 'Show', episode: 1, magnet: 'magnet:?one', sourceTitle: 'Source', progressPercent: 0, resumeSeconds: 0, durationSeconds: 0, updatedAt: '2026-08-07T00:00:00.000Z' };
  const wrapped = { key: '2::2', source: { ...flat, key: '2::2', magnet: 'magnet:?two' }, updatedAt: flat.updatedAt };
  const rows = normalizeWatchHistoryRows('00000000-0000-0000-0000-000000000000', [flat, wrapped]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.source.magnet, 'magnet:?one');
  assert.equal(rows[0]?.progress_percent, 0);
  assert.equal(rows[1]?.source.magnet, 'magnet:?two');
});
