import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeDesktopPlaybackError,
  resolveDesktopPlaybackCheckpoint,
  saveDesktopWatchProgress,
} from '../../src/lib/desktop';

describe('desktop playback compatibility behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps the newest canonical checkpoint even when it is a deliberate backward seek', () => {
    const source = { magnet: 'magnet:?xt=urn:btih:test', title: 'Release A', animeId: 1, animeTitle: 'Example', episode: 4 };
    saveDesktopWatchProgress({
      animeId: 1,
      title: 'Example',
      episode: 4,
      positionSeconds: 840,
      durationSeconds: 1440,
      progressPercent: 58.3,
      updatedAt: 100,
    });
    saveDesktopWatchProgress({
      animeId: 1,
      title: 'Example',
      episode: 4,
      positionSeconds: 300,
      durationSeconds: 1440,
      progressPercent: 20.8,
      updatedAt: 200,
    });

    expect(resolveDesktopPlaybackCheckpoint(source)?.positionSeconds).toBe(300);
  });

  it('reports peer, metadata, stalled-data, engine and player failures distinctly', () => {
    expect(describeDesktopPlaybackError('No peers responded within 20 seconds.')).toMatch(/No peers responded/);
    expect(describeDesktopPlaybackError('no matching playable episode file')).toMatch(/metadata/i);
    expect(describeDesktopPlaybackError('Peers connected, but this release delivered no video data.')).toMatch(/stopped advancing/i);
    expect(describeDesktopPlaybackError('Local stream engine did not become ready in time.')).toMatch(/local torrent engine/i);
    expect(describeDesktopPlaybackError('The native player could not load the stream.')).toMatch(/native video player/i);
  });
});
