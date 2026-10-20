import { randomUUID } from 'node:crypto';
import { supabaseRest } from './adminAuth.js';

export type SharedSnapshot<T> = { value: T; fetchedAt: number; stale: boolean; persistenceError?: string };
const memory = new Map<string, SharedSnapshot<unknown>>();
const flights = new Map<string, Promise<SharedSnapshot<unknown>>>();
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function stored<T>(key: string): Promise<SharedSnapshot<T> | undefined> {
  const rows = await supabaseRest(`site_public_snapshots?key=eq.${encodeURIComponent(key)}&select=payload,fetched_at&limit=1`, { signal: AbortSignal.timeout(4000) });
  if (rows?.[0] && Number.isFinite(Date.parse(rows[0].fetched_at))) return { value: rows[0].payload, fetchedAt: Date.parse(rows[0].fetched_at), stale: false };
}
export async function writePublicSnapshot<T>(key: string, value: T, fetchedAt: number, ttlSeconds: number) {
  await supabaseRest('rpc/put_site_snapshot', { method: 'POST', signal: AbortSignal.timeout(4000), body: JSON.stringify({ p_key: key, p_payload: value, p_fetched_at: new Date(fetchedAt).toISOString(), p_ttl: ttlSeconds }) });
}
export async function readPublicSnapshot<T>(key: string): Promise<SharedSnapshot<T> | undefined> {
  try { return await stored<T>(key); } catch { return memory.get(key) as SharedSnapshot<T> | undefined; }
}
/** Provider identity is the key; caller freshness can only shorten reuse. */
export async function publicSnapshot<T>(key: string, ttlSeconds: number, load: () => Promise<T>, valid: (value: T) => boolean = () => true): Promise<SharedSnapshot<T>> {
  const cached = memory.get(key) as SharedSnapshot<T> | undefined;
  const saved = cached && valid(cached.value) ? cached : undefined;
  if (saved && saved.fetchedAt + ttlSeconds * 1000 > Date.now()) return saved;
  const active = flights.get(key); if (active) return active as Promise<SharedSnapshot<T>>;
  const job = (async () => {
    let prior = saved, persistenceError: string | undefined, token: string | undefined;
    try {
      const persisted = await stored<T>(key);
      if (persisted && valid(persisted.value)) prior = persisted;
      if (prior && prior.fetchedAt + ttlSeconds * 1000 > Date.now()) { memory.set(key, prior); return prior; }
      token = randomUUID();
      const claimed = await supabaseRest('rpc/claim_site_snapshot', { method: 'POST', signal: AbortSignal.timeout(4000), body: JSON.stringify({ p_key: key, p_token: token, p_seconds: 30 }) });
      if (!claimed) {
        if (prior) return { ...prior, stale: true };
        for (let n = 0; n < 4; n++) { await pause(200); const other = await stored<T>(key); if (other && valid(other.value)) return other; }
        throw new Error('Shared provider refresh is still running.');
      }
    } catch (error) {
      if ((error as Error).message === 'Shared provider refresh is still running.') throw error;
      persistenceError = 'Shared snapshot storage is unavailable.';
    }
    try {
      const value = await load(), fetchedAt = Date.now();
      if (!valid(value)) throw Error('The provider response was incomplete.');
      try { await writePublicSnapshot(key, value, fetchedAt, ttlSeconds); } catch { persistenceError = 'Shared snapshot storage is unavailable.'; }
      const result = { value, fetchedAt, stale: false, ...(persistenceError ? { persistenceError } : {}) };
      memory.set(key, result); while (memory.size > 100) memory.delete(memory.keys().next().value!);
      return result;
    } catch (error) {
      if (prior && Date.now() - prior.fetchedAt < 60 * 86_400_000) return { ...prior, stale: true, ...(persistenceError ? { persistenceError } : {}) };
      throw error;
    } finally {
      if (token) await supabaseRest(`site_snapshot_leases?key=eq.${encodeURIComponent(key)}&token=eq.${token}`, { method: 'DELETE', signal: AbortSignal.timeout(2000) }).catch(() => undefined);
    }
  })();
  flights.set(key, job); try { return await job; } finally { if (flights.get(key) === job) flights.delete(key); }
}
