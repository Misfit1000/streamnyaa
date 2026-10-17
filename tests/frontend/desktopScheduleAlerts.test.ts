import { describe, expect, it } from 'vitest';
import { mergeScheduleTracks, scheduleDisplayTime, scheduleUpdateIsPersonal } from '../../src/lib/desktopScheduleAlerts';
import type { DesktopScheduleUpdate } from '../../src/lib/scheduleRevisions';
describe('track-aware Calendar composition', () => {
  it('keeps dub and original rows separate and shares only canonical artwork', () => {
    const base = [{ anilist_id: 1, mal_id: 2, title: 'Original', airingEpisode: 4, airingAt: 500, rescheduled: true, images: { jpg: { image_url: 'cover' } } }];
    const tracks = [{ anilist_id: 1, mal_id: 2, airingEpisode: 4, airingAt: 0, previousAiringAt: 600000, releaseTrack: 'dub', scheduleStatus: 'postponed' }];
    const merged = mergeScheduleTracks(base, tracks);
    expect(merged).toHaveLength(2); expect(merged[1].images).toEqual(base[0].images);
    expect(merged[1].rescheduled).toBe(false); expect(merged[1].postponed).toBe(true);
    expect(scheduleDisplayTime(merged[1])).toBe(600000);
    expect(mergeScheduleTracks(base, [{ ...tracks[0], anilist_id: 99, mal_id: 77 }])[1].images).toBeUndefined();
  });
  it('does not confuse equal numeric IDs from different providers', () => {
    const update: DesktopScheduleUpdate = { id: 'a', key: 'a', animeId: 'anilist:1', anilistId: '1', malId: '2', title: 'A', episode: 1, previousAiringAt: 0, airingAt: 0, detectedAt: 1000, kind: 'delayed' };
    expect(scheduleUpdateIsPersonal(update, [{ mal_id: 1, title: 'Other' }], [])).toBe(false);
    expect(scheduleUpdateIsPersonal(update, [{ mal_id: 2, title: 'A' }], [])).toBe(true);
    expect(scheduleUpdateIsPersonal(update, [{ anilist_id: 1, title: 'A' }], [])).toBe(true);
  });
});
