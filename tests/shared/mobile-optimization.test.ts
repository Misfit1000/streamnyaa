import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { accountPayloadFingerprint, accountSyncDelayMs } from '../../mobile/src/lib/accountSyncPolicy';
import { HttpError, shouldRetryRequest } from '../../mobile/src/lib/network';
import { mobileSourceCompatibilityScore, sourceAllowedByMode } from '../../mobile/src/lib/mobileSourcePolicy';
import { sourceQueriesForAnime, sourceTitleCandidates } from '../../mobile/src/lib/sourceDiscovery';
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
  const playback = readFileSync(path.join(repoRoot, 'mobile/src/context/PlaybackContext.tsx'), 'utf8');
  const engine = readFileSync(path.join(repoRoot, 'mobile/modules/torrent-engine/android/src/main/java/com/misfit1000/streamnyaa/torrent/TorrentStreamEngine.kt'), 'utf8');
  const server = readFileSync(path.join(repoRoot, 'mobile/modules/torrent-engine/android/src/main/java/com/misfit1000/streamnyaa/torrent/LocalTorrentHttpServer.kt'), 'utf8');
  assert.match(playback, /replaceAsync\(null\)/, 'ExoPlayer must detach before its localhost source is stopped');
  assert.match(playback, /generation\.current/, 'stale asynchronous player replacements must be ignored');
  assert.match(engine, /sessionGeneration/, 'stale libtorrent alerts must be ignored');
  assert.match(engine, /synchronized\(this@TorrentStreamEngine\)/, 'libtorrent alerts must share the engine lifecycle lock');
  assert.doesNotMatch(engine, /remove\(existing\)/, 'metadata recovery must not invalidate the active native handle');
  assert.match(engine, /persistentHandle\(alertHandle, nextSession\)/, 'non-owning alert handles must be replaced with session-owned handles');
  assert.match(engine, /expectedSession\.find\(infoHash\)/, 'persistent handles must come from the live libtorrent session');
  assert.doesNotMatch(engine, /configureSelectedFile\(\(alert as MetadataReceivedAlert\)\.handle\(\)/, 'alert-owned handles must never escape their callback');
  assert.match(engine, /val previousHandle = handle[\s\S]*handle = null[\s\S]*remove\(torrentHandle\)/, 'removed handles must stop being observable before native disposal');
  assert.match(engine, /havePiece/, 'playback readiness must use completed torrent pieces');
  assert.match(engine, /playbackPort = server\?\.listeningPort\?\.takeIf \{ it > 0 \}/, 'cached streams must wait for a real localhost port');
  assert.doesNotMatch(engine, /server\?\.listeningPort\}\/video/, 'a missing server must never produce a malformed null-port URL');
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
  assert.match(service, /val request = Bundle\(message\.data\)/, 'IPC requests must be copied before Handler recycles Message');
  assert.match(service, /processRequest\(messageType, request, replyTo\)/, 'the worker must receive the immutable IPC snapshot');
  assert.doesNotMatch(service, /executor\.execute \{ processRequest\(message\) \}/, 'a recycled Handler Message must never cross executor threads');
});

test('mobile source ranking avoids expensive codecs on battery saver', () => {
  const base = { infoHash: 'a', magnet: 'magnet:?a', seeders: 20, leechers: 0, matchScore: 80, sourceScore: 70 };
  const h264 = { ...base, title: 'Show 01 1080p AVC x264' };
  const av1 = { ...base, infoHash: 'b', title: 'Show 01 2160p AV1 10-bit' };
  assert.ok(mobileSourceCompatibilityScore(h264, true) > mobileSourceCompatibilityScore(av1, true));
  assert.equal(sourceAllowedByMode({ ...base, title: 'exact' }, 'strict', true), true);
  assert.equal(sourceAllowedByMode({ ...base, title: 'weak', matchScore: 20 }, 'strict', true), false);
  const seasonOneAnime = { title: 'Sousou no Frieren', titles: { romaji: 'Sousou no Frieren' } };
  const seasonOne = { ...base, title: 'Sousou no Frieren - 01 1080p AVC', seeders: 30 };
  const wrongSeason = { ...base, infoHash: 'c', title: 'Sousou no Frieren S2 - 01 1080p AVC', seeders: 800 };
  assert.ok(mobileSourceCompatibilityScore(seasonOne, true, seasonOneAnime) > mobileSourceCompatibilityScore(wrongSeason, true, seasonOneAnime));
});

