import { useSyncExternalStore } from 'react';
import { useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';

type CatalogHealth = { failed: Query[]; fallback: boolean; loading: boolean };
const emptyHealth: CatalogHealth = { failed: [], fallback: false, loading: false };
const disabledSubscribe = () => () => {};
const disabledSnapshot = () => emptyHealth;

// Only verified administrators subscribe. Both admin surfaces share one cache
// listener and one scan per event burst; hidden windows defer cosmetic scans.
function createHealthStore(client: QueryClient) {
  let snapshot = emptyHealth;
  let stop: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = true;
  const listeners = new Set<() => void>();
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  const refresh = () => {
    clearTimer();
    if (!listeners.size || document.visibilityState === 'hidden' || !dirty) return;
    dirty = false;
    const queries = client.getQueryCache().getAll().filter(query => query.getObserversCount() > 0 && /desktop|episodes/.test(String(query.queryKey[0])));
    snapshot = {
      failed: queries.filter(query => query.state.error),
      fallback: queries.some(query => {
        const data = query.state.data as any;
        return Boolean(data?.fallback || data?.pages?.[0]?.fallback || data?.streamnyaa?.status === 'stale');
      }),
      loading: queries.some(query => query.state.fetchStatus === 'fetching'),
    };
    listeners.forEach(listener => listener());
  };
  const schedule = () => {
    dirty = true;
    if (document.visibilityState !== 'hidden' && timer === undefined) timer = setTimeout(refresh, 250);
  };
  const visibility = () => { if (document.visibilityState === 'hidden') clearTimer(); else refresh(); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        dirty = true;
        stop = client.getQueryCache().subscribe(schedule);
        document.addEventListener('visibilitychange', visibility);
        refresh();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stop?.(); stop = undefined;
          clearTimer();
          document.removeEventListener('visibilitychange', visibility);
          snapshot = emptyHealth;
          dirty = true;
        }
      };
    },
  };
}

const stores = new WeakMap<QueryClient, ReturnType<typeof createHealthStore>>();
export function useCatalogHealth(enabled = false) {
  const client = useQueryClient();
  let store = enabled ? stores.get(client) : undefined;
  if (enabled && !store) { store = createHealthStore(client); stores.set(client, store); }
  return useSyncExternalStore(store?.subscribe ?? disabledSubscribe, store?.getSnapshot ?? disabledSnapshot, disabledSnapshot);
}
