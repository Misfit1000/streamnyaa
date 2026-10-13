import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  desktopAvailabilityKey, desktopCanonicalAnimeId, isDesktopTitleUnavailable,
  readDesktopAvailability, recordDesktopAvailability, type DesktopAvailabilityRecord,
  DESKTOP_AVAILABILITY_KEY, subscribeDesktopAvailability,
} from '../../src/lib/desktopAvailability';
import { exportDesktopSettingsBackup, importDesktopSettingsBackup } from '../../src/lib/desktop';

describe('shared desktop source evidence', () => {
  afterEach(() => { localStorage.clear(); vi.useRealTimers(); });
  function record(patch: Partial<DesktopAvailabilityRecord> = {}): DesktopAvailabilityRecord {
    return { key:'anilist:123:title', animeId:'anilist:123', scope:'title', status:'unavailable',
      checkedAt:Date.now(), expiresAt:Date.now()+300_000, complete:true, evidence:'no-matching-source', ...patch };
  }
  it('qualifies IDs and never mistakes an episode negative for a title negative', () => {
    expect(desktopCanonicalAnimeId({anilist_id:123,mal_id:456})).toBe('anilist:123');
    expect(desktopCanonicalAnimeId({id:123})).toBe('');
    expect(desktopCanonicalAnimeId({id:123,mal_id:456})).toBe('mal:456');
    expect(desktopAvailabilityKey({mal_id:123},2)).toBe('mal:123:episode-2');
    recordDesktopAvailability(record({key:'anilist:123:episode-2',episode:2,scope:'episode'}));
    expect(isDesktopTitleUnavailable({anilist_id:123})).toBe(false);
    expect(readDesktopAvailability({mal_id:123},2)).toBeNull();
  });
  it('hides only complete unexpired title evidence and expires negatives', () => {
    const now=Date.now();
    recordDesktopAvailability(record({complete:false}));
    expect(isDesktopTitleUnavailable({anilist_id:123})).toBe(false);
    recordDesktopAvailability(record({checkedAt:now+1,expiresAt:now+300_000}));
    expect(isDesktopTitleUnavailable({anilist_id:123},now+1)).toBe(true);
    expect(isDesktopTitleUnavailable({anilist_id:123},now+300_001)).toBe(false);
  });
  it('preserves valid evidence through interrupted refresh and rejects older updates', () => {
    const now=Date.now(); recordDesktopAvailability(record());
    recordDesktopAvailability(record({status:'unknown',complete:false,checkedAt:now+1}));
    expect(readDesktopAvailability({anilist_id:123})?.status).toBe('unavailable');
    recordDesktopAvailability(record({status:'available',checkedAt:now-1}));
    expect(readDesktopAvailability({anilist_id:123})?.status).toBe('unavailable');
  });
  it('rejects malformed scope identity and future-dated records', () => {
    recordDesktopAvailability(record({key:'mal:123:title'}));
    expect(readDesktopAvailability({anilist_id:123})).toBeNull();
    recordDesktopAvailability(record({checkedAt:Date.now()+120_000,expiresAt:Date.now()+300_000}));
    expect(readDesktopAvailability({anilist_id:123})).toBeNull();
  });
  it('keeps original source proof and freshness when Calendar publishes a lightweight positive', () => {
    const now=Date.now();
    const proof=record({key:'anilist:123:episode-2',scope:'episode',episode:2,status:'available',
      sourceHash:'a'.repeat(40),sourceTitle:'Example - 02',playableEpisode:2,checkedAt:now-1000,expiresAt:now+1000});
    recordDesktopAvailability(proof,false);
    recordDesktopAvailability({...proof,sourceHash:undefined,sourceTitle:undefined,checkedAt:now,expiresAt:now+1_200_000},false);
    expect(readDesktopAvailability({anilist_id:123},2)).toEqual(proof);
    vi.useFakeTimers();vi.setSystemTime(now+1001);
    recordDesktopAvailability({...proof,sourceHash:undefined,sourceTitle:undefined,checkedAt:now+1001,expiresAt:now+1_200_000},false);
    expect(readDesktopAvailability({anilist_id:123},2)?.sourceHash).toBeUndefined();
  });
  it('backs up validated evidence and refreshes catalog listeners without regressing newer checks', () => {
    const now=Date.now(); const newer=record({checkedAt:now,expiresAt:now+300_000});
    recordDesktopAvailability(newer,false);
    expect(JSON.parse(exportDesktopSettingsBackup()).keys[DESKTOP_AVAILABILITY_KEY]).toBe(JSON.stringify([newer]));
    const listener=vi.fn(); const stop=subscribeDesktopAvailability(listener);
    importDesktopSettingsBackup(JSON.stringify({keys:{[DESKTOP_AVAILABILITY_KEY]:JSON.stringify([
      record({status:'available',checkedAt:now-10}),record({key:'mal:123:title'}),
    ])}}));
    expect(readDesktopAvailability({anilist_id:123})?.status).toBe('unavailable');
    expect(listener).toHaveBeenCalled(); stop();
  });
});
