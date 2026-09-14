import { beforeEach, describe, expect, it, vi } from 'vitest';
beforeEach(() => { localStorage.clear(); vi.resetModules(); });
describe('Watch snapshot restart recovery', () => {
  it('retains known title identity through a restart without requiring provider access', async () => {
    const first = await import('../../src/lib/desktopWatchSnapshot');
    first.primeDesktopWatchSnapshot('/watch/21-series?mid=21', { mal_id: 21, title: 'Series', status: 'Currently Airing' });
    vi.resetModules();
    const restarted = await import('../../src/lib/desktopWatchSnapshot');
    expect(restarted.readDesktopWatchSnapshot('21-series')).toMatchObject({ mal_id: 21, title: 'Series' });
  });
  it('ignores corrupt persisted snapshots', async () => {
    localStorage.setItem('streamnyaa:desktop-watch-snapshots:v1', '{broken');
    const snapshots = await import('../../src/lib/desktopWatchSnapshot');
    expect(snapshots.readDesktopWatchSnapshot('21-series')).toBeNull();
  });
});
