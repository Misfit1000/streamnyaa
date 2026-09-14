import { beforeEach, describe, expect, it } from 'vitest';
import { readExplorePresets, sanitizeExplorePreset, writeExplorePresets } from '../../src/lib/desktopExplorePresets';
beforeEach(() => localStorage.clear());
describe('local Explore filter presets', () => {
  it('retains filters but never restores a page, external navigation or credentials', () => {
    expect(sanitizeExplorePreset('mode=ranking&ranking=mal&genre=Fantasy&page=8&next=https://example.com&access_token=secret'))
      .toBe('mode=ranking&ranking=mal&genre=Fantasy');
  });
  it('persists bounded named filters and supports removal', () => {
    writeExplorePresets([{ name: 'My rankings', query: 'mode=ranking&ranking=mal' }]);
    expect(readExplorePresets()).toEqual([{ name: 'My rankings', query: 'mode=ranking&ranking=mal' }]);
    writeExplorePresets([]);
    expect(readExplorePresets()).toEqual([]);
  });
  it('ignores corrupt local data without touching other app settings', () => {
    localStorage.setItem('streamnyaa-desktop-explore-presets-v1', '{');
    localStorage.setItem('unrelated-preference', 'keep');
    expect(readExplorePresets()).toEqual([]);
    expect(localStorage.getItem('unrelated-preference')).toBe('keep');
  });
});
