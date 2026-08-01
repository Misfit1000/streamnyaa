import type { NyaaItem } from '../api/nyaa';
import {
  SOURCE_PRESETS,
  sourceQualityLabel,
  sourceQualityScore as sharedSourceQualityScore,
} from '../../shared/sources';

export function sourceQualityScore(source: NyaaItem) {
  return sharedSourceQualityScore(source);
}

export { SOURCE_PRESETS, sourceQualityLabel };

export function sourceFreshnessLabel(source?: Pick<NyaaItem, 'sourceFetchedAt' | 'sourceCacheStatus'>) {
  if (!source?.sourceFetchedAt) return 'Updated recently';
  const seconds = Math.max(0, Math.floor((Date.now() - source.sourceFetchedAt) / 1000));
  const prefix = source.sourceCacheStatus === 'HIT' ? 'Cached' : source.sourceCacheStatus === 'STALE' ? 'Refreshing' : 'Updated';
  if (seconds < 60) return `${prefix} ${seconds || 1} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${prefix} ${minutes} min ago`;
  return `${prefix} ${Math.floor(minutes / 60)} hr ago`;
}
