import type { SkipInterval } from '../types';

export type RawSkipIntervalResponse = {
  results?: Array<{
    interval?: { startTime?: number; endTime?: number };
    skipType?: string;
    episodeLength?: number;
  }>;
};

export function normalizeSkipIntervals(payload: RawSkipIntervalResponse, durationSeconds: number): SkipInterval[] {
  return (payload.results || []).flatMap((result) => {
    const type = result.skipType === 'op' ? 'op' : result.skipType === 'ed' ? 'ed' : null;
    const startSeconds = Number(result.interval?.startTime);
    const endSeconds = Number(result.interval?.endTime);
    const episodeLength = Number(result.episodeLength || durationSeconds);
    if (!type || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) return [];
    if (startSeconds < 0 || endSeconds <= startSeconds || endSeconds - startSeconds > 180) return [];
    if (endSeconds > durationSeconds + 5) return [];
    return [{ type, startSeconds, endSeconds, episodeLength } satisfies SkipInterval];
  }).sort((left, right) => left.startSeconds - right.startSeconds);
}
