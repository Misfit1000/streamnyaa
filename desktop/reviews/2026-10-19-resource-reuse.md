# StreamNyaa 0.1.10 — web and desktop request reuse

The application identity, visual UI, accounts, saved history, bookmarks, download ownership, source-matching rules, refresh intervals and player settings are preserved. The crawler policy was deployed independently as `346f60a` before the cache release. The starting Git checkpoint is `c5d5202`.

## Implemented

- Reflectionbot, AhrefsBot and ClaudeBot robots exclusions plus one targeted Vercel custom rule, tested in Log mode before Deny. Google/Bing and sitemaps stay accessible; general challenges stay off. No paid service/upgrade was enabled.
- Shared cold source operations and parsed raw-feed reuse across overlapping search plans, with 300/600-entry LRU caches and a 32 MiB shared accounted-payload budget.
- Original retrieval ages, caller-specific metadata TTLs and remaining-lifetime browser/CDN caching for complete public GET responses. Stale/partial/failure results cannot become fresh cache hits. AniList POST remains body-keyed with `no-store` HTTP responses.
- Aggregate existing function logs distinguish desktop, website, crawlers, scheduled/test and unknown without extra network telemetry or sensitive query/account logging. [Operational policy](../../docs/operations/server-resource-reuse.md) explains measurement, limitations and rollback.

## Controlled measurements

Same local fixtures; 150 items/feed and 5 ms simulated upstream delay, 144 concurrent requests in twelve groups of twelve, followed by 144 warm requests and overlapping plans. No public-provider load was generated.

| Metric | Before | After |
| --- | ---: | ---: |
| Upstream calls for identical concurrent searches | 144 | 12 |
| Concurrent response p95 | 56.57 ms | 28.52 ms |
| Warm source response p95 | 0.0119 ms | 0.0179 ms |
| Warm metadata response p95 | 0.0204 ms | 0.0221 ms |
| Upstream calls across overlapping plans | 3 | 2 |
| Fixture upstream bytes | 4,580,561 | 436,281 |
| Process CPU time during fixture workload | 860 ms | 219 ms |

Identical source calls fell 91.7% in this fixture; total fixture upstream bytes fell 90.5%. Warm-path overhead increased by about 0.006 ms for sources and 0.0017 ms for metadata, well below the 50 ms investigation threshold. These figures do not predict the reduction in monthly Vercel requests. Process RSS snapshots were not comparable peak-memory measurements and are not presented as a memory improvement.

A local headless Edge HTTP test confirmed two fresh reads cause one function request, then expiry causes another request and refresh. Actual full-app startup/navigation/first-frame/seek comparisons were not measured in this pass. The request-path benchmark and unchanged bundled-player regressions support the narrow result; installed-app responsiveness remains interactive acceptance.

## Verification

- TypeScript passed; frontend **92 files / 571 tests** passed.
- Web/account route contracts **18 passed**, including emitted Node ESM gateway imports and robots policy. Local PostgreSQL history compatibility passed; no production schema changes were required.
- Rust **114 passed / 5 opt-in ignored**. The unchanged live-provider and archive/isolated-download opt-in tests were not rerun.
- Player state **539 assertions**; bundled MPV controls, stall recovery and **100-cycle soak** passed, including real EOF and pointer Next/Close/Replay through MPV input.
- Web build, bundle budget, server build and server smoke passed. Dependency audit found **zero vulnerabilities**.
- Live firewall smoke: all three selected crawler tokens received **403**; desktop, Googlebot and bingbot received **200** without challenges. All three could read the updated `robots.txt`. The native auth callback remained **200**.

## Release and outstanding acceptance

The rebuilt 0.1.10 installer, resource hashes, executable version, checksum, size, signing status and verified rollback are recorded in the matching installer manifest. The prior installer is retained before replacement; no 0.1.9 installer is available.

Live matched-window monthly savings remain pending after crawler propagation. New function-log attribution begins at deployment and cannot repair historical reporting. Installed UI/DPI, real notifications, authenticated two-device sync, isolated installation/upgrade and long live-torrent playback remain interactive gates. No signing certificate is available; the installer is **NotSigned**. No full-app performance or concurrent-user capacity result is claimed.
