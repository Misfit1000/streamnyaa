import { beforeEach, describe, expect, it } from 'vitest';
import { synchronizeOfflineProgress } from '../../src/lib/desktopOfflineProgress';
import { loadDesktopWatchProgress, saveDesktopWatchProgress, loadLocalPlaybackHistory, clearLocalPlaybackHistory } from '../../src/lib/desktop';
import type { DesktopDownloadQueue } from '../../src/lib/desktopDownloads';

const queue = (): DesktopDownloadQueue => ({ version: 1, limitBps: 0, items: [{ id: 'a'.repeat(40), magnet: 'magnet:?xt=urn:btih:'+'a'.repeat(40), title: 'Release', state: 'completed', downloaded: 1, total: 1,
  progress: { '01.mkv': { seconds: 120, duration: 1200, updatedAt: 100, completed: false } },
  episodeLinks: { '01.mkv': { animeId: 'anilist:42', title: 'Example', episode: 1 } } }] });
beforeEach(() => localStorage.clear());
describe('Offline episode progress', () => {
  it('updates the shared history path only for an explicitly linked file', () => {
    const data = queue(); data.items[0].progress!['02.mkv'] = {seconds:500,duration:1200,updatedAt:101,completed:false};
    synchronizeOfflineProgress(data);
    expect(loadDesktopWatchProgress()).toHaveLength(1);
    expect(loadDesktopWatchProgress()[0]).toMatchObject({animeId:'anilist:42',episode:1,positionSeconds:120,updatedAt:100000});
  });
  it('does not overwrite newer online progress or confuse provider identities', () => {
    saveDesktopWatchProgress({animeId:'anilist:42',title:'Example',episode:1,positionSeconds:900,durationSeconds:1200,updatedAt:200000});
    synchronizeOfflineProgress(queue());
    expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(900);
    const data=queue(); data.items[0].episodeLinks!['01.mkv'].animeId='42'; synchronizeOfflineProgress(data);
    expect(loadDesktopWatchProgress()).toHaveLength(2);
  });
  it('keeps offline replay identity in History and does not resurrect cleared history', () => {
    const data=queue(); synchronizeOfflineProgress(data);
    expect(loadLocalPlaybackHistory()[0]).toMatchObject({offlineDownloadId:'a'.repeat(40),offlineFile:'01.mkv'});
    clearLocalPlaybackHistory(); synchronizeOfflineProgress(data);
    expect(loadLocalPlaybackHistory()).toHaveLength(0);
    expect(loadDesktopWatchProgress()).toHaveLength(0);
  });
  it('ignores corrupt telemetry and unlinked files', () => {
    const data=queue(); data.items[0].progress!['01.mkv'].seconds=NaN; synchronizeOfflineProgress(data);
    data.items[0].progress!['01.mkv'].seconds=10; data.items[0].episodeLinks={}; synchronizeOfflineProgress(data);
    expect(loadDesktopWatchProgress()).toHaveLength(0);
  });
});
