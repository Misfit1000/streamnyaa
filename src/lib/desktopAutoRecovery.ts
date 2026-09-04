import type { QueryClient } from '@tanstack/react-query';

export const recoveryDelay = (attempt: number) => [5_000, 15_000, 30_000, 60_000][Math.min(attempt, 3)];

/** One recovery scheduler for observed public data, never a retry loop for mutations/auth. */
export function installDesktopAutoRecovery(client: QueryClient) {
  const pending = new Map<string, { at: number; attempt: number }>();
  const tick = () => {
    if (navigator.onLine === false || document.visibilityState === 'hidden') return;
    for (const query of client.getQueryCache().getAll()) {
      const prefix = String(query.queryKey[0] || '');
      if (!/anime|episode|source|schedule|season|trending|popular|explore|search|catalog|installments/i.test(prefix)
        || /auth|account|login|profile/i.test(prefix)) continue;
      if (!query.isActive()) { pending.delete(query.queryHash); continue; }
      const value = query.state.data as { complete?: boolean; retryAfterMs?: number; streamnyaa?: { status?: string } } | undefined;
      const needsRecovery = query.state.status === 'error' || value?.complete === false || value?.streamnyaa?.status === 'stale';
      if (!needsRecovery) { pending.delete(query.queryHash); continue; }
      if (query.state.fetchStatus !== 'idle') continue;
      const error = query.state.error as { code?: string; retryAfterMs?: number } | null;
      if (error?.code === 'cancelled') continue;
      const previous = pending.get(query.queryHash);
      if (!previous) {
        pending.set(query.queryHash, { at: Date.now() + Math.max(recoveryDelay(0), error?.retryAfterMs || value?.retryAfterMs || 0), attempt: 0 });
      } else if (Date.now() >= previous.at) {
        previous.at = Date.now() + recoveryDelay(++previous.attempt);
        void client.refetchQueries({ queryKey: query.queryKey, exact: true, type: 'active' }, { cancelRefetch: false });
      }
    }
  };
  const online = () => { for (const entry of pending.values()) entry.at = 0; tick(); };
  const timer = window.setInterval(tick, 1000);
  window.addEventListener('online', online);
  return () => { window.clearInterval(timer); window.removeEventListener('online', online); pending.clear(); };
}