test('mobile source discovery prefers index-friendly title aliases', () => {
  const anime = {
    title: "Frieren: Beyond Journey's End",
    titles: { english: "Frieren: Beyond Journey's End", romaji: 'Sousou no Frieren', native: 'Japanese title' },
  };
  assert.deepEqual(sourceTitleCandidates(anime).slice(0, 2), ["Frieren: Beyond Journey's End", 'Sousou no Frieren']);
  assert.match(sourceQueriesForAnime(anime, 1, 'sub-preferred')[0] || '', /Frieren: Beyond Journey's End 01/);
  assert.ok(sourceQueriesForAnime(anime, 1, 'sub-preferred').some((query) => /Sousou no Frieren 01/.test(query)));

  const sequelQueries = sourceQueriesForAnime({
    title: 'Mushoku Tensei: Jobless Reincarnation Season 2',
    titles: { romaji: 'Mushoku Tensei II: Isekai Ittara Honki Dasu' },
  }, 2, 'sub-preferred');
  assert.ok(sequelQueries.some((query) => /Mushoku Tensei S2 02/i.test(query)), 'season aliases should match compact torrent naming');
  assert.ok(sequelQueries.some((query) => /^Mushoku Tensei II 02$/i.test(query)), 'subtitle-free aliases should keep focused searches fast');

  const ordinalQueries = sourceQueriesForAnime({
    title: "Frieren: Beyond Journey's End Season 2",
    titles: { romaji: 'Sousou no Frieren 2nd Season' },
  }, 1, 'sub-preferred');
  assert.ok(ordinalQueries.some((query) => /^Sousou no Frieren S2 01$/i.test(query)), 'ordinal sequel names should produce index-friendly S2 aliases');
});

test('stalled torrent sources time out and return to the in-app recovery flow', () => {
  const engine = readFileSync(path.join(repoRoot, 'mobile/modules/torrent-engine/android/src/main/java/com/misfit1000/streamnyaa/torrent/TorrentStreamEngine.kt'), 'utf8');
  const playback = readFileSync(path.join(repoRoot, 'mobile/src/context/PlaybackContext.tsx'), 'utf8');
  const surface = readFileSync(path.join(repoRoot, 'mobile/src/components/PlaybackSurface.tsx'), 'utf8');
  const recovery = readFileSync(path.join(repoRoot, 'mobile/src/lib/playbackRecovery.ts'), 'utf8');
  assert.match(engine, /METADATA_TIMEOUT_MS/);
  assert.match(engine, /BUFFER_STALL_TIMEOUT_MS/);
  assert.match(engine, /PLAYBACK_READY_TIMEOUT_MS/);
  assert.match(engine, /NO_PEER_TIMEOUT_MS/);
  assert.doesNotMatch(engine, /fetchTorrentInfo/, 'network metadata must never block peer discovery');
  assert.match(engine, /download\(magnet/, 'magnet discovery must start immediately');
  assert.match(engine, /fetchTorrentMetadata/, 'indexed torrent metadata should bypass DHT-only file discovery');
  assert.match(engine, /forceDHTAnnounce/, 'peer discovery should explicitly announce over DHT');
  assert.match(engine, /https:\/\/tracker\.opentrackr\.org/, 'peer discovery needs an HTTPS tracker for networks that block UDP');
  assert.match(playback, /nextRecoverySource/, 'automatic fallback must use the bounded recovery policy');
  assert.match(recovery, /maximumAttempts = 3/, 'automatic fallback must be bounded to three ranked releases');
  assert.match(surface, /<VideoView[\s\S]*nativeControls/, 'playback must remain embedded in the Android screen');
  assert.match(surface, /SourcesSheet/, 'manual releases and diagnostics must remain available without cluttering default playback');
});

test('automatic playback waits for enriched anime metadata before source discovery', () => {
  const watch = readFileSync(path.join(repoRoot, 'mobile/src/screens/WatchScreen.tsx'), 'utf8');
  assert.match(watch, /playbackMetadataReady = !details\.isPending/);
  assert.match(watch, /shouldAutoStart && playbackMetadataReady && !requestedSessionActive/);
  assert.match(watch, /disabled=\{!playbackMetadataReady\}/, 'manual Play must not start a weak title-only lookup while metadata is pending');
});

test('Android branding uses the exact logo in-app and padded launcher assets', () => {
  const config = readFileSync(path.join(repoRoot, 'mobile/app.json'), 'utf8');
  const brand = readFileSync(path.join(repoRoot, 'mobile/src/components/BrandMark.tsx'), 'utf8');
  const navigator = readFileSync(path.join(repoRoot, 'mobile/src/navigation/RootNavigator.tsx'), 'utf8');
  assert.match(config, /streamnyaa-app-icon\.png/);
  assert.match(config, /streamnyaa-adaptive-foreground\.png/);
  assert.match(brand, /streamnyaa-logo\.png/);
  assert.doesNotMatch(navigator, /tabBarActiveBackgroundColor/, 'active tabs must not create an oversized home tile');
});

test('release size policy is reproducible after Expo regenerates Android', () => {
  const plugin = readFileSync(path.join(repoRoot, 'mobile/modules/torrent-engine/app.plugin.js'), 'utf8');
  assert.match(plugin, /reactNativeArchitectures', 'armeabi-v7a,arm64-v8a'/, 'release builds should package phone ABIs, not emulator ABIs');
  assert.match(plugin, /expo\.gif\.enabled', 'false'/, 'unused animated GIF native support should stay disabled');
  assert.match(plugin, /android\.enableMinifyInReleaseBuilds', 'true'/);
  assert.match(plugin, /android\.enableShrinkResourcesInReleaseBuilds', 'true'/);
});

test('mobile authentication returns to the native app instead of rendering the website', () => {
  const auth = readFileSync(path.join(repoRoot, 'mobile/src/services/auth.ts'), 'utf8');
  assert.match(auth, /APP_REDIRECT_URL = 'streamnyaa:\/\/auth'/);
  assert.doesNotMatch(auth, /mobile-callback/, 'native Google authentication must not depend on the hosted web callback');
  assert.match(auth, /sessionFromAuthUrl/);
  assert.match(auth, /openAuthSessionAsync\(url, APP_REDIRECT_URL\)/);
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
