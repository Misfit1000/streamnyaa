import { describe, expect, it, vi } from 'vitest';
import { applyScheduleAlertState, readScheduleAlertState, mergeScheduleTracks, scheduleDisplayTime, scheduleUpdateIsPersonal, subscribeScheduleTracks } from '../../src/lib/desktopScheduleAlerts';
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
describe('native schedule publication',()=>{
  it('publishes live updates even when frontend persistence fails',()=>{
    const listener=vi.fn();const unsubscribe=subscribeScheduleTracks(listener);
    const storage=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Full');});
    applyScheduleAlertState({version:1,tracks:[{canonicalId:'anilist:1',releaseTrack:'dub'}],changes:[],persistenceError:'Native cache is read-only'});
    expect(readScheduleAlertState().tracks[0].releaseTrack).toBe('dub');expect(readScheduleAlertState().persistenceError).toBe('Native cache is read-only');expect(listener).toHaveBeenCalledOnce();
    storage.mockRestore();unsubscribe();
  });
  it('rejects version zero and clears an error after successful recovery',()=>{
    applyScheduleAlertState({version:1,tracks:[{title:'Valid'}],changes:[]});
    applyScheduleAlertState({version:0,tracks:[],changes:[]});expect(readScheduleAlertState().tracks[0].title).toBe('Valid');expect(readScheduleAlertState().persistenceError).toBeUndefined();
  });
});
