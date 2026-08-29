import { describe, expect, it } from 'vitest';
import type { NyaaItem } from '../../src/api/nyaa';
import { getTorrentBadges, sourceResolutionLabel, torrentMatchesSourceFilter } from '../../src/lib/torrentBadges';

function source(title: string): NyaaItem {
  return {
    title,
    link: 'https://nyaa.si/view/1',
    infoHash: 'a'.repeat(40),
    size: '1.2 GiB',
    rawSize: 1.2 * 1024 * 1024 * 1024,
    seeders: '20',
    rawSeeders: 20,
    leechers: '1',
    magnet: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
    category: 'Anime - English-translated',
    categoryId: '1_2',
    pubDate: '',
  };
}

describe('high-resolution source labels', () => {
  it('labels 4K and 2K releases and exposes their explicit filters', () => {
    const fourK = source('[Group] Anime S01E02 2160p UHD HEVC');
    const twoK = source('[Group] Anime S01E02 1440p HEVC');

    expect(sourceResolutionLabel(fourK.title)).toBe('4K / 2160p');
    expect(sourceResolutionLabel(twoK.title)).toBe('2K / 1440p');
    expect(getTorrentBadges(fourK)).toContainEqual({ label: '4K / 2160p', tone: 'quality' });
    expect(getTorrentBadges(twoK)).toContainEqual({ label: '2K / 1440p', tone: 'quality' });
    expect(torrentMatchesSourceFilter(fourK, 'quality-2160p')).toBe(true);
    expect(torrentMatchesSourceFilter(twoK, 'quality-1440p')).toBe(true);
  });

  it('does not mislabel standard 1080p as an above-standard upgrade', () => {
    const standard = source('[Group] Anime S01E02 1080p AVC');
    expect(sourceResolutionLabel(standard.title)).toBe('1080p');
    expect(getTorrentBadges(standard).some((badge) => badge.tone === 'quality')).toBe(false);
  });
});
