import { beforeEach, describe, expect, it } from 'vitest';
import { readExplorePresets, sanitizeExplorePreset, writeExplorePresets, presetSummary, meaningfulPreset } from '../../src/lib/desktopExplorePresets';
beforeEach(() => localStorage.clear());
describe('local Explore filter presets', () => {
    it('retains only meaningful filters and drops provider, layout, credentials and pagination', () => { expect(sanitizeExplorePreset('mode=ranking&ranking=mal&genre=Fantasy&view=list&page=8&access_token=secret')).toBe('mode=ranking&genre=Fantasy'); });
    it('migrates v1 once while preserving identity and names', () => { localStorage.setItem('streamnyaa-desktop-explore-presets-v1', JSON.stringify([{ name: 'My rankings', query: 'mode=ranking&ranking=mal&page=3' }])); const first = readExplorePresets(); expect(first[0]).toMatchObject({ name: 'My rankings', query: 'mode=ranking' }); expect(readExplorePresets()[0].id).toBe(first[0].id); writeExplorePresets([]); expect(readExplorePresets()).toEqual([]); });
    it('canonicalizes filters for duplicate detection and readable summaries', () => { expect(sanitizeExplorePreset('genre=Fantasy&mode=new')).toBe(sanitizeExplorePreset('mode=new&genre=Fantasy')); expect(presetSummary('mode=new&genre=Fantasy&released=7')).toBe('New episodes · Fantasy · Past 7 days'); expect(meaningfulPreset('view=list&page=4')).toBe(false); });
    it('ignores corrupt data without changing unrelated settings', () => { localStorage.setItem('streamnyaa-desktop-explore-presets-v1', '{'); localStorage.setItem('unrelated', 'keep'); expect(readExplorePresets()).toEqual([]); expect(localStorage.getItem('unrelated')).toBe('keep'); });
});
