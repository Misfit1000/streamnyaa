import { describe, expect, it } from 'vitest';
import { selectSourceRaceCandidates, shouldStartSourceRace } from './sourceRace';
import type { TorrentSource } from '../types';

const source = (title: string, seeders: number): TorrentSource => ({
  title,
  seeders,
  leechers: 0,
  infoHash: title.replace(/\W/g, '').toLowerCase(),
  magnet: `magnet:?xt=urn:btih:${title}`,
});

describe('selectSourceRaceCandidates', () => {
  it('runs only for an enabled initial automatic source choice', () => {
    expect(shouldStartSourceRace(true, false, true, 0)).toBe(true);
    expect(shouldStartSourceRace(false, false, true, 0)).toBe(false);
    expect(shouldStartSourceRace(true, true, true, 0)).toBe(false);
    expect(shouldStartSourceRace(true, false, false, 0)).toBe(false);
    expect(shouldStartSourceRace(true, false, true, 1)).toBe(false);
  });

  it('selects only distinct seeded releases matching the lead quality', () => {
    const lead = source('Show 01 1080p x264', 8);
    const second = source('Show 01 1080p HEVC', 20);
    const selected = selectSourceRaceCandidates([
      lead,
      second,
      source('Show 01 720p x264', 100),
      source('Show 01 1080p dead', 0),
      second,
    ], lead, 3);
    expect(selected.map((item) => item.title)).toEqual([lead.title, second.title]);
  });

  it('caps constrained devices at two candidates', () => {
    const candidates = [
      source('Show 01 1080p A', 9),
      source('Show 01 1080p B', 8),
      source('Show 01 1080p C', 7),
    ];
    expect(selectSourceRaceCandidates(candidates, candidates[0]!, 2)).toHaveLength(2);
  });

  it('does not race releases whose resolution cannot be verified', () => {
    const candidates = [source('Show 01 x264 A', 9), source('Show 01 x264 B', 8)];
    expect(selectSourceRaceCandidates(candidates, candidates[0]!, 3)).toEqual([candidates[0]]);
  });
});
