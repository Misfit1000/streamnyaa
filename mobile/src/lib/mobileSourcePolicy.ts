import type { Anime, TorrentSource } from '../types';

export type MobileSourceMode = 'strict' | 'balanced' | 'broad';

const MIB = 1024 * 1024;
const BALANCED_MIN_BYTES = 300 * MIB;
const BALANCED_MAX_BYTES = 1024 * MIB;
const FINAL_SEASON = 99;

function seasonNumber(value: string) {
  if (/\b(?:the[ ._-]+)?final[ ._-]+season\b/i.test(value)) return FINAL_SEASON;
  const match = value.match(/\b(?:season|s)[ ._-]*0?(\d{1,2})\b/i)
    || value.match(/\b(\d{1,2})(?:st|nd|rd|th)[ ._-]+season\b/i);
  if (match) return Number(match[1]);
  const roman = value.match(/\b(II|III|IV|V|VI)(?=\s*:|\s*$)/i)?.[1]?.toUpperCase();
  return roman ? ({ II: 2, III: 3, IV: 4, V: 5, VI: 6 } as const)[roman as 'II' | 'III' | 'IV' | 'V' | 'VI'] : undefined;
}

function expectedSeason(anime?: Pick<Anime, 'title' | 'titles'>) {
  if (!anime) return undefined;
  return seasonNumber([anime.title, anime.titles?.romaji, anime.titles?.english].filter(Boolean).join(' '));
}

export function sourceMatchesAnimeSeason(source: TorrentSource, anime?: Pick<Anime, 'title' | 'titles'>) {
  const requested = expectedSeason(anime);
  const candidate = seasonNumber(source.title || '');
  if (requested === FINAL_SEASON) return candidate === FINAL_SEASON;
  if (!candidate) return true;
  if (requested) return candidate === requested;
  return candidate === 1;
}

export function sourceIsMultiEpisodePack(source: TorrentSource) {
  const title = source.title || '';
  return /\b(batch|complete|season pack|complete season)\b/i.test(title)
    || /(?:^|[^0-9])(\d{1,4})\s*(?:~|–|—)\s*(\d{1,4})(?:[^0-9]|$)/i.test(title);
}

export function sourceMatchesAnimeFormat(source: TorrentSource, anime?: Pick<Anime, 'format'>) {
  if (!anime?.format || !/^TV|ONA$/i.test(anime.format)) return true;
  return !/(?:^|[\s[_(.-])(ova|oad|special|movie|ncop|nced)(?:[\s\]_),.-]|$)/i.test(source.title || '');
}

