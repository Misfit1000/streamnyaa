import type { TorrentSource } from '../types';

export type MobileSourceMode = 'strict' | 'balanced' | 'broad';

export function mobileSourceCompatibilityScore(source: TorrentSource, batterySaver: boolean) {
  const title = source.title || '';
  let score = Number(source.matchScore || 0) * 1.35 + Number(source.sourceScore || 0) + Math.min(24, Math.log2(Math.max(1, source.seeders)) * 3);
  if (/\b(avc|h\.?264|x264)\b/i.test(title)) score += 14;
  if (/\b(hevc|h\.?265|x265|10[ -]?bit)\b/i.test(title)) score -= batterySaver ? 18 : 5;
  if (/\b(av1)\b/i.test(title)) score -= batterySaver ? 28 : 12;
  if (/\b(2160p|4k)\b/i.test(title)) score -= batterySaver ? 32 : 8;
  if (/\b(batch|complete|season pack|complete season)\b/i.test(title)) score -= 8;
  if (source.seeders <= 0) score -= 40;
  if (source.trusted) score += 5;
  if (source.remake) score -= 8;
  return score;
}

export function sourceAllowedByMode(source: TorrentSource, mode: MobileSourceMode, hasMatchScores: boolean) {
  if (!hasMatchScores || mode === 'broad') return true;
  const match = Number(source.matchScore || 0);
  return mode === 'strict' ? match >= 70 : match >= 38;
}
