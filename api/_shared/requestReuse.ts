/** A process-local LRU shared by the assembled and parsed-feed caches. */
export class RequestCache {
  private entries = new Map<string, { namespace: string; value: unknown; expiresAt: number; bytes: number }>();
  private bytes = 0;
  constructor(private limits: Record<string, number>, private maxBytes: number) {}

  get<T>(namespace: string, key: string): T | undefined {
    const id = `${namespace}:${key}`, entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) { this.remove(id); return undefined; }
    this.entries.delete(id); this.entries.set(id, entry);
    return entry.value as T;
  }

  set(namespace: string, key: string, value: unknown, expiresAt: number) {
    const id = `${namespace}:${key}`;
    this.remove(id);
    // Conservative UTF-16 payload accounting plus per-entry overhead. This is
    // a cache payload bound, not a claim about total Node process RSS.
    const bytes = 2 * (JSON.stringify(value).length + id.length) + 256;
    if (bytes > this.maxBytes || expiresAt <= Date.now()) return;
    for (const [entryId, entry] of this.entries) if (entry.expiresAt <= Date.now()) this.remove(entryId);
    this.entries.set(id, { namespace, value, expiresAt, bytes }); this.bytes += bytes;
    while (this.count(namespace) > this.limits[namespace]) {
      const oldest = [...this.entries].find(([, entry]) => entry.namespace === namespace);
      if (oldest) this.remove(oldest[0]); else break;
    }
    while (this.bytes > this.maxBytes) this.remove(this.entries.keys().next().value!);
  }

  private count(namespace: string) { let n = 0; for (const entry of this.entries.values()) if (entry.namespace === namespace) n++; return n; }
  private remove(id: string) { const entry = this.entries.get(id); if (entry) { this.bytes -= entry.bytes; this.entries.delete(id); } }
  snapshot() { return { entries: this.entries.size, bytes: this.bytes, counts: Object.fromEntries(Object.keys(this.limits).map(ns => [ns, this.count(ns)])) }; }
}

/** Never extend freshness when a process-cache hit becomes an HTTP response. */
export function publicFreshness(res: any, fetchedAt: number, ttlSeconds: number, cacheable = true) {
  const remaining = Math.max(0, Math.floor((fetchedAt + ttlSeconds * 1000 - Date.now()) / 1000));
  res.setHeader('Cache-Control', cacheable && remaining > 0
    ? `public, max-age=${remaining}, s-maxage=${remaining}, must-revalidate`
    : 'no-store');
  return remaining;
}

export function requestClient(req: any): 'desktop' | 'website' | 'crawler' | 'scheduled-test' | 'unknown' {
  const header = (key: string) => String(req.headers?.[key] || '');
  const ua = header('user-agent');
  if (/Reflectionbot|AhrefsBot|ClaudeBot|Googlebot|bingbot|Google-Read-Aloud/i.test(ua)) return 'crawler';
  if (/StreamNyaa (?:Local Benchmark|Article Archive)|StreamNyaa-(?:Article-Archive|Blog-Sitemap)|vercel-cron|HeadlessChrome/i.test(ua)) return 'scheduled-test';
  if (/StreamNyaa Desktop\//i.test(ua) || /^(?:https?:\/\/tauri\.localhost|tauri:\/\/localhost)(?:\/|$)/i.test(header('origin') || header('referer'))) return 'desktop';
  if (/^https:\/\/(?:www\.)?streamnyaa\.xyz(?:\/|$)/i.test(header('origin') || header('referer'))) return 'website';
  return 'unknown';
}

/** Aggregate existing function logs; never send telemetry or log query/user data. */
export class RequestUsage {
  upstreamRequests = 0;
  feedHits = 0;
  coalesced = 0;
  cache = 'NONE';
  private started = performance.now();
  constructor(private req: any, private route: string) {}
  fetch(input: string | URL, init?: RequestInit) { this.upstreamRequests++; return fetch(input, init); }
  finish(status = 200) {
    if (process.env.VERCEL !== '1') return;
    console.info(JSON.stringify({ event: 'gateway_request', route: this.route, client: requestClient(this.req),
      method: this.req.method, cache: this.cache, upstreamRequests: this.upstreamRequests, feedHits: this.feedHits,
      coalesced: this.coalesced, elapsedMs: Math.round(performance.now() - this.started), status }));
  }
}
