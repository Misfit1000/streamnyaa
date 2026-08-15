import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWatchHistoryRows } from '../api/account-sync.ts';

test('account sync stores canonical playback data without torrent source details', () => {
  const [row] = normalizeWatchHistoryRows('user-1', [{
    key: 'anime-21:episode-4',
    animeId: 21,
    animeTitle: 'Example Anime',
    episode: 4,
    positionSeconds: 612,
    durationSeconds: 1440,
    watchedPercent: 42.5,
    completed: false,
    updatedAt: '2026-08-15T10:00:00.000Z',
    source: {
      magnet: 'magnet:?xt=urn:btih:secret',
      torrentUrl: 'https://example.invalid/release.torrent',
      resumeSeconds: 1,
    },
  }]) as any[];

  assert.equal(row.history_key, 'anime-21:episode-4');
  assert.equal(row.anime_id, '21');
  assert.equal(row.resume_seconds, 612);
  assert.equal(row.duration_seconds, 1440);
  assert.equal(row.progress_percent, 42.5);
  assert.equal(row.source, null);
  assert.equal(JSON.stringify(row).includes('magnet:'), false);
  assert.equal(JSON.stringify(row).includes('torrentUrl'), false);
});

test('account sync preserves timestamped tombstones', () => {
  const [row] = normalizeWatchHistoryRows('user-1', [{
    history_key: 'anime-21:episode-4',
    updated_at: '2026-08-15T10:00:00.000Z',
    deleted_at: '2026-08-15T10:00:00.000Z',
  }]) as any[];

  assert.equal(row.deleted_at, '2026-08-15T10:00:00.000Z');
  assert.equal(row.updated_at, '2026-08-15T10:00:00.000Z');
});
