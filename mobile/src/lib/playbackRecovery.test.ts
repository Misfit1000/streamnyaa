import { describe, expect, it } from 'vitest';
import { nextRecoverySource } from './playbackRecovery';
import type { TorrentSource } from '../types';

const candidates: TorrentSource[] = [
  { title: 'dead', magnet: 'magnet:dead', infoHash: 'dead', seeders: 0, leechers: 0 },
  { title: 'failed', magnet: 'magnet:failed', infoHash: 'failed', seeders: 20, leechers: 0 },
  { title: 'healthy', magnet: 'magnet:healthy', infoHash: 'healthy', seeders: 8, leechers: 0 },
];

describe('nextRecoverySource', () => {
  it('skips zero-seeder and already-failed releases', () => {
    expect(nextRecoverySource(candidates, new Set(['failed']), 1)?.infoHash).toBe('healthy');
  });

  it('stops after the third attempted release', () => {
    expect(nextRecoverySource(candidates, new Set(), 3)).toBeUndefined();
  });
});
