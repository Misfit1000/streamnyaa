import { describe, expect, it } from 'vitest';
import { desktopWatchOrBrowsePath, desktopWatchPath, isUpcomingAnime } from '../../src/lib/desktopAnimeRoute';

describe('desktop provider identity and release status', () => {
  it('does not disable ongoing or finished titles with unknown counts', () => {
    for (const status of ['Currently Airing', 'Finished Airing', 'RELEASING', 'FINISHED']) {
      expect(isUpcomingAnime({ status, episodes: null })).toBe(false);
      expect(desktopWatchOrBrowsePath({ mal_id: 21, title: 'Series', status })).not.toContain('upcoming=1');
    }
  });
  it('recognizes both providers explicit upcoming states', () => {
    for (const status of ['Not yet aired', 'NOT_YET_RELEASED', 'NOT_YET_AIRED', 'UPCOMING']) expect(isUpcomingAnime({ status })).toBe(true);
  });
  it('does not copy MAL identities into the AniList namespace', () => {
    const path = desktopWatchPath({ mal_id: 21, id: 21, anilist_id: null, title: 'Series' });
    expect(path).toContain('mid=21'); expect(path).not.toContain('aid=');
    expect(desktopWatchPath({ mal_id: 21, anilist_id: 999, title: 'Series' })).toContain('aid=999');
    expect(desktopWatchPath({ id: 999, title: 'Series' })).toContain('aid=999');
  });
});
