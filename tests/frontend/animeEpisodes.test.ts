import { describe, expect, it } from 'vitest';
import { airedEpisodeCount, episodeAvailabilityLabel } from '../../src/lib/animeEpisodes';

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
});
