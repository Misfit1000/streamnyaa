import { describe, it, expect } from 'vitest';
import { SourceAccumulator } from '../../src/lib/desktopSourceDiscovery';
import { verifiedAiredEpisodeCount } from '../../src/lib/animeEpisodes';
describe('partial discovery and availability', () => {
  it('preserves verified results through 300 deterministic interrupted discovery cycles', () => {
    for (let episode = 1; episode <= 300; episode++) {
      const sources = new SourceAccumulator<{ id: string }>(items => [...new Map(items.map(item => [item.id, item])).values()]);
      sources.add([{ id: 'exact-' + episode }]); sources.add([]); sources.add([{ id: 'exact-' + episode }]);
      if (episode % 3 !== 0) sources.interrupt();
      expect(sources.result()).toEqual({ items: [{ id: 'exact-' + episode }], complete: episode % 3 === 0 });
    }
  });
  it('distinguishes unknown, upcoming and completed episode counts', () => {
    expect(verifiedAiredEpisodeCount({ status: 'RELEASING', episodes: 24 })).toBeNull();
    expect(verifiedAiredEpisodeCount({ status: 'NOT_YET_RELEASED', episodes: 24 })).toBe(0);
    expect(verifiedAiredEpisodeCount({ status: 'FINISHED', episodes: 24 })).toBe(24);
    expect(verifiedAiredEpisodeCount({ status: 'RELEASING', streamingEpisodes: [{ title: 'Episode 21' }] })).toBe(21);
    expect(verifiedAiredEpisodeCount({ status: 'RELEASING' }, [{ mal_id: 4, aired: '2024-01-01' }, { mal_id: 9, aired: '2099-01-01' }])).toBe(4);
  });
});
