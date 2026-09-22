import { describe, expect, it } from 'vitest';
import { mergeScheduleWatchEvidence, scheduledAiredEpisode, scheduleWatchPath } from '../../src/lib/desktopScheduleWatch';
const record = { title: 'Example', mal_id: 123, anilist_id: 456, airingEpisode: 12, airingAt: 1000, status: 'RELEASING' };
describe('calendar episode handoff', () => {
  it('selects the aired episode in Watch', () => {
    expect(scheduleWatchPath(record)).toContain('ep=12');
    expect(scheduleWatchPath(record)).toContain('mid=123');
  });
  it('keeps the calendar episode when detail metadata lags', () => {
    expect(mergeScheduleWatchEvidence({ mal_id: 123, latestEpisode: 11 }, record).latestEpisode).toBe(12);
    expect(mergeScheduleWatchEvidence({ mal_id: 123, latestEpisode: 13 }, record).latestEpisode).toBe(13);
  });
  it('does not cross identities or fabricate future and postponed releases', () => {
    expect(mergeScheduleWatchEvidence({ mal_id: 124, latestEpisode: 4 }, record).latestEpisode).toBe(4);
    expect(scheduledAiredEpisode({ ...record, airingAt: Date.now() / 1000 + 3600 })).toBeNull();
    for (const status of ['Delayed', 'Postponed', 'Cancelled', 'On hiatus', 'Suspended']) {
      expect(scheduledAiredEpisode({ ...record, scheduleStatus: status })).toBeNull();
    }
    expect(scheduledAiredEpisode({ ...record, airingAt: null })).toBeNull();
  });
  it('handles a first episode despite stale upcoming detail status', () => {
    expect(mergeScheduleWatchEvidence({ mal_id: 123, status: 'NOT_YET_AIRED' }, { ...record, airingEpisode: 1 }).status).toBe('RELEASING');
  });
});
