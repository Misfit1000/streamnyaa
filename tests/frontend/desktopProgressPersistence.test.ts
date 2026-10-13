import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyNativeCheckpoint, type NativeCheckpoint } from '../../src/lib/desktopNativeProgress';
import { synchronizeOfflineProgress } from '../../src/lib/desktopOfflineProgress';
import { DESKTOP_WATCH_PROGRESS_KEY, DESKTOP_WATCHED_SERIES_KEY, loadDesktopWatchProgress, loadLocalPlaybackHistory, saveDesktopWatchProgress, saveLocalPlaybackHistoryItem, type LocalPlaybackSource } from '../../src/lib/desktop';
import { markInterruptedPlayback, readInterruptedPlayback } from '../../src/lib/desktopInterruptedSession';
import type { DesktopDownloadQueue } from '../../src/lib/desktopDownloads';
import type { WatchedCoverage } from '../../src/lib/desktopCoverage';

const now = 1_900_000_000_000;
const historyKey = 'streamnyaa.localPlaybackHistory';
const markerKey = 'streamnyaa.desktop.offlineProgressSync.v1:';
const hash = 'a'.repeat(40);
const coverage = (intervals: [number, number][] = [[0, 20]], duration = 100, lastPosition = intervals.at(-1)?.[1] || 0): WatchedCoverage => ({ version: 2, duration, intervals, furthest: Math.max(0, ...intervals.map(([, end]) => end)), lastPosition });
const source = (patch: Partial<LocalPlaybackSource> = {}): LocalPlaybackSource => ({ magnet: `magnet:?xt=urn:btih:${hash}`, infoHash: hash, title: 'Release', animeTitle: 'Example', animeId: 'anilist:42', episode: '2', savedAt: now - 1000, progressUpdatedAt: now - 1000, resumeSeconds: 10, durationSeconds: 100, watchedCoverage: coverage([[0, 10]]), ...patch });
const checkpoint = (patch: Partial<NativeCheckpoint> = {}): NativeCheckpoint => ({ version: 1, sessionId: 'session', generation: 1, sequence: 1, updatedAt: now, context: { owner: 'a', animeId: 'anilist:42', title: 'Example', episode: '2', sourceKey: `hash:${hash}` }, coverage: coverage(), completed: false, state: 'playing', ...patch });
const offlineQueue = (): DesktopDownloadQueue => ({ version: 1, limitBps: 0, items: [{ id: hash, magnet: `magnet:?xt=urn:btih:${hash}`, title: 'Release', state: 'completed', downloaded: 1, total: 1, progress: { '01.mkv': { seconds: 120, duration: 1200, updatedAt: 100, completed: false } }, episodeLinks: { '01.mkv': { animeId: 'anilist:42', title: 'Example', episode: 1 } } }] });
function countWork() {
  return { get: vi.spyOn(Storage.prototype, 'getItem'), set: vi.spyOn(Storage.prototype, 'setItem') };
}
function failWrites(key: string, once = false) {
  const original = Storage.prototype.setItem;
  let failed = false;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (name, value) {
    if (name === key && (!once || !failed)) { failed = true; throw new DOMException('Full', 'QuotaExceededError'); }
    return original.call(this, name, value);
  });
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); vi.useRealTimers(); });

