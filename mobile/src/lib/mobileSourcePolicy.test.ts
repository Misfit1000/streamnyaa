import { describe, expect, it } from 'vitest';
import { compatibleMobileSources, minimumRequiredCacheMiB, rankMobileSources, sourcesWithinCacheLimit } from './mobileSourcePolicy';
import type { TorrentSource } from '../types';

const source = (title: string, seeders: number, sizeMiB: number, extras: Partial<TorrentSource> = {}): TorrentSource => ({
  title,
  seeders,
  leechers: 0,
  infoHash: title.replace(/\W/g, '').toLowerCase(),
  magnet: `magnet:?xt=urn:btih:${title}`,
  size: `${sizeMiB} MiB`,
  sizeBytes: sizeMiB * 1024 * 1024,
  matchScore: 90,
  sourceScore: 50,
  ...extras,
});

describe('rankMobileSources', () => {
  const options = { batterySaver: false, constrained: false, balancedFileSize: true };

  it('prefers the 300 MiB to 1 GiB band before larger and undersized files', () => {
    const ranked = rankMobileSources([
      source('Show 01 1080p x264 large', 500, 1400),
      source('Show 01 1080p x264 tiny', 500, 220),
      source('Show 01 1080p x264 balanced', 20, 700),
    ], options);
    expect(ranked.map((item) => item.sizeBytes)).toEqual([700, 1400, 220].map((value) => value * 1024 * 1024));
  });

  it('always starts a viable 1080p release before a healthier 720p fallback', () => {
    const ranked = rankMobileSources([
      source('Show 01 720p x264 tiny and popular', 900, 420),
      source('Show 01 1080p x264', 4, 1250),
    ], options);
    expect(ranked[0]?.title).toContain('1080p');
    expect(ranked[1]?.title).toContain('720p');
  });

  it('keeps automatic 4K behind 1080p and 720p candidates', () => {
    const ranked = rankMobileSources([
      source('Show 01 2160p HEVC', 500, 900),
      source('Show 01 720p x264', 5, 700),
      source('Show 01 1080p x264', 2, 800),
    ], options);
    expect(ranked.map((item) => item.title)).toEqual([
      'Show 01 1080p x264',
      'Show 01 720p x264',
      'Show 01 2160p HEVC',
    ]);
  });

  it('uses compatibility and seeder health when size balancing is disabled', () => {
    const ranked = rankMobileSources([
      source('Show 01 1080p x264', 8, 700),
      source('Show 01 1080p x264 popular', 120, 1500),
    ], { ...options, balancedFileSize: false });
    expect(ranked[0]?.seeders).toBe(120);
  });

  it('avoids automatic 4K preference on constrained devices', () => {
    const ranked = rankMobileSources([
      source('Show 01 2160p HEVC', 80, 800),
      source('Show 01 1080p x264', 30, 800),
    ], { ...options, constrained: true, batterySaver: true });
    expect(ranked[0]?.title).toContain('1080p');
  });

  it('ranks a broadly supported AVC source ahead of AV1 on constrained devices', () => {
    const ranked = rankMobileSources([
      source('Show 01 1080p AV1', 80, 700),
      source('Show 01 1080p x264', 12, 700),
    ], { ...options, constrained: true, batterySaver: true });
    expect(ranked[0]?.title).toContain('x264');
  });

  it('keeps sequel releases on the requested roman-numeral season', () => {
    const sequel = { title: 'Mushoku Tensei II: Isekai Ittara Honki Dasu' };
    const ranked = rankMobileSources([
      source('Mushoku Tensei S3 - 02 1080p x264', 900, 700),
      source('Mushoku Tensei S2 - 02 1080p x264', 20, 700),
    ], { ...options, anime: sequel });
    expect(ranked[0]?.title).toContain('S2');
  });

  it('hard rejects an explicitly different season for a season-one title', () => {
    const ranked = rankMobileSources([
      source('Re Zero S4 - 01 1080p x264', 900, 700),
      source('Re Zero - 01 1080p x264', 15, 700),
    ], { ...options, anime: { title: 'Re:ZERO -Starting Life in Another World-' }, episode: 1 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.title).toBe('Re Zero - 01 1080p x264');
  });

  it('keeps the manual release browser on the requested season and episode', () => {
    const compatible = compatibleMobileSources([
      source('[SubsPlease] Sousou no Frieren - 03 (720p)', 32, 729),
      source('[Erai-raws] Sousou no Frieren 2nd Season - 03 (1080p)', 80, 865),
      source('[SubsPlease] Sousou no Frieren - 04 (1080p)', 120, 850),
    ], {
      constrained: false,
      anime: { title: 'Frieren: Beyond Journey\'s End', titles: { romaji: 'Sousou no Frieren' }, format: 'TV' },
      episode: 3,
    });

    expect(compatible.map((item) => item.title)).toEqual(['[SubsPlease] Sousou no Frieren - 03 (720p)']);
  });

  it('rejects final-season releases for a franchise base season', () => {
    const ranked = rankMobileSources([
      source('[FFA] Shingeki no Kyojin: The Final Season - 01 1080p HEVC', 900, 700),
      source('[Group] Shingeki no Kyojin - 01 1080p x264', 15, 700),
    ], { ...options, anime: { title: 'Attack on Titan', titles: { romaji: 'Shingeki no Kyojin' } }, episode: 1 });
    expect(ranked.map((item) => item.title)).toEqual(['[Group] Shingeki no Kyojin - 01 1080p x264']);
  });

  it('requires final-season labeling when the requested anime is the final season', () => {
    const ranked = rankMobileSources([
      source('[Group] Shingeki no Kyojin - 01 1080p x264', 900, 700),
      source('[FFA] Shingeki no Kyojin: The Final Season - 01 1080p HEVC', 15, 700),
    ], { ...options, anime: { title: 'Attack on Titan: The Final Season', titles: { romaji: 'Shingeki no Kyojin: The Final Season' } }, episode: 1 });
    expect(ranked.map((item) => item.title)).toEqual(['[FFA] Shingeki no Kyojin: The Final Season - 01 1080p HEVC']);
  });

  it('hard rejects a clearly different single-episode release', () => {
    const ranked = rankMobileSources([
      source('Show - 08 1080p x264', 500, 700),
      source('Show - 02 1080p x264', 20, 700),
    ], { ...options, anime: { title: 'Show' }, episode: 2 });
    expect(ranked.map((item) => item.title)).toEqual(['Show - 02 1080p x264']);
  });

  it('uses zero-seeder releases only when no seeded compatible option exists', () => {
    const ranked = rankMobileSources([
      source('Show - 02 1080p x264 dead', 0, 700),
      source('Show - 02 720p x264 live', 2, 700),
    ], { ...options, anime: { title: 'Show' }, episode: 2 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.seeders).toBe(2);
  });

  it('allows a seeded episode range to reach native per-file cache validation', () => {
    const pack = source('Show - 01 ~ 12 1080p x264', 40, 12_000);
    expect(sourcesWithinCacheLimit([pack], 2048)).toEqual([pack]);
    expect(rankMobileSources([pack], { ...options, anime: { title: 'Show', format: 'TV' }, episode: 8 })).toEqual([pack]);
  });

  it('does not substitute an OVA for a TV episode', () => {
    const ranked = rankMobileSources([
      source('Show OVA 01 1080p x264', 500, 700),
      source('Show - 01 1080p x264', 5, 700),
    ], { ...options, anime: { title: 'Show', format: 'TV' }, episode: 1 });
    expect(ranked.map((item) => item.title)).toEqual(['Show - 01 1080p x264']);
  });

  it('enforces the cache limit and reports the smallest required capacity', () => {
    const candidates = [source('Show 01 1080p x264', 20, 1300), source('Show 01 720p x264', 40, 1500)];
    expect(sourcesWithinCacheLimit(candidates, 1024)).toEqual([]);
    expect(minimumRequiredCacheMiB(candidates)).toBe(1300);
  });
});
