import type { AudioPreference } from './preferences';

export type SourceQualityInput = {
  title?: string;
  sourceScore?: number;
  seeders?: number | string;
  rawSeeders?: number | string;
  leechers?: number | string;
  sizeBytes?: number;
  rawSize?: number;
};

function has(pattern: RegExp, value = '') {
  return pattern.test(value);
}

export function sourceQualityScore(source: SourceQualityInput) {
  if (typeof source.sourceScore === 'number' && source.sourceScore > 0) {
    return Math.max(0, Math.min(100, Math.round(source.sourceScore)));
  }
  const title = source.title || '';
  const seeders = Number(source.rawSeeders ?? source.seeders ?? 0);
  const sizeBytes = Number(source.rawSize ?? source.sizeBytes ?? 0);
  let score = 35;
  if (seeders >= 100) score += 25;
  else if (seeders >= 50) score += 18;
  else if (seeders >= 15) score += 10;
  else if (seeders > 0) score += 4;
  if (has(/\[(SubsPlease|Erai-raws|Judas|Ember|ASW|Cerberus|Yameii|DKB)\]/i, title)) score += 12;
  if (has(/\b(1080p|2160p|4k)\b/i, title)) score += 8;
  if (has(/\b(hevc|x265|10bit|10-bit)\b/i, title)) score += 7;
  if (has(/\b(dual[\s-]?audio|multi[\s-]?audio|dub|dubbed)\b/i, title)) score += 5;
  if (has(/\b(batch|complete|season pack|complete season)\b/i, title)) score += 4;
  if (seeders === 0) score -= 12;
  if (source.leechers && Number(source.leechers) > seeders * 3) score -= 5;
  const sizeMiB = sizeBytes / (1024 * 1024);
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

export function sourceQualityBucket(title = ''): '2160p' | '1080p' | '720p' | 'other' {
  if (/\b(2160p|4k)\b/i.test(title)) return '2160p';
  if (/\b1080p\b/i.test(title)) return '1080p';
  if (/\b720p\b/i.test(title)) return '720p';
  return 'other';
}

export function parseSizeBytes(value = '') {
  const match = String(value).trim().match(/([\d.]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)/i);
  if (!match) return Number.POSITIVE_INFINITY;
  const amount = Number(match[1]);
  const unit = String(match[2]).toUpperCase().replace('IB', 'B');
  const powers: Record<string, number> = { B: 0, KB: 1, MB: 2, GB: 3, TB: 4 };
  return amount * (1024 ** (powers[unit] ?? 0));
}

export function buildSourceQuery(title: string, episode?: number, audio: AudioPreference = 'sub-preferred') {
  const episodePart = episode ? ` ${String(episode).padStart(2, '0')}` : '';
  const audioPart = audio === 'dub-only' ? ' dub' : audio === 'dual-preferred' ? ' dual audio' : '';
  return `${title}${episodePart}${audioPart}`.trim();
}

export function selectBackupSource<T extends { infoHash?: string; magnet: string; seeders: number }>(
  sources: readonly T[],
  failedSourceIds: ReadonlySet<string>,
) {
  return sources.find((source) => {
    const id = source.infoHash || source.magnet;
    return source.seeders > 0 && !failedSourceIds.has(id);
  });
}

export const SOURCE_PRESETS = [
  { label: 'Best 1080p Sub', query: '1080p', type: 'sub', sourceFilter: 'quality-1080p' },
  { label: 'Best 720p Sub', query: '720p', type: 'sub', sourceFilter: 'quality-720p' },
  { label: 'Dual Audio', query: '1080p', type: 'dub', sourceFilter: 'dual-audio' },
  { label: 'Batch Only', query: '[Batch]', type: 'sub', sourceFilter: 'batch' },
] as const;