export function sourceMatchesEpisode(source: TorrentSource, episode?: number) {
  if (!episode) return true;
  const title = source.title || '';
  const range = title.match(/(?:^|[^0-9])(\d{1,4})\s*(?:~|–|—)\s*(\d{1,4})(?:[^0-9]|$)/i);
  if (range) {
    const first = Number(range[1]);
    const last = Number(range[2]);
    if (Number.isFinite(first) && Number.isFinite(last)) return episode >= Math.min(first, last) && episode <= Math.max(first, last);
  }
  if (sourceIsMultiEpisodePack(source)) return true;
  const explicit = [
    ...title.matchAll(/\bs\d{1,2}[ ._-]*e(?:p(?:isode)?)?[ ._-]*0*(\d{1,4})\b/gi),
    ...title.matchAll(/(?:^|[^a-z0-9])(?:ep|episode|e)[ ._-]*0*(\d{1,4})(?:[^0-9]|$)/gi),
    ...title.matchAll(/\s[-–—][ ._-]*0*(\d{1,4})(?:v\d+)?(?:\s|\[|\(|$)/gi),
  ].map((match) => Number(match[1])).filter(Number.isFinite);
  return !explicit.length || explicit.includes(episode);
}

export function sourceSupportedForProfile(source: TorrentSource, constrained: boolean) {
  if (!constrained) return true;
  return !/\b(2160p|4k|av1)\b/i.test(source.title || '');
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

function automaticQualityTier(source: TorrentSource) {
  const title = source.title || '';
  if (/\b1080p\b/i.test(title)) return 0;
  if (/\b720p\b/i.test(title)) return 1;
  if (/\b(480p|576p)\b/i.test(title)) return 2;
  if (/\b(2160p|4k)\b/i.test(title)) return 4;
  return 3;
}

export function mobileSourceSizeTier(source: TorrentSource, balancedFileSize: boolean) {
  if (!balancedFileSize) return 0;
  if (sourceIsMultiEpisodePack(source)) return 1;
  const bytes = Number(source.sizeBytes || 0);
  if (bytes >= BALANCED_MIN_BYTES && bytes <= BALANCED_MAX_BYTES) return 0;
  if (bytes > BALANCED_MAX_BYTES) return 1;
  if (bytes > 0 && bytes < BALANCED_MIN_BYTES) return 2;
  return 3;
}

export function compareMobileSources(
  left: TorrentSource,
  right: TorrentSource,
  options: { batterySaver: boolean; constrained: boolean; balancedFileSize: boolean; anime?: Pick<Anime, 'title' | 'titles' | 'format'> },
) {
  // Automatic playback is deliberately 1080p-first. File size, codec and
  // popularity decide between 1080p releases; lower resolutions are recovery
  // candidates only after every viable 1080p release has been exhausted.
  const leftQuality = automaticQualityTier(left);
  const rightQuality = automaticQualityTier(right);
  if (leftQuality !== rightQuality) return leftQuality - rightQuality;
  const leftTier = mobileSourceSizeTier(left, options.balancedFileSize);
  const rightTier = mobileSourceSizeTier(right, options.balancedFileSize);
  if (leftTier !== rightTier) return leftTier - rightTier;
  const compatibility = mobileSourceCompatibilityScore(right, options.batterySaver, options.anime)
    - mobileSourceCompatibilityScore(left, options.batterySaver, options.anime);
  if (compatibility) return compatibility;
  if (right.seeders !== left.seeders) return right.seeders - left.seeders;
  if (Boolean(right.trusted) !== Boolean(left.trusted)) return right.trusted ? 1 : -1;
  return Number(right.sizeBytes || 0) - Number(left.sizeBytes || 0);
}

export function rankMobileSources(
  sources: TorrentSource[],
  options: { batterySaver: boolean; constrained: boolean; balancedFileSize: boolean; anime?: Pick<Anime, 'title' | 'titles' | 'format'>; episode?: number },
) {
  const compatible = compatibleMobileSources(sources, options);
  const seeded = compatible.filter((source) => source.seeders > 0);
  return [...(seeded.length ? seeded : compatible)].sort((left, right) => compareMobileSources(left, right, options));
}

export function compatibleMobileSources(
  sources: TorrentSource[],
  options: { constrained: boolean; anime?: Pick<Anime, 'title' | 'titles' | 'format'>; episode?: number },
) {
  return sources.filter((source) => sourceMatchesAnimeSeason(source, options.anime)
    && sourceMatchesAnimeFormat(source, options.anime)
    && sourceMatchesEpisode(source, options.episode)
    && sourceSupportedForProfile(source, options.constrained));
}

export function sourcesWithinCacheLimit(sources: TorrentSource[], maxCacheMiB: number) {
  const limitBytes = Math.max(0, maxCacheMiB) * MIB;
  return sources.filter((source) => sourceIsMultiEpisodePack(source) || !source.sizeBytes || source.sizeBytes <= limitBytes);
}

export function minimumRequiredCacheMiB(sources: TorrentSource[]) {
  const smallestKnownSource = sources
    .filter((source) => !sourceIsMultiEpisodePack(source))
    .map((source) => Number(source.sizeBytes || 0))
    .filter((bytes) => bytes > 0)
    .sort((left, right) => left - right)[0];
  return smallestKnownSource ? Math.ceil(smallestKnownSource / MIB) : undefined;
}

export function sourceAllowedByMode(source: TorrentSource, mode: MobileSourceMode, hasMatchScores: boolean) {
  if (!hasMatchScores || mode === 'broad') return true;
  const match = Number(source.matchScore || 0);
  return mode === 'strict' ? match >= 70 : match >= 38;
}
