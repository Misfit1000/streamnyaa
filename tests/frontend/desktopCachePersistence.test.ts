import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDesktopCatalog, writeDesktopCatalog } from '../../src/lib/desktopCatalogCache';
import { readDesktopExploreCatalog, readCachedExploreTitles, writeDesktopExploreCatalog } from '../../src/lib/desktopExploreCache';
import { readEpisodePage, saveEpisodePage } from '../../src/lib/desktopEpisodeCache';
import { DESKTOP_AVAILABILITY_KEY, importDesktopAvailabilityRecords, readDesktopAvailability, readDesktopAvailabilityRecords, recordDesktopAvailability, subscribeDesktopAvailability, type DesktopAvailabilityRecord } from '../../src/lib/desktopAvailability';

const catalogKey = 'streamnyaa.desktop.catalogs.v1';
const exploreKey = 'streamnyaa.desktop.explore-catalog.v1';
const episodeKey = 'streamnyaa.desktop.episodePages.v1';
function availability(now = Date.now(), title = 'Original'): DesktopAvailabilityRecord {
  return { key: 'mal:1:episode-1', animeId: 'mal:1', scope: 'episode', episode: 1, status: 'available', checkedAt: now, expiresAt: now + 300_000, complete: true, evidence: title };
}
const cases = [
  { name: 'Home catalog', key: catalogKey, write: (title: string) => writeDesktopCatalog('test', { data: [{ title }] }), read: () => readDesktopCatalog('test')?.data.data[0].title, raw: (title: string) => JSON.stringify([{ key: 'test', savedAt: Date.now(), data: { data: [{ title }] } }]) },
  { name: 'Explore catalog', key: exploreKey, write: (title: string) => writeDesktopExploreCatalog('test', { data: [{ title }] }), read: () => readDesktopExploreCatalog('test')?.data.data[0].title, raw: (title: string) => JSON.stringify([{ key: 'test', savedAt: Date.now(), data: { data: [{ title }] } }]) },
  { name: 'episode pages', key: episodeKey, write: (title: string) => saveEpisodePage('1', 1, { data: [{ mal_id: 1, title }], pagination: { last_visible_page: 1 } }), read: () => readEpisodePage('1', 1)?.data[0].title, raw: (title: string) => JSON.stringify({ version: 1, pages: { '1:1': { savedAt: Date.now(), data: [{ mal_id: 1, title }], pagination: { last_visible_page: 1 } } } }) },
  { name: 'source availability', key: DESKTOP_AVAILABILITY_KEY, write: (title: string) => recordDesktopAvailability(availability(Date.now(), title), false), read: () => readDesktopAvailability('mal:1', 1)?.evidence, raw: (title: string) => JSON.stringify([availability(Date.now(), title)]) },
];

