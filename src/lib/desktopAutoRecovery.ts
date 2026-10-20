import type { QueryClient } from '@tanstack/react-query';

export const recoveryDelay = (attempt: number) => [30_000, 60_000, 120_000, 300_000][Math.min(attempt, 3)];

/** One recovery scheduler for observed public data, never a retry loop for mutations/auth. */
export function installDesktopAutoRecovery(client: QueryClient) {
  const pending = new Map<string, { at: number; attempt: number; observedAt: number }>();
  type RecoveryValue = { complete?: boolean; latestPageResolved?: boolean; stale?: boolean; fallback?: boolean; partialReason?: string;
    retryAt?: number; retryAfterMs?: number; streamnyaa?: { status?: string; retryAt?: number }; pages?: RecoveryValue[] };
  type RecoveryError = { code?: string; provider?: string; retryAt?: number; retryAfterMs?: number; retryable?: boolean };
  const providerFor = (prefix: string, error?: RecoveryError | null) => error?.provider
    || (/episode/i.test(prefix) ? 'tenrai' : /source|nyaa/i.test(prefix) ? 'nyaa' : 'anilist');
  const publicDataQuery = (prefix: string) => (/anime|episode|source|schedule|season|trending|popular|explore|search|catalog|installments/i.test(prefix)
    && !/auth|account|login|profile/i.test(prefix)) || prefix === 'desktop-broadcast-reference';
  const tick = () => {
    if (navigator.onLine === false || document.visibilityState === 'hidden') return;
    const queries = client.getQueryCache().getAll();
    const live = new Set(queries.map(query => query.queryHash));
    const busy = new Set(queries.filter(query => query.state.fetchStatus === 'fetching' && publicDataQuery(String(query.queryKey[0]))).map(query =>
      String(query.meta?.publicProvider || providerFor(String(query.queryKey[0]), query.state.error as RecoveryError | null))));
    for (const key of pending.keys()) if (!live.has(key)) pending.delete(key);
    for (const query of queries) {
      const prefix = String(query.queryKey[0] || '');
      if (!publicDataQuery(prefix)) continue;
      if (!query.isActive()) { pending.delete(query.queryHash); continue; }
      const raw = query.state.data as RecoveryValue | undefined;
      const value = raw?.pages?.at(-1) || raw;
      // Calendar background discovery and normal source passes stop at their
      // budgets. Visible/manual continuation owns the rest, not a retry loop.
      if (query.state.status !== 'error' && ['background-budget', 'discovery-budget'].includes(value?.partialReason || '')) { pending.delete(query.queryHash); continue; }
      // Calendar continuation is pagination, not an upstream failure. Its last
      // page owns freshness; replaying every earlier page wastes provider work.
      if (prefix === 'schedule-public' && query.state.status !== 'error' && !value?.stale) { pending.delete(query.queryHash); continue; }
      const needsRecovery = query.state.status === 'error' || value?.complete === false || value?.stale
        || value?.fallback || value?.streamnyaa?.status === 'stale';
      if (!needsRecovery) { pending.delete(query.queryHash); continue; }
      if (query.state.fetchStatus !== 'idle') continue;
      const error = query.state.error as RecoveryError | null;
      // Access denial may recover after its explicit provider cooldown; invalid
      // requests and cancellations must never enter an automatic loop.
      if (error?.code === 'cancelled' || error?.code === 'invalid' || error?.retryable === false && !error.retryAt) { pending.delete(query.queryHash); continue; }
      const previous = pending.get(query.queryHash);
      const observedAt = Math.max(query.state.errorUpdatedAt, query.state.dataUpdatedAt);
      const retryAt = error?.retryAt || value?.retryAt || value?.streamnyaa?.retryAt
        || observedAt + (error?.retryAfterMs || value?.retryAfterMs || 0);
      if (!previous) {
        pending.set(query.queryHash, { at: Math.max(Date.now() + recoveryDelay(0), retryAt), attempt: 0, observedAt });
      } else if (observedAt !== previous.observedAt) {
        previous.observedAt = observedAt;
        previous.at = Math.max(previous.at, retryAt);
      } else if (Date.now() >= previous.at) {
        const provider = String(query.meta?.publicProvider||providerFor(prefix, error));
        if (busy.has(provider)) continue;
        busy.add(provider);
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
