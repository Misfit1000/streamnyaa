import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestJson } from '../lib/network';
import type { SkipInterval } from '../types';
import { normalizeSkipIntervals, type RawSkipIntervalResponse } from '../lib/skipIntervals';

const API_ORIGIN = 'https://api.aniskip.com';
// v3 invalidates empty entries produced when early progressive streams
// reported a shorter duration than AniSkip's reference episode length.
const CACHE_PREFIX = 'streamnyaa.aniskip.v3';
const FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 24 * 60 * 60 * 1000;

type CachedSkipTimes = {
  expiresAt: number;
  intervals: SkipInterval[];
};

type AniSkipResponse = RawSkipIntervalResponse & {
  found?: boolean;
};

function cacheKey(malId: number, episode: number) {
  return `${CACHE_PREFIX}.${malId}.${episode}`;
}

async function readCached(malId: number, episode: number) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(malId, episode));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedSkipTimes;
    if (!Array.isArray(cached.intervals) || !Number.isFinite(cached.expiresAt)) return null;
    return cached;
  } catch {
    return null;
  }
}

export async function fetchSkipIntervals(malId: number, episode: number, durationSeconds: number, signal?: AbortSignal) {
  if (!Number.isFinite(malId) || malId <= 0 || !Number.isFinite(episode) || episode <= 0 || durationSeconds <= 0) return [];
  const cached = await readCached(malId, episode);
  if (cached && cached.expiresAt > Date.now()) return cached.intervals;

  const params = new URLSearchParams({ episodeLength: String(Math.round(durationSeconds)) });
  params.append('types', 'op');
  params.append('types', 'ed');
  try {
    const payload = await requestJson<AniSkipResponse>(`${API_ORIGIN}/v2/skip-times/${malId}/${episode}?${params}`, {
      signal,
      timeoutMs: 4_000,
    });
    const intervals = payload.found ? normalizeSkipIntervals(payload, durationSeconds) : [];
    const value: CachedSkipTimes = {
      expiresAt: Date.now() + (intervals.length ? FOUND_TTL_MS : EMPTY_TTL_MS),
      intervals,
    };
    await AsyncStorage.setItem(cacheKey(malId, episode), JSON.stringify(value)).catch(() => undefined);
    return intervals;
  } catch {
    return cached?.intervals || [];
  }
}
