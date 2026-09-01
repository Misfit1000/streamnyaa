import { afterEach, describe, expect, it } from 'vitest';
import { readDesktopCatalog, writeDesktopCatalog } from '../../src/lib/desktopCatalogCache';

describe('desktop catalog cache', () => {
  afterEach(() => localStorage.clear());

  it('restores last-known-good catalog data', () => {
    writeDesktopCatalog('home:trending', { data: [{ id: 1, title: 'Frieren' }] }, 1_000);
    expect(readDesktopCatalog('home:trending', 1_100)?.data.data[0].title).toBe('Frieren');
  });

  it('does not replace known data with an ambiguous empty response', () => {
    writeDesktopCatalog('home:trending', { data: [{ id: 1 }] }, 1_000);
    writeDesktopCatalog('home:trending', { data: [] }, 1_100);
    expect(readDesktopCatalog('home:trending', 1_200)?.data.data).toHaveLength(1);
  });

  it('rejects oversized or malformed storage payloads', () => {
    localStorage.setItem('streamnyaa.desktop.catalogs.v1', 'x'.repeat(2_000_001));
    expect(readDesktopCatalog('home:trending')).toBeNull();
  });
});
