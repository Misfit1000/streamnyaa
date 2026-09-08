export type DesktopDataStatus = 'fresh' | 'stale' | 'empty' | 'offline' | 'timeout' | 'rate-limited' | 'access-denied' | 'invalid' | 'cancelled' | 'error';

export type DesktopDataCacheState = 'memory' | 'disk' | 'network' | 'none';

export type DesktopDataErrorCode = Exclude<DesktopDataStatus, 'fresh' | 'stale' | 'empty'>;

export type DesktopDataErrorDetails = {
  code: DesktopDataErrorCode;
  provider: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
  retryAfterMs?: number;
};

export type DesktopDataResult<T> = {
  data: T;
  status: DesktopDataStatus;
  provider: string;
  cacheState: DesktopDataCacheState;
  stale: boolean;
  fetchedAt: number;
  durationMs?: number;
  error?: DesktopDataErrorDetails;
  complete?: boolean;
  refreshing?: boolean;
};

export class DesktopDataError extends Error {
  readonly code: DesktopDataErrorCode;
  readonly provider: string;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;

  constructor(details: DesktopDataErrorDetails) {
    super(details.message);
    this.name = 'DesktopDataError';
    this.code = details.code;
    this.provider = details.provider;
    this.retryable = details.retryable;
    this.statusCode = details.statusCode;
    this.retryAfterMs = details.retryAfterMs;
  }
}

export function desktopDataError(provider: string, error: unknown, statusCode?: number) {
  if (error instanceof DesktopDataError) return error;
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const native = error as DesktopDataErrorDetails;
    if (['offline', 'timeout', 'rate-limited', 'access-denied', 'invalid', 'cancelled', 'error'].includes(native.code)) {
      return new DesktopDataError({ ...native, provider: native.provider || provider });
    }
  }
  const message = error instanceof Error ? error.message : String(error || 'Data request failed.');
  const normalized = message.toLowerCase();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const code: DesktopDataErrorCode = statusCode === 403 ? 'access-denied' : offline
    ? 'offline'
    : statusCode === 429
      ? 'rate-limited'
      : /abort|cancel/.test(normalized)
        ? 'cancelled'
        : /timeout|timed out/.test(normalized)
          ? 'timeout'
          : /parse|invalid|json/.test(normalized)
            ? 'invalid'
            : 'error';
  return new DesktopDataError({
    code,
    provider,
    message,
    retryable: !['invalid', 'cancelled', 'access-denied'].includes(code),
    statusCode,
  });
}

export type EpisodeCatalogSource = 'authoritative' | 'estimated';

export type EpisodeCatalogResult<T> = DesktopDataResult<T> & {
  catalogSource: EpisodeCatalogSource;
  episodeCount: number;
};

export type SourceSearchResult<T> = DesktopDataResult<T[]> & {
  complete: boolean;
  attemptedQueryGroups: string[];
  providerErrors: DesktopDataErrorDetails[];
};
