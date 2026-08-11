import { describe, expect, it } from 'vitest';
import { manualSourceIntent } from './manualSourceSearch';

describe('manualSourceIntent', () => {
  it('turns a natural episode search into the indexed two-digit query', () => {
    expect(manualSourceIntent('Frieren episode 3')).toEqual({
      title: 'Frieren',
      episode: 3,
      queries: ['Frieren 03', 'Frieren episode 3'],
    });
  });

  it('supports compact episode and hash notation', () => {
    expect(manualSourceIntent('Dandadan ep12').queries[0]).toBe('Dandadan 12');
    expect(manualSourceIntent('Dandadan #7').queries[0]).toBe('Dandadan 07');
    expect(manualSourceIntent('Frieren S2 episode 3').title).toBe('Frieren S2');
  });

  it('leaves release-group and quality searches untouched', () => {
    expect(manualSourceIntent('Frieren 1080p SubsPlease')).toEqual({
      title: 'Frieren 1080p SubsPlease',
      queries: ['Frieren 1080p SubsPlease'],
    });
  });
});
