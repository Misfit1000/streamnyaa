import type { NyaaItem } from '../api/nyaa';

function has(pattern: RegExp, value = '') {
  return pattern.test(value);
}

export function sourceQualityScore(source: NyaaItem) {
  if (typeof source.sourceScore === 'number' && source.sourceScore > 0) {
    return Math.max(0, Math.min(100, Math.round(source.sourceScore)));
  }

  const title = source.title || '';
  let score = 35;
  if (source.rawSeeders >= 100) score += 25;
  else if (source.rawSeeders >= 50) score += 18;
  else if (source.rawSeeders >= 15) score += 10;
  else if (source.rawSeeders > 0) score += 4;

  if (has(/\[(SubsPlease|Erai-raws|Judas|Ember|ASW|Cerberus|Yameii|DKB)\]/i, title)) score += 12;
  if (has(/\b(1080p|2160p|4k)\b/i, title)) score += 8;
  if (has(/\b(hevc|x265|10bit|10-bit)\b/i, title)) score += 7;
  if (has(/\b(dual[\s-]?audio|multi[\s-]?audio|dub|dubbed)\b/i, title)) score += 5;
  if (has(/\b(batch|complete|season pack|complete season)\b/i, title)) score += 4;
  if (source.rawSeeders === 0) score -= 12;
  if (source.leechers && Number(source.leechers) > source.rawSeeders * 3) score -= 5;
  const sizeMiB = source.rawSize / (1024 * 1024);
  if (sizeMiB >= 250 && sizeMiB <= 2500) score += 4;
  else if (sizeMiB > 0 && sizeMiB < 120) score -= 6;
  else if (sizeMiB > 6000 && !has(/\b(batch|complete|season pack|complete season)\b/i, title)) score -= 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function sourceQualityLabel(score: number) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Weak';
}

export function sourceFreshnessLabel(source?: Pick<NyaaItem, 'sourceFetchedAt' | 'sourceCacheStatus'>) {
  if (!source?.sourceFetchedAt) return 'Updated recently';
  const seconds = Math.max(0, Math.floor((Date.now() - source.sourceFetchedAt) / 1000));
  const prefix = source.sourceCacheStatus === 'HIT' ? 'Cached' : source.sourceCacheStatus === 'STALE' ? 'Refreshing' : 'Updated';
  if (seconds < 60) return `${prefix} ${seconds || 1} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${prefix} ${minutes} min ago`;
  return `${prefix} ${Math.floor(minutes / 60)} hr ago`;
}

export const SOURCE_PRESETS = [
  { label: 'Best 1080p Sub', query: '1080p', type: 'sub', sourceFilter: 'quality-1080p' },
  { label: 'Best 720p Sub', query: '720p', type: 'sub', sourceFilter: 'quality-720p' },
  { label: 'Dual Audio', query: '1080p', type: 'dub', sourceFilter: 'dual-audio' },
  { label: 'Batch Only', query: '[Batch]', type: 'sub', sourceFilter: 'batch' },
] as const;
