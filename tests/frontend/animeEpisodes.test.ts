import { describe, expect, it } from 'vitest';
import { airedEpisodeCount, episodeAvailabilityLabel, watchEpisodeCatalogSize } from '../../src/lib/animeEpisodes';

describe('anime episode availability', () => {
  it('shows latest aired episodes separately from the announced total', () => {
    const anime = { status: 'RELEASING', episodes: 27, nextAiringEpisode: { episode: 25 } };
    expect(airedEpisodeCount(anime)).toBe(24);
    expect(episodeAvailabilityLabel(anime)).toBe('24/27');
  });

  it('uses a question mark when the final episode count is unknown', () => {
    expect(episodeAvailabilityLabel({ status: 'RELEASING', latestEpisode: 24 })).toBe('24/?');
  });

  it('treats a finished series as fully aired', () => {
    expect(episodeAvailabilityLabel({ status: 'FINISHED', episodes: 12 })).toBe('12/12');
  });

  it('advances a confirmed scheduled episode after its timestamp passes without guessing later episodes', () => {
    const now = Date.UTC(2026, 9, 18, 12);
    const anime = { status: 'RELEASING', latestEpisode: 1, nextAiringEpisode: { episode: 2, airingAt: (now - 1) / 1000 } };
    expect(airedEpisodeCount(anime, now)).toBe(2);
    expect(airedEpisodeCount({ ...anime, nextAiringEpisode: { episode: 2, airingAt: (now + 1000) / 1000 } }, now)).toBe(1);
    expect(airedEpisodeCount({ ...anime, scheduleStatus: 'postponed' }, now)).toBe(1);
    expect(airedEpisodeCount(anime, now + 7 * 86_400_000)).toBe(2);
  });

  it('shows a manual or safely sourced episode beyond stale metadata without changing the aired count', () => {
    expect(watchEpisodeCatalogSize(1, 2, [], false)).toBe(2);
    expect(watchEpisodeCatalogSize(1, 0, [2], false)).toBe(2);
    expect(watchEpisodeCatalogSize(1, 0, [], false)).toBe(1);
    expect(watchEpisodeCatalogSize(null, 0, [], true)).toBe(0);
    expect(watchEpisodeCatalogSize(1, NaN, [-1, 2.5], false)).toBe(1);
  });
});