describe('synchronous desktop progress persistence', () => {
  it('reduces an ordinary native checkpoint from 8 reads/6 writes to 5 reads/4 writes', () => {
    saveLocalPlaybackHistoryItem(source());
    const { get, set } = countWork();
    expect(applyNativeCheckpoint(checkpoint(), 'a')).toBe(true);
    expect(get).toHaveBeenCalledTimes(5);
    expect(set).toHaveBeenCalledTimes(4);
    expect(set.mock.calls.filter(([key]) => key === DESKTOP_WATCH_PROGRESS_KEY)).toHaveLength(1);
    expect(set.mock.calls.filter(([key]) => key === DESKTOP_WATCHED_SERIES_KEY)).toHaveLength(1);
    // No timers or deferred persistence are needed to observe the new values.
    expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(20);
    expect(loadLocalPlaybackHistory()[0].resumeSeconds).toBe(20);
  });

  it('keeps the missing-history native path at 4 reads/2 durable writes', () => {
    const { get, set } = countWork();
    expect(applyNativeCheckpoint(checkpoint(), 'a')).toBe(true);
    expect(get).toHaveBeenCalledTimes(4);
    expect(set).toHaveBeenCalledTimes(2);
    expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(20);
    expect(loadLocalPlaybackHistory()).toEqual([]);
  });

  it('reduces a new offline checkpoint from 11 reads/6 writes to 8 reads/4 writes', () => {
    const { get, set } = countWork();
    synchronizeOfflineProgress(offlineQueue());
    expect(get).toHaveBeenCalledTimes(8);
    expect(set).toHaveBeenCalledTimes(4);
    expect(set.mock.calls.filter(([key]) => key === DESKTOP_WATCH_PROGRESS_KEY)).toHaveLength(1);
    expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(120);
    expect(loadLocalPlaybackHistory()[0].offlineFile).toBe('01.mkv');
    expect(localStorage.getItem(markerKey)).not.toBeNull();
  });

  it('does not rewrite an unchanged offline marker on every queue poll', () => {
    const queue = offlineQueue();
    expect(synchronizeOfflineProgress(queue)).toBe(true);
    const { get, set } = countWork();
    expect(synchronizeOfflineProgress(queue)).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
    expect(set).not.toHaveBeenCalled();
    synchronizeOfflineProgress({ version: 1, items: [], limitBps: 0 });
    expect(set).not.toHaveBeenCalled();
  });

  it('reads History only once when saving a normal history item', () => {
    const { get } = countWork();
    expect(saveLocalPlaybackHistoryItem(source())).toBe(true);
    expect(get.mock.calls.filter(([key]) => key === historyKey)).toHaveLength(1);
  });

  it('preserves the second merge when older History contributes additional watched intervals', () => {
    saveLocalPlaybackHistoryItem(source({ watchedCoverage: coverage([[70, 80]]), resumeSeconds: 80 }));
    const { set } = countWork();
    expect(applyNativeCheckpoint(checkpoint({ coverage: coverage([[0, 10]]) }), 'a')).toBe(true);
    expect(set.mock.calls.filter(([key]) => key === DESKTOP_WATCH_PROGRESS_KEY)).toHaveLength(2);
    expect(loadDesktopWatchProgress()[0]).toMatchObject({ positionSeconds: 80, progressPercent: 20, completed: false, watchedCoverage: { intervals: [[0, 10], [70, 80]] } });
    expect(loadLocalPlaybackHistory()[0].resumeSeconds).toBe(80);
  });

  it('preserves a legacy History resume baseline without fabricating watched intervals', () => {
    saveLocalPlaybackHistoryItem(source({ watchedCoverage: undefined, resumeSeconds: 80 }));
    applyNativeCheckpoint(checkpoint(), 'a');
    expect(loadDesktopWatchProgress()[0]).toMatchObject({ positionSeconds: 80, progressPercent: 20, watchedCoverage: { intervals: [[0, 20]] } });
  });

  it('retains the original second update for different History metadata', () => {
    saveLocalPlaybackHistoryItem(source({ poster: 'saved-poster' }));
    const { set } = countWork();
    expect(applyNativeCheckpoint(checkpoint(), 'a')).toBe(true);
    expect(set.mock.calls.filter(([key]) => key === DESKTOP_WATCH_PROGRESS_KEY)).toHaveLength(2);
    expect(loadDesktopWatchProgress()[0].poster).toBe('saved-poster');
  });

  it('retains the original merge path when native media duration is not known yet', () => {
    saveLocalPlaybackHistoryItem(source());
    const { set } = countWork();
    expect(applyNativeCheckpoint(checkpoint({ coverage: coverage([], 0) }), 'a')).toBe(true);
    expect(set.mock.calls.filter(([key]) => key === DESKTOP_WATCH_PROGRESS_KEY)).toHaveLength(2);
    expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(10);
    expect(loadLocalPlaybackHistory()[0].resumeSeconds).toBe(10);
  });

  it('merges stale checkpoint coverage without replacing newer history/source timestamps', () => {
    saveLocalPlaybackHistoryItem(source({ savedAt: now + 1000, progressUpdatedAt: now + 1000, watchedCoverage: coverage([[70, 80]]), resumeSeconds: 80, magnet: 'magnet:?xt=urn:btih:' + 'b'.repeat(40) }));
    const before = loadLocalPlaybackHistory()[0];
    expect(applyNativeCheckpoint(checkpoint({ updatedAt: now - 1000, coverage: coverage([[0, 10]]) }), 'a')).toBe(true);
    expect(loadLocalPlaybackHistory()[0]).toEqual(before);
    expect(loadDesktopWatchProgress()[0]).toMatchObject({ updatedAt: now + 1000, positionSeconds: 80, watchedCoverage: { intervals: [[0, 10], [70, 80]] } });
  });

  it('records terminal completion synchronously and clears the matching interrupted recovery', () => {
    saveLocalPlaybackHistoryItem(source());
    markInterruptedPlayback('anilist:42', '2', `hash:${hash}`, 10, 100);
    expect(applyNativeCheckpoint(checkpoint({ state: 'eof', completed: true, coverage: coverage([[0, 93]]) }), 'a')).toBe(true);
    expect(loadDesktopWatchProgress()[0].completed).toBe(true);
    expect(loadLocalPlaybackHistory()[0].completed).toBe(true);
    expect(readInterruptedPlayback()).toBeNull();
  });

  it('does not combine other episodes, provider IDs or incompatible source durations', () => {
    saveLocalPlaybackHistoryItem(source());
    applyNativeCheckpoint(checkpoint({ context: { ...checkpoint().context, animeId: 'mal:42', episode: '3' }, coverage: coverage([[0, 5]]) }), 'a');
    expect(loadDesktopWatchProgress()).toHaveLength(2);
    expect(loadLocalPlaybackHistory()).toHaveLength(1);
    applyNativeCheckpoint(checkpoint({ coverage: coverage([[0, 5]], 200) }), 'a');
    const changed = loadDesktopWatchProgress().find(item => item.animeId === 'anilist:42');
    expect(changed?.watchedCoverage?.intervals).toEqual([[0, 5]]);
    expect(changed?.durationSeconds).toBe(200);
  });

  it('does not write native data for another account', () => {
    const { set } = countWork();
    expect(applyNativeCheckpoint(checkpoint(), 'b')).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it('retains the original second persistence attempt after the first progress write fails', () => {
    saveLocalPlaybackHistoryItem(source());
    failWrites(DESKTOP_WATCH_PROGRESS_KEY, true);
    expect(applyNativeCheckpoint(checkpoint(), 'a')).toBe(true);
    expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(20);
    expect(loadLocalPlaybackHistory()[0].resumeSeconds).toBe(20);
  });

  it('reports failed History persistence for native replay instead of claiming success', () => {
    saveLocalPlaybackHistoryItem(source());
    const fail = failWrites(historyKey);
    expect(applyNativeCheckpoint(checkpoint(), 'a')).toBe(false);
    expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(20);
    expect(loadLocalPlaybackHistory()[0].resumeSeconds).toBe(10);
    fail.mockRestore();
    expect(applyNativeCheckpoint(checkpoint(), 'a')).toBe(true);
    expect(loadLocalPlaybackHistory()[0].resumeSeconds).toBe(20);
  });

  it('leaves offline progress unacknowledged when History cannot be written and retries', () => {
    const fail = failWrites(historyKey);
    expect(synchronizeOfflineProgress(offlineQueue())).toBe(false);
    expect(localStorage.getItem(markerKey)).toBeNull();
    expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(120);
    fail.mockRestore();
    expect(synchronizeOfflineProgress(offlineQueue())).toBe(true);
    expect(loadLocalPlaybackHistory()[0].offlineFile).toBe('01.mkv');
    expect(localStorage.getItem(markerKey)).not.toBeNull();
  });

  it('does not acknowledge missing coverage just because a newer record exists after a failed merge', () => {
    saveLocalPlaybackHistoryItem(source({ episode: 1, savedAt: 200_000, progressUpdatedAt: 200_000, durationSeconds: 1200, watchedCoverage: coverage([[100, 200]], 1200), resumeSeconds: 200 }));
    const queue = offlineQueue();
    queue.items[0].progress!['01.mkv'].watchedCoverage = coverage([[0, 20]], 1200);
    const fail = failWrites(DESKTOP_WATCH_PROGRESS_KEY);
    expect(synchronizeOfflineProgress(queue)).toBe(false);
    expect(localStorage.getItem(markerKey)).toBeNull();
    fail.mockRestore();
    expect(synchronizeOfflineProgress(queue)).toBe(true);
    expect(loadDesktopWatchProgress()[0].watchedCoverage?.intervals).toEqual([[0, 20], [100, 200]]);
    expect(localStorage.getItem(markerKey)).not.toBeNull();
  });

  it('does not acknowledge a checkpoint when watched-series persistence fails', () => {
    const fail = failWrites(DESKTOP_WATCHED_SERIES_KEY);
    expect(applyNativeCheckpoint(checkpoint(), 'a')).toBe(false);
    fail.mockRestore();
    expect(applyNativeCheckpoint(checkpoint(), 'a')).toBe(true);
  });

  it('retries safely after the offline acknowledgement write fails', () => {
    const fail = failWrites(markerKey);
    expect(synchronizeOfflineProgress(offlineQueue())).toBe(false);
    expect(localStorage.getItem(markerKey)).toBeNull();
    fail.mockRestore();
    expect(synchronizeOfflineProgress(offlineQueue())).toBe(true);
    expect(localStorage.getItem(markerKey)).not.toBeNull();
    const { set } = countWork();
    synchronizeOfflineProgress(offlineQueue());
    expect(set).not.toHaveBeenCalled();
  });

  it('reports success without retrying invalid, unlinked or foreign-owner offline data', () => {
    const queue = offlineQueue();
    queue.items[0].progress!['01.mkv'].owner = 'another-owner';
    expect(synchronizeOfflineProgress(queue)).toBe(true);
    queue.items[0].progress!['01.mkv'].owner = null;
    queue.items[0].progress!['01.mkv'].seconds = NaN;
    expect(synchronizeOfflineProgress(queue)).toBe(true);
    queue.items[0].progress!['01.mkv'].seconds = 120;
    queue.items[0].episodeLinks = {};
    expect(synchronizeOfflineProgress(queue)).toBe(true);
    expect(localStorage.getItem(markerKey)).toBeNull();
  });

  it('keeps per-account offline markers separate from legacy guest acknowledgement data', () => {
    const identity = JSON.stringify([hash, '01.mkv', 'anilist:42', 1]);
    localStorage.setItem('streamnyaa.desktop.offlineProgressSync.v1', JSON.stringify({ [identity]: 100_000 }));
    localStorage.setItem('streamnyaa.auth.session', JSON.stringify({ user: { id: 'a' }, access_token: 'test' }));
    const queue = offlineQueue();
    queue.items[0].progress!['01.mkv'].owner = 'a';
    synchronizeOfflineProgress(queue);
    expect(localStorage.getItem(`${markerKey}a`)).not.toBeNull();
    localStorage.setItem('streamnyaa.auth.session', JSON.stringify({ user: { id: 'b' }, access_token: 'test' }));
    const { set } = countWork();
    synchronizeOfflineProgress(queue);
    expect(set).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${markerKey}b`)).toBeNull();
  });
});