describe('desktop cache durability and raw-storage invalidation', () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('decodes four populated cache collections only once across 240 repeated lookups', () => {
    const now = Date.now();
    const titles = Array.from({ length: 40 }, (_, id) => ({ id: id + 1, title: `Fixture title ${id + 1}`, description: 'Repeated local catalog fixture.' }));
    const fixtures = [
      [catalogKey, JSON.stringify(Array.from({ length: 24 }, (_, id) => ({ key: `catalog:${id}`, savedAt: now, data: { data: titles } })))],
      [exploreKey, JSON.stringify(Array.from({ length: 20 }, (_, id) => ({ key: `explore:${id}`, savedAt: now, data: { data: titles } })))],
      [episodeKey, JSON.stringify({ version: 1, pages: Object.fromEntries(Array.from({ length: 60 }, (_, id) => [`${id + 1}:1`, { savedAt: now, data: Array.from({ length: 20 }, (_, episode) => ({ mal_id: episode + 1, title: `Episode ${episode + 1}` })), pagination: { last_visible_page: 1 } }])) })],
      [DESKTOP_AVAILABILITY_KEY, JSON.stringify(Array.from({ length: 100 }, (_, id) => ({ key: `mal:${id + 1}:title`, animeId: `mal:${id + 1}`, scope: 'title', status: 'available', checkedAt: now, expiresAt: now + 300_000, complete: true })))],
    ];
    fixtures.forEach(([key, raw]) => localStorage.setItem(key, raw));
    const parse = vi.spyOn(JSON, 'parse');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    for (let index = 0; index < 60; index++) {
      expect(readDesktopCatalog('catalog:0', now)).not.toBeNull();
      expect(readDesktopExploreCatalog('explore:0', now)).not.toBeNull();
      expect(readEpisodePage('1', 1)).toBeDefined();
      expect(readDesktopAvailability('mal:1', undefined, now)).not.toBeNull();
    }
    expect(parse).toHaveBeenCalledTimes(4);
    expect(get).toHaveBeenCalledTimes(240);
    expect(set).not.toHaveBeenCalled();
    expect(parse.mock.calls.reduce((sum, [raw]) => sum + raw.length, 0)).toBe(fixtures.reduce((sum, [, raw]) => sum + raw.length, 0));
  });

  it.each(cases)('$name observes direct import, removal, corruption, clear and repaired storage', ({ key, write, read, raw }) => {
    write('Original');
    expect(read()).toBe('Original');
    localStorage.setItem(key, raw('Imported'));
    expect(read()).toBe('Imported');
    localStorage.removeItem(key);
    expect(read()).toBeUndefined();
    localStorage.setItem(key, 'corrupt');
    expect(read()).toBeUndefined();
    localStorage.setItem(key, raw('Repaired'));
    expect(read()).toBe('Repaired');
    localStorage.clear();
    expect(read()).toBeUndefined();
  });

  it.each(cases)('$name never exposes an unsaved update after quota failure', ({ write, read }) => {
    write('Durable');
    expect(read()).toBe('Durable');
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    write('Unsaved');
    expect(read()).toBe('Durable');
    set.mockRestore();
  });

  it('does not let mutations of returned objects change subsequent cache reads', () => {
    writeDesktopCatalog('test', { data: [{ title: 'Home', nested: { value: 1 } }] });
    readDesktopCatalog('test')!.data.data[0].nested.value = 2;
    expect(readDesktopCatalog('test')!.data.data[0].nested.value).toBe(1);
    writeDesktopExploreCatalog('test', { data: [{ title: 'Explore', nested: { value: 1 } }] });
    readDesktopExploreCatalog('test')!.data.data[0].nested.value = 2;
    readCachedExploreTitles()[0].nested.value = 3;
    expect(readDesktopExploreCatalog('test')!.data.data[0].nested.value).toBe(1);
    saveEpisodePage('1', 1, { data: [{ mal_id: 1, title: 'Episode' }], pagination: { last_visible_page: 1 } });
    readEpisodePage('1', 1)!.data[0].title = 'Modified';
    expect(readEpisodePage('1', 1)!.data[0].title).toBe('Episode');
    recordDesktopAvailability(availability(), false);
    readDesktopAvailability('mal:1', 1)!.evidence = 'Modified';
    readDesktopAvailabilityRecords()[0].evidence = 'Modified again';
    expect(readDesktopAvailability('mal:1', 1)!.evidence).toBe('Original');
  });

  it('keeps cache validation and expiry dynamic without reparsing unchanged JSON', () => {
    const now = Date.now();
    vi.useFakeTimers(); vi.setSystemTime(now);
    saveEpisodePage('1', 1, { data: [{ mal_id: 1, title: 'Episode' }], pagination: { last_visible_page: 1 } });
    expect(readEpisodePage('1', 1)).toBeDefined();
    vi.setSystemTime(now + 31 * 86_400_000);
    expect(readEpisodePage('1', 1)).toBeUndefined();
    vi.setSystemTime(now);
    localStorage.setItem(DESKTOP_AVAILABILITY_KEY, JSON.stringify([availability(now + 120_000)]));
    expect(readDesktopAvailabilityRecords()).toEqual([]);
    vi.setSystemTime(now + 60_001);
    expect(readDesktopAvailabilityRecords()).toHaveLength(1);
  });

  it('merges imported availability without stale cached evidence or age regression', () => {
    const now = Date.now();
    recordDesktopAvailability(availability(now), false);
    readDesktopAvailabilityRecords();
    expect(importDesktopAvailabilityRecords(JSON.stringify([availability(now + 1, 'Imported')]))).toBe(1);
    expect(readDesktopAvailability('mal:1', 1)!.evidence).toBe('Imported');
    importDesktopAvailabilityRecords(JSON.stringify([availability(now - 1, 'Older')]));
    expect(readDesktopAvailability('mal:1', 1)!.evidence).toBe('Imported');
  });

  it('refreshes availability subscribers for an external clear event', () => {
    recordDesktopAvailability(availability(), false);
    const listener = vi.fn(() => readDesktopAvailabilityRecords());
    const stop = subscribeDesktopAvailability(listener);
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.results[0].value).toEqual([]);
    stop();
  });
});
