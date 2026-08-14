import { sourceQualityBucket } from '../../../shared/sources';
import type { TorrentSource } from '../types';

const sourceId = (source: TorrentSource) => source.infoHash || source.magnet;

export function shouldStartSourceRace(enabled: boolean, automaticRecovery: boolean, allowRace: boolean, attempts: number) {
  return enabled && allowRace && !automaticRecovery && attempts === 0;
}

export function selectSourceRaceCandidates(
  rankedSources: TorrentSource[],
  lead: TorrentSource,
  maximumCandidates = 3,
) {
  const quality = sourceQualityBucket(lead.title);
  if (quality === 'other') return [lead];
  const seen = new Set<string>();
  return [lead, ...rankedSources]
    .filter((source) => source.seeders > 0 && sourceQualityBucket(source.title) === quality)
    .filter((source) => {
      const id = sourceId(source);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, Math.max(1, maximumCandidates));
}
