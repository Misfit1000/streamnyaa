# Website security and resource audit — 24 October 2026

Scope: website client, public metadata/source/torrent gateways, authentication and Admin authorization, account isolation contracts, publishing privacy, browser headers, dependency advisories and startup resources. Desktop source, version, installers, account data and publishing settings are unchanged. No production data was deleted or modified for testing.

## Confirmed weaknesses repaired

| Finding | Repair and evidence |
| --- | --- |
| Public GraphQL proxy accepted arbitrary operations and unbounded request bodies. | Require one read-only public catalogue operation; parse GraphQL rather than matching text. Bound input bytes, tokens, expanded fields, aliases, depth, variable sizes and pagination. Reject before upstream access. Mutation, introspection, private-root, fragment-cycle and oversized-input regressions pass. |
| Metadata memory was entry-count bounded but not byte bounded; fresh persisted Calendar hydration bypassed its count eviction. | Reuse the existing byte-accounted LRU: metadata 300 entries/16 MiB; snapshots 100 entries/16 MiB. Limits apply to restored and newly fetched records. Saved records are untouched. These are payload accounting limits, not total process RSS limits. |
| Upstream response bodies could be buffered in full before size validation. Some transports lacked deadlines. | Bound streamed JSON/XML/RSS bodies to 4 MiB and torrent metadata to 5 MiB, cancel oversized streams, add missing timeouts and bound concurrent distinct work per instance. Existing provider pacing and shared work remain. |
| Credential-bearing TMDB enrichment accepted unrelated routes/query parameters, including appended private account state. | Allow only public search/title/image/ID enrichment, reject private appended fields/session parameters, remove caller API keys, normalize query ordering and refuse redirects on credential-bearing provider requests. Encoded traversal/private-path regressions pass. No live private-account fetch was performed. |
| Admin authorization checked an allowlisted email without explicitly requiring provider-confirmed email ownership. | Require the auth provider's `email_confirmed_at`; ignore user-editable metadata claims. Both JS and TS server helpers agree. Existing verified-account behavior is preserved. This closes a conditional weakness if unconfirmed accounts can obtain sessions; no account compromise is alleged. |
| Live SPA responses lacked explicit framing, MIME, referrer and feature protections. | Add `nosniff`, frame denial, CSP `frame-ancestors`, `base-uri` and `object-src`, sensitive-route `no-referrer`, and unused-feature restrictions. Preserve legitimate scripts, images, embeds, authentication and clipboard actions. This is a scoped CSP, not a claim that all XSS is prevented. |
| Cached fallback could mask provider 401/403/429 responses and their retry deadlines. | Preserve denial/throttle status and `Retry-After`, retain usable UI data through existing client recovery, and never mark the response fresh. |
| Shared card import pulled native-only routes into web chunks; hidden Home tabs continued rotating artwork. | Substitute the native route-preload helper only in the web build, use the existing web account provider directly, narrow Home store subscriptions, and pause the carousel timer while hidden. Existing UI and visible carousel behavior remain. |

The standalone website server now uses the same bounded source handler as Vercel, applies the same security headers, and omits its framework-identification header. No separate legacy source cache remains there.

## Verification

- TypeScript passes, including API handlers.
- 726 frontend tests pass across 114 files, including hidden-tab rotation and shared desktop regressions.
- 69 publishing/review/model/recovery/gateway/security checks pass; the website/account/navigation/auth contract run also passes (overlapping coverage is not added into a single test total).
- Five initial-article HTML checks pass. Thirteen standalone production routes pass, including security headers and readable initial article HTML.
- Production web build and entry/dependency asset validation pass. The build check rejects reintroduction of native-only page chunks.
- `npm audit` reports zero known vulnerabilities at audit time, including after adding the server-only GraphQL parser. This does not establish the absence of undisclosed vulnerabilities.
- Live baseline: public Compare returned 200; unauthenticated Admin returned 401 with `no-store`; Vercel already provided HSTS. Application framing/MIME/CSP/referrer headers were absent before this repair.
- Account ownership and service-only publishing/snapshot permissions are exercised with fixtures. No invasive production penetration test, brute force, provider load test, password reset, role change or publishing run was performed.

## Measured resource changes

Frozen baseline: `da6d733`. Final website startup dependency closure:

| Metric | Before | After |
| --- | ---: | ---: |
| Startup JavaScript, raw bytes | 633,873 | 580,060 |
| Startup JavaScript, gzip bytes | 200,121 | 183,699 |
| Initial Home API requests in controlled fixture | 4 | 4 |
| Warm Home API requests after the minute cutoff advanced | 1 | 1 |
| Median first usable Home, three fresh-origin fixture loads | 492 ms | 481 ms |
| Warm first usable Home, one fixture reload | 176 ms | 157 ms |

The gzip reduction is **16,422 bytes / 8.2%**. Do not describe this as an 8.2% load-time or server-billing reduction. Page timing is broadly unchanged at this sample size. One candidate sample took 623 ms versus 479 ms; investigation showed its startup-script delivery took 185 ms versus 41 ms while provider replies and JS long-task time were lower. Repeated samples were 466/481 ms against baseline 511/492 ms. All samples, including the slower one, are retained.

Equivalent normalized query envelopes now share one upstream request in the concurrency fixture. This is a specific deduplication result, not a site-wide percentage saving. Existing browser caches, lazy shelves, intent prefetch, provider pacing and CDN behavior are retained. Hidden-tab artwork rotation now has no carousel timer; image-byte savings depend on whether each slide's image was already cached.

Ignored local evidence: `.validation/web-security-2026-10-24/`, `web-security-frontend-complete.log`, `web-security-final-server.log`, `web-security-npm-audit-final.json`, and build/HTML/contract logs. Performance instrumentation exists only in the local fixture server and is not deployed.

## Delivery and limits

Integrate current `origin/main`, push normally and verify the resulting Vercel production deployment, security headers, public catalogue reads, article HTML and signed-in Admin access. Keep the previous verified `da6d733` deployment available for rollback. Final production observations are recorded after deployment.

The changes add no paid service or telemetry calls. Per-instance bounds are not a global distributed rate limiter and cannot guarantee protection from a distributed attack or prevent external crawlers from consuming CDN quota. This audit does not reset existing usage or establish real-world capacity.

Reference guidance: [OWASP HTTP headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html), [OWASP GraphQL resource limits](https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html).
