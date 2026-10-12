/** React Query may receive an old native/cache response just now. Preserve the
 * provider's absolute expiry instead of starting its freshness window again. */
export function desktopOriginStaleTime(ttlMs: number, state: { data?: unknown; dataUpdatedAt?: number }) {
  const value = state.data as { fetchedAt?: number; streamnyaa?: { fetchedAt?: number }; pages?: Array<{ fetchedAt?: number; streamnyaa?: { fetchedAt?: number } }> } | undefined;
  const records = Array.isArray(value?.pages) && value.pages.length ? value.pages : value ? [value] : [];
  const times = records.map(record => record?.fetchedAt ?? record?.streamnyaa?.fetchedAt)
    .filter((at): at is number => typeof at === 'number' && Number.isFinite(at) && at >= 0);
  if (!times.length) return ttlMs; // Legacy records retain their existing baseline.
  const fetchedAt = Math.min(...times);
  const updatedAt = Number.isFinite(state.dataUpdatedAt) ? state.dataUpdatedAt! : fetchedAt;
  return Math.max(0, ttlMs - Math.max(0, updatedAt - fetchedAt));
}
