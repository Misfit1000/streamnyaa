import { describe, expect, it } from 'vitest';
import { normalizeSkipIntervals } from './skipIntervals';

describe('normalizeSkipIntervals', () => {
  it('keeps valid opening and ending intervals in timeline order', () => {
    const intervals = normalizeSkipIntervals({ results: [
      { skipType: 'ed', interval: { startTime: 1320, endTime: 1410 }, episodeLength: 1440 },
      { skipType: 'op', interval: { startTime: 75, endTime: 165 }, episodeLength: 1440 },
    ] }, 1440);
    expect(intervals.map((item) => item.type)).toEqual(['op', 'ed']);
  });

  it('rejects malformed, oversized, unsupported, and out-of-range intervals', () => {
    const intervals = normalizeSkipIntervals({ results: [
      { skipType: 'op', interval: { startTime: -1, endTime: 80 } },
      { skipType: 'ed', interval: { startTime: 100, endTime: 400 } },
      { skipType: 'recap', interval: { startTime: 0, endTime: 30 } },
      { skipType: 'op', interval: { startTime: 1390, endTime: 1500 } },
    ] }, 1440);
    expect(intervals).toEqual([]);
  });
});
