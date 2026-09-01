import { afterEach, describe, expect, it } from 'vitest';
import {
  desktopScheduleCacheKey,
  readDesktopSchedule,
  writeDesktopSchedule,
} from '../../src/lib/desktopScheduleCache';

describe('desktop schedule cache', () => {
  afterEach(() => window.localStorage.clear());

  it('separates safe and unrestricted schedule views', () => {
    expect(desktopScheduleCacheKey(100, 200, false)).not.toBe(desktopScheduleCacheKey(100, 200, true));
  });

  it('preserves a verified empty day', () => {
    const key = desktopScheduleCacheKey(100, 200, false);
    writeDesktopSchedule(key, { data: [], pagination: { has_next_page: false } }, 1_000);
    expect(readDesktopSchedule(key, 1_100)?.data.data).toEqual([]);
  });

  it('restores populated days and expires old entries', () => {
    const key = desktopScheduleCacheKey(100, 200, false);
    writeDesktopSchedule(key, { data: [{ id: 1, title: 'Frieren' }] }, 1_000);
    expect(readDesktopSchedule(key, 1_100)?.data.data[0].title).toBe('Frieren');
    expect(readDesktopSchedule(key, 1_000 + 15 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
