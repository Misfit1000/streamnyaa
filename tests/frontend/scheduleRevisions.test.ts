import { describe, expect, it } from 'vitest';
import {
  enrichDesktopScheduleRevisions,
  loadDesktopScheduleUpdatePreferences,
  readScheduleRevisionRecords,
  readDesktopScheduleUpdates,
  reconcileScheduleRevisions,
  saveDesktopScheduleUpdatePreferences,
  scheduleRevisionKey,
} from '../../src/lib/scheduleRevisions';

function schedule(airingAt: number, overrides: Record<string, unknown> = {}) {
  return {
    anilist_id: 154587,
    mal_id: 52991,
    airingEpisode: 8,
    airingAt,
    title: 'Example anime',
    ...overrides,
  };
}

describe('desktop schedule revision tracking', () => {
  it('uses anime and episode identity rather than the schedule row id', () => {
    expect(scheduleRevisionKey(schedule(1_800_000_000))).toBe('154587:episode-8');
  });

  it('does not label a first observation as delayed or rescheduled', () => {
    const result = reconcileScheduleRevisions([schedule(1_800_000_000)], [], 1_700_000_000_000);
    expect(result.items[0].scheduleStatus).toBeUndefined();
    expect(result.records).toHaveLength(1);
  });

  it('marks a changed airing time as rescheduled and preserves both timestamps', () => {
    const first = reconcileScheduleRevisions([schedule(1_800_000_000)], [], 1_700_000_000_000);
    const moved = reconcileScheduleRevisions([schedule(1_800_007_200)], first.records, 1_700_000_060_000);
    expect(moved.items[0]).toMatchObject({
      scheduleStatus: 'rescheduled',
      rescheduled: true,
      previousAiringAt: 1_800_000_000_000,
      scheduleRevisionSource: 'anilist-schedule-change',
    });
    expect(moved.updates).toEqual([]);
    expect(moved.records[0].airingAt).toBe(1_800_007_200_000);
  });

  it('creates notification updates only for explicit delay or cancellation states', () => {
    const delayed = reconcileScheduleRevisions([
      schedule(1_800_000_000, { scheduleStatus: 'Delayed' }),
    ], [], 1_700_000_000_000);
    const cancelled = reconcileScheduleRevisions([
      schedule(1_800_100_000, { airingEpisode: 9, status: 'CANCELLED' }),
    ], delayed.records, 1_700_000_060_000);
    expect(delayed.updates[0].kind).toBe('delayed');
    expect(cancelled.updates[0].kind).toBe('cancelled');
  });

  it('persists independent personal and global notification preferences', () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) || null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
    };
    expect(loadDesktopScheduleUpdatePreferences(storage)).toMatchObject({ personal: true, global: true });
    saveDesktopScheduleUpdatePreferences({ personal: false, global: true, lastReadAt: 42 }, storage);
    expect(loadDesktopScheduleUpdatePreferences(storage)).toEqual({ personal: false, global: true, lastReadAt: 42 });
  });

  it('does not persist reschedules as delay or cancellation notifications', () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) || null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
    };
    enrichDesktopScheduleRevisions([schedule(1_800_000_000)], storage, 1_700_000_000_000);
    enrichDesktopScheduleRevisions([schedule(1_800_007_200)], storage, 1_700_000_060_000);
    expect(readDesktopScheduleUpdates(storage)).toEqual([]);
    enrichDesktopScheduleRevisions([schedule(1_800_007_200, { isDelayed: true })], storage, 1_700_000_120_000);
    expect(readDesktopScheduleUpdates(storage)[0].kind).toBe('delayed');
  });

  it('ignores sub-minute timestamp noise', () => {
    const first = reconcileScheduleRevisions([schedule(1_800_000_000)], [], 1_700_000_000_000);
    const noisy = reconcileScheduleRevisions([schedule(1_800_000_030)], first.records, 1_700_000_030_000);
    expect(noisy.items[0].scheduleStatus).toBeUndefined();
  });

  it('survives corrupted or unavailable storage without hiding the schedule', () => {
    const storage = {
      getItem: () => '{broken',
      setItem: () => { throw new Error('quota exceeded'); },
    };
    expect(readScheduleRevisionRecords(storage)).toEqual([]);
    expect(enrichDesktopScheduleRevisions([schedule(1_800_000_000)], storage)).toHaveLength(1);
  });
});
