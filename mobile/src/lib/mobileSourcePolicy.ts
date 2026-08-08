import type { Anime, TorrentSource } from '../types';

export type MobileSourceMode = 'strict' | 'balanced' | 'broad';

function seasonNumber(value: string) {
  const match = value.match(/\b(?:season|s)[ ._-]*0?(\d{1,2})\b/i)
    || value.match(/\b(\d{1,2})(?:st|nd|rd|th)[ ._-]+season\b/i);
  return match ? Number(match[1]) : undefined;
}

export function mobileSourceCompatibilityScore(source: TorrentSource, batterySaver: boolean, anime?: Pick<Anime, 'title' | 'titles'>) {
  const title = source.title || '';
  let score = Number(source.matchScore || 0) * 1.35 + Number(source.sourceScore || 0) + Math.min(24, Math.log2(Math.max(1, source.seeders)) * 3);
  if (/\b(avc|h\.?264|x264)\b/i.test(title)) score += 14;
  if (/\b(hevc|h\.?265|x265|10[ -]?bit)\b/i.test(title)) score -= batterySaver ? 18 : 5;
  if (/\b(av1)\b/i.test(title)) score -= batterySaver ? 28 : 12;
  if (/\b(2160p|4k)\b/i.test(title)) score -= batterySaver ? 32 : 8;
  if (/\b(batch|complete|season pack|complete season)\b/i.test(title)) score -= 28;
  const expectedSeason = anime ? seasonNumber([anime.title, anime.titles?.romaji, anime.titles?.english].filter(Boolean).join(' ')) : undefined;
  const sourceSeason = seasonNumber(title);
  if (sourceSeason && expectedSeason && sourceSeason !== expectedSeason) score -= 100;
  else if (sourceSeason && sourceSeason > 1 && !expectedSeason) score -= 72;
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
