import { describe, expect, it } from 'vitest';
import { DEFAULT_MOBILE_RESOURCE_POLICY, normalizeMobileResourcePolicy } from '../../../shared/preferences';

describe('normalizeMobileResourcePolicy', () => {
  it('enables balanced sizing and automatic device profiling by default', () => {
    expect(normalizeMobileResourcePolicy()).toMatchObject({
      balancedFileSize: true,
      performanceProfile: 'auto',
    });
  });

  it('keeps a valid override and safely normalizes invalid persisted values', () => {
    expect(normalizeMobileResourcePolicy({ performanceProfile: 'constrained', maxCacheMiB: 1024 })).toMatchObject({
      performanceProfile: 'constrained',
      maxCacheMiB: 1024,
    });
    expect(normalizeMobileResourcePolicy({ performanceProfile: 'invalid' as never, maxCacheMiB: 99 })).toMatchObject({
      performanceProfile: DEFAULT_MOBILE_RESOURCE_POLICY.performanceProfile,
      maxCacheMiB: 512,
    });
  });
});
