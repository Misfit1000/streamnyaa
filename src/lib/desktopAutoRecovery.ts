import type { QueryClient } from '@tanstack/react-query';

export const recoveryDelay = (attempt: number) => [5_000, 15_000, 30_000, 60_000][Math.min(attempt, 3)];

/** One recovery scheduler for observed public data, never a retry loop for mutations/auth. */
export function installDesktopAutoRecovery(client: QueryClient) {
  const pending = new Map<string, { at: number; attempt: number; observedAt: number }>();
  const tick = () => {
    if (navigator.onLine === false || document.visibilityState === 'hidden') return;
    const queries = client.getQueryCache().getAll();
    const live = new Set(queries.map(query => query.queryHash));
    for (const key of pending.keys()) if (!live.has(key)) pending.delete(key);
    for (const query of queries) {
      const prefix = String(query.queryKey[0] || '');
      if (!/anime|episode|source|schedule|season|trending|popular|explore|search|catalog|installments/i.test(prefix)
        || /auth|account|login|profile/i.test(prefix)) continue;
      if (!query.isActive()) { pending.delete(query.queryHash); continue; }
      const value = query.state.data as { complete?: boolean; retryAfterMs?: number; streamnyaa?: { status?: string } } | undefined;
      const needsRecovery = query.state.status === 'error' || value?.complete === false || value?.streamnyaa?.status === 'stale';
      if (!needsRecovery) { pending.delete(query.queryHash); continue; }
      if (query.state.fetchStatus !== 'idle') continue;
      const error = query.state.error as { code?: string; retryAfterMs?: number; retryable?: boolean } | null;
      if (error?.code === 'cancelled' || error?.retryable === false) { pending.delete(query.queryHash); continue; }
      const previous = pending.get(query.queryHash);
      const observedAt = Math.max(query.state.errorUpdatedAt, query.state.dataUpdatedAt);
      const retryAfterMs = error?.retryAfterMs || value?.retryAfterMs || 0;
      if (!previous) {
        pending.set(query.queryHash, { at: Date.now() + Math.max(recoveryDelay(0), retryAfterMs), attempt: 0, observedAt });
      } else if (observedAt !== previous.observedAt) {
        previous.observedAt = observedAt;
        previous.at = Math.max(previous.at, Date.now() + retryAfterMs);
      } else if (Date.now() >= previous.at) {
        previous.at = Date.now() + recoveryDelay(++previous.attempt);
        void client.refetchQueries({ queryKey: query.queryKey, exact: true, type: 'active' }, { cancelRefetch: false });
      }
    }
  };
  const online = () => { tick(); };
  const timer = window.setInterval(tick, 1000);
  window.addEventListener('online', online);
  return () => { window.clearInterval(timer); window.removeEventListener('online', online); pending.clear(); };
}
