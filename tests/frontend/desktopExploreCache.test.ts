import { afterEach, describe, expect, it } from 'vitest';
import {
  exploreCatalogCacheKey,
  readDesktopExploreCatalog,
  writeDesktopExploreCatalog,
} from '../../src/lib/desktopExploreCache';

describe('desktop Explore catalog cache', () => {
  afterEach(() => window.localStorage.clear());

  it('builds stable keys independent of object insertion order', () => {
    expect(exploreCatalogCacheKey({ mode: 'trending', genre: 'Any' }))
      .toBe(exploreCatalogCacheKey({ genre: 'Any', mode: 'trending' }));
  });

  it('restores only non-empty verified catalog results', () => {
    const key = exploreCatalogCacheKey({ mode: 'trending' });
    writeDesktopExploreCatalog(key, { data: [] }, 1_000);
    expect(readDesktopExploreCatalog(key, 1_100)).toBeNull();
    writeDesktopExploreCatalog(key, { data: [{ id: 1, title: 'Frieren' }] }, 2_000);
    expect(readDesktopExploreCatalog(key, 2_100)?.data.data[0].title).toBe('Frieren');
  });

  it('expires stale catalog entries', () => {
    const key = exploreCatalogCacheKey({ mode: 'popular' });
    writeDesktopExploreCatalog(key, { data: [{ id: 1 }] }, 1_000);
    expect(readDesktopExploreCatalog(key, 1_000 + 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});

