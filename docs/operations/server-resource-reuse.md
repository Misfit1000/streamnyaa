# Server resource reuse — free Hobby plan

The website and desktop share the source gateway. Public metadata GET routes are also reused by the web client and the authenticated schedule gateway. Native AniList/Tenrai calls, Supabase account synchronization, local player telemetry and torrent video transfer remain separate from Vercel usage.

## Request and cache policy

- Identical cold source searches share one operation. Cancelling a consumer cannot cancel another consumer's work. Existing frontend/native coordinators and foreground priorities remain in control.
- Parsed RSS is cached by its exact upstream URL, including category, filter and page. Query aliases, installment/episode intent, ranking and discovery continuation are preserved. Context is applied after raw-feed reuse.
- The process-local source cache permits 300 assembled results and 600 raw feeds, with a shared 32 MiB accounted-payload budget, expiry and LRU eviction. This is not a bound on total Node process memory. Serverless instances do not share process memory.
- Source freshness remains two minutes with up to ten minutes of explicit stale fallback. Raw feeds are reused within those same two minutes. Assembled results inherit the oldest contributing feed timestamp. Complete fresh empty results replace obsolete results; failed/partial/invalid feeds are not cached as complete.
- Public GET responses can be reused by browser and CDN only for their remaining original freshness lifetime. Stale responses and failures use `no-store`. AniList POST reuse remains body-keyed in application memory, with `no-store` HTTP responses. Account responses remain private.
- Metadata freshness is evaluated from the original retrieval timestamp using the current caller's TTL. Neither process hits nor browser copies renew it. Existing provider refresh intervals, source coverage, download ownership and local/cloud progress cadence are unchanged.
- `waitUntil` keeps the existing nonblocking source refresh alive through the Vercel function lifecycle. It adds no paid infrastructure; normal function resource quotas still apply.

## Crawler controls and rollback

The separately deployed robots policy discourages Reflectionbot, AhrefsBot and ClaudeBot and excludes API crawling for other cooperative crawlers. Public pages and sitemaps remain available to Google/Bing; the API sitemap has a specific allow rule. The one custom rule in [crawler-protection.json](crawler-protection.json) was tested in Log mode before Deny. General bot challenges remain off and system mitigations remain enabled.

Ordinary Hobby WAF denies still count as CDN requests. They prevent application/upstream work; cooperative robots compliance/backoff is what avoids requests. No CDN-quota reset or paid upgrade is implied. To roll back, switch only the named rule to Log/disabled and publish; revert the robots commit independently. The cache changes are a separate Git commit.

## Measurement and attribution

The two function gateways log one `gateway_request` summary per executed request: route, self-reported client bucket, cache state, upstream fetch count, feed hits, coalescing, elapsed time and status. Background-refresh work is counted after completion. No query text, credentials, account ID, IP, full user agent or new telemetry requests are logged. No attribution query parameters, custom client headers, `Vary` fragmentation or CORS preflights are introduced.

Use Vercel Observability for CDN requests, function executions, CPU and transfer separately. CDN hits and WAF-denied requests do not appear in function summaries. Export existing runtime logs as JSON/JSONL and run:

```
node scripts/summarize-gateway-usage.mjs export.json
```

Buckets are desktop, website, recognized crawler, scheduled/test and unknown. A desktop WebView without an application-origin hint can remain unknown. These hints are never authorization; historical exact web/desktop splits cannot be reconstructed. Direct provider and Supabase traffic require their own reports.

Compare equal observation windows after robots propagation, using the same environment/routes and reporting blocked versus avoided traffic. Live monthly savings remain unmeasured until such a window exists. Do not estimate user capacity from crawler-contaminated totals.

## Reproducible local benchmark

```
node --import tsx scripts/benchmark-gateway-reuse.mjs .validation/baseline.json --baseline
node --import tsx scripts/benchmark-gateway-reuse.mjs .validation/optimized.json
```

The baseline is pinned to pre-optimization `c5d52020b26b08828c82e04674812e2152d9730c`. The fixture generates 150 RSS items, five milliseconds of upstream delay and no provider requests. It measures concurrent identical requests, warm requests and overlapping discovery plans. This is a gateway benchmark, not a public-torrent or full-application capacity test. Repeatable increases exceeding both 5% and 50 ms require investigation before accepting an optimization.
