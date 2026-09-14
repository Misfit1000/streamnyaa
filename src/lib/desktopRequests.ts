import { desktopDataError } from './desktopData';

export type DesktopRequestOptions = {
  signal?: AbortSignal;
  priority?: 'foreground' | 'prefetch' | 'background';
  deadlineMs?: number;
};
type Invoke = <T>(command: string, args: Record<string, unknown>) => Promise<T>;
type Flight = { id: string; promise: Promise<unknown>; consumers: number; done: boolean; started: boolean };
const flights = new Map<string, Flight>();
let sequence = 0;

export function stableRequestKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableRequestKey).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableRequestKey(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** Cancellation belongs to a subscriber, not to the first component that starts a shared request. */
export function invokeDesktopData<T>(invoke: Invoke, command: string, args: Record<string, unknown>, options: DesktopRequestOptions = {}): Promise<T> {
  if (options.signal?.aborted) return Promise.reject(desktopDataError('desktop', new DOMException('Cancelled', 'AbortError')));
  const key = stableRequestKey({ command, ...args });
  let flight = flights.get(key);
  if (!flight) {
    const id = `data-${Date.now().toString(36)}-${++sequence}`;
    flight = { id, consumers: 0, done: false, started: false, promise: Promise.resolve() };
    const owned = flight;
    flights.set(key, owned);
    owned.promise = Promise.resolve().then(() => {
      if (owned.consumers === 0) throw new DOMException('Cancelled', 'AbortError');
      owned.started = true;
      return invoke<T>(command, {
        ...args, requestId: id, priority: options.priority || 'foreground', deadlineMs: options.deadlineMs,
      });
    }).finally(() => {
      owned.done = true;
      if (flights.get(key) === owned) flights.delete(key);
    });
  } else if (!options.priority || options.priority === 'foreground') {
    void invoke('promote_desktop_data_request', { requestId: flight.id }).catch(() => undefined);
  }
  const owned = flight;
  owned.consumers++;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', abort);
      clearTimeout(timer);
      owned.consumers--;
      if (!owned.done && owned.consumers === 0) {
        if (flights.get(key) === owned) flights.delete(key);
        if (owned.started) void invoke('cancel_desktop_data_request', { requestId: owned.id }).catch(() => undefined);
      }
      if (error !== undefined) reject(desktopDataError('desktop', error)); else resolve(value as T);
    };
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    // The native deadline is authoritative; this also bounds an unavailable/crashed bridge.
    const timer = setTimeout(() => finish(new Error('Data request timed out.')), (options.deadlineMs || 10_000) + 500);
    options.signal?.addEventListener('abort', abort, { once: true });
    owned.promise.then((value) => finish(undefined, value as T), (error) => finish(error));
  });
}

export function desktopAnimeQueryKey(routeId: string, anilistId?: string | number | null, malId?: string | number | null) {
  return ['anime', anilistId ? `anilist:${anilistId}` : malId ? `mal:${malId}` : `route:${routeId}`] as const;
}
