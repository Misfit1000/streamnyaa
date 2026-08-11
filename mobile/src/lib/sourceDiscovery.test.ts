import { describe, expect, it } from 'vitest';
import { sourceQueriesForAnime } from './sourceDiscovery';

const fullmetal = {
  title: 'Fullmetal Alchemist: Brotherhood',
  titles: {
    romaji: 'Hagane no Renkinjutsushi: Fullmetal Alchemist',
    english: 'Fullmetal Alchemist: Brotherhood',
    native: '鋼の錬金術師 FULLMETAL ALCHEMIST',
  },
};

describe('sourceQueriesForAnime', () => {
  it('covers the display title and audio fallback in the mobile fast path', () => {
    const queries = sourceQueriesForAnime(fullmetal, 1, 'dual-preferred');

    expect(queries.slice(0, 6)).toEqual([
      'Fullmetal Alchemist: Brotherhood 01 dual audio',
      'Fullmetal Alchemist: Brotherhood 01',
      'Fullmetal Alchemist 01 dual audio',
      'Fullmetal Alchemist 01',
      'Hagane no Renkinjutsushi: Fullmetal Alchemist 01 dual audio',
      'Hagane no Renkinjutsushi: Fullmetal Alchemist 01',
    ]);
  });

  it('does not duplicate a display title that equals its English title', () => {
    const queries = sourceQueriesForAnime(fullmetal, 1, 'sub-preferred');
    expect(new Set(queries).size).toBe(queries.length);
  });
});
