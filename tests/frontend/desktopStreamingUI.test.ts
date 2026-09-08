import { describe, expect, it } from 'vitest';
import { desktopSearchPath } from '../../src/lib/desktopSearchRoute';

describe('shared desktop search', () => {
  it('retains Explore filters and density when the title changes', () => {
    const url = new URL(desktopSearchPath(' Frieren ', '/search', '?mode=top&genre=Fantasy&view=compact&q=Old'), 'https://fixture.test');
    expect(url.searchParams.get('q')).toBe('Frieren');
    expect(url.searchParams.get('genre')).toBe('Fantasy');
    expect(url.searchParams.get('view')).toBe('compact');
    expect(url.searchParams.get('mode')).toBe('top');
  });
  it('clears only the query, and never carries watch/source parameters into search', () => {
    expect(desktopSearchPath('', '/search', '?q=Old&view=list')).toBe('/search?view=list');
    expect(desktopSearchPath('Title & more', '/watch/10', '?ep=8')).toBe('/search?q=Title+%26+more');
  });
});
