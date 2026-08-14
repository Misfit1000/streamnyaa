import type { TorrentSource } from '../types';

export const MAX_AUTOMATIC_SOURCE_ATTEMPTS = 5;

export function nextRecoverySource(candidates: TorrentSource[], failedSourceIds: ReadonlySet<string>, attempts: number, maximumAttempts = MAX_AUTOMATIC_SOURCE_ATTEMPTS) {
  if (attempts >= maximumAttempts) return undefined;
  return candidates.find((candidate) => candidate.seeders > 0 && !failedSourceIds.has(candidate.infoHash || candidate.magnet));
}
