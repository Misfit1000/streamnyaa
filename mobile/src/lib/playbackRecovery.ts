import type { TorrentSource } from '../types';

export function nextRecoverySource(candidates: TorrentSource[], failedSourceIds: ReadonlySet<string>, attempts: number, maximumAttempts = 3) {
  if (attempts >= maximumAttempts) return undefined;
  return candidates.find((candidate) => candidate.seeders > 0 && !failedSourceIds.has(candidate.infoHash || candidate.magnet));
}
