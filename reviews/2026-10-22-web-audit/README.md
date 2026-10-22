# Website audit and repair — 2026-10-22

This is a website release. Desktop remains 0.1.12; no installer or player resources were replaced. The publishing review gate remains enabled (`automatic_enabled=false`, no accepted run).

## Repairs

- Home previews and View All share typed catalog requests. Recent uses actual episode-airing records with a stable cutoff, pagination, qualified identities and repeated-page detection. Score now requests real score-ranked results.
- Search commits typing after 300 ms and immediately on Enter. Filters remain in the URL; loaded pages survive continuation failures. Browse/genre/season, title, manga, source and Blog views distinguish unavailable information from empty results.
- Calendar canonicalizes verified aliases before deduplication and groups one installment per card, with independent episode numbers on Original/Sub/Dub rows. Contradictory identities and unlinked listings remain stored and count as pending coverage. Progressive responses expose saved data before enrichment, reuse cached identities beyond 200 titles with at most three storage reads in flight, and continue while visible.
- Calendar v2 uses an admitted cache namespace. Browser validation caught the former v1-only cache guard before release; the real transport now has its own regression.
- Compare is a compact factual table with two keyboard-operated selectors, Swap, Clear, shareable provider-qualified URLs, shared genres and Show differences. AniList list counts and MAL popularity ranks have distinct meanings; missing/incompatible values do not establish winners.
- Navigation closes on route changes, outside clicks and Escape. Routes have local loading/error boundaries, one guarded chunk recovery per build and a manual reload. Entry HTML revalidates; hashed assets remain immutable. Recovery avoids offline/edited forms. Article HTML remains complete before client startup.
- Account projection and download history are owner-scoped. Late previous-account responses are fenced. Browser storage failures retain the current in-memory journal. Library clear confirmation contains focus and defaults to Cancel.
- Provider HTTP status and Retry-After survive the gateway. AniList failure no longer triggers a direct request that bypasses gateway throttling/denial.
- Patched Vitest to 4.1.12 after the dependency audit identified two development-tool advisories.

## Route and action coverage

`route-checks.json` records rendered browser checks for popular, genre, season, anime details, source/download details, manga details, My List, Blog/archive, article, source search, login, Admin login, password reset, Dashboard/Admin guards, all information pages and a missing route. Home, Recent Search, Schedule and Compare were checked separately with live browser actions against controlled local providers.

Actions exercised: Home Recent → View All reuse; Search Load More appended episodes/titles 25–48; 300 ms debounce/Enter and filter transitions in regressions; Compare selector keyboard choice, Swap, Clear, Show differences and URL/share state; mobile menu route dismissal; Calendar tab arrows and day-specific empty states; mixed Sub episode 4/Dub episode 1 grouping (10 cards, 30 rows); no horizontal page overflow at phone, 1080p, 1440p and 4K CSS layouts. A comparison table has its own accessible horizontal overflow on narrow screens.

Destructive account/Library operations use automated fixtures, not personal production records. Authenticated account switching, lost responses and permission guards have regression coverage. Physical DPI scaling, installed desktop interaction and live notification acceptance were not performed for this website release. Reduced-motion behavior retains the existing global rules; physical OS preference interaction was not exercised.

## Controlled loading evidence

Baseline: committed source 5784487. Candidate: this repair. `tests/web-audit-fixture-server.mjs` serves both production builds with 60 ms deterministic API responses, synthetic artwork and fresh origins for cold comparisons. Instrumentation exists only in that fixture; it is absent from the shipped app and makes no telemetry calls. `loading-measurements.json` preserves raw navigation/resource/long-task observations. Browser-controlled readiness is the first relevant DOM content, not a lab LCP score; background-tab presentation timestamps are not used. Samples are descriptive, not a capacity test or a statistical speed claim.

| Route | Baseline first usable | Candidate first usable | Baseline / candidate API requests |
|---|---:|---:|---:|
| Home cold, final trace | 492 ms | 468 ms | 3 / 4 |
| Recent Search cold | 1,123 ms | 811 ms | 2 / 2 |
| Calendar cold, repaired transport | 576 ms | 569 ms | 2 / 2 |
| Calendar reload | 605 ms | 540 ms | 2 / 2 |
| Compare cold | 410 ms | 446 ms | 0 / 0 |
| Compare reload | 391 ms | 391 ms | 0 / 0 |
| Blog cold | 440 ms | 429 ms | 1 / 1 |
| Blog reload | 405 ms | 388 ms | 1 / 1 |

Home transfers increased from 332,229 to 372,881 bytes in the final synthetic cold trace. The extra request is the corrected independent Score feed, rather than an invented performance saving. The main entry increased from 433,310 to 441,715 raw bytes (gzip about 133.22 → 136.44 kB), below the existing 450 KiB budget. An initial noisy Home long-task observation (200 ms) was rechecked; the final cold sample recorded one 52 ms task and cached Home samples had none. First usable content did not regress by both 5% and 50 ms in these samples. No production-CDN percentage saving is claimed. Provider freshness can require a real request on reload; cache hits do not override a shorter caller TTL or a changed Recent cutoff.

The two early `*-calendar-cold` measurements with zero candidate content intentionally remain in the raw file as failure evidence. Use only `*-calendar-final-*` for the repaired Calendar. Tests caught and fixed a smoke-runner port collision with the independent fixture server; smoke now reserves an isolated port and confirms its own child is ready.

## Verification

- TypeScript passed.
- Full frontend suite passed with bounded workers after one resource-contended 5-second timeout in an unchanged desktop Explore test. 666 tests passed before the final identity-conflict case; final affected checks and final full-suite results are recorded below.
- Web/account/route/gateway contracts: 19 passed.
- Calendar gateway/SQL + publishing/review privacy contracts: 14 passed.
- Initial-HTML article contracts: 3 passed; public Blog/sitemap reads make zero model calls and no publishing writes.
- Desktop contracts passed. Shared helper behavior is covered by frontend tests. Native Rust/player code was not changed or rebuilt.
- Production web build and manifest dependency validation passed; largest entry 441,715 bytes before the final small Calendar conflict helper. The build checker enforces the actual final size.
- Production-server smoke: 13 routes passed, including full initial article content and real article 404s.
- Dependency audit after the test-runner patch: zero vulnerabilities.

## Production preparation

Applied `supabase/site-calendar-repair.sql` through the production SQL editor after explicit approval. The replacement is compatible with existing callers, transactionally reconciles superseded Calendar aliases and retains conflicting records. It does not change accounts, history, subscriptions or article tables. Read-only verification: anonymous execute=false, authenticated execute=false, service-role execute=true. Publishing automatic_enabled=false, accepted_run absent. Screenshots preserve the successful migration and permission/gate results.

Previous verified production deployment retained for rollback:
https://vercel.com/rabin2071brt-6612s-projects/streamnyaa/62GwSyNRHo3wrr3bwP1foLiugc92
(commit 5784487).

Deployment/live acceptance evidence follows after the release is pushed. External-provider outages, authenticated checks and old-tab behavior are reported separately rather than inferred from local fixtures.

Implementation reference: [Vite dynamic-import recovery and HTML cache guidance](https://vite.dev/guide/build.html#load-error-handling).

## Final local acceptance

The integrated frontend run passed 669 tests (105 files). Final focused checks covered the later display refinements and provider-deadline retry configuration. Web contracts (19), desktop contracts, gateway/Calendar/publishing/review contracts (14), initial HTML tests (3), production build/manifest checks and the isolated 13-route server smoke passed. The final entry is about 442 kB raw, still below the existing budget; the clean dependency audit remains unchanged.

An open candidate Home tab was kept across replacement of its hashed assets. Clicking Downloads recovered by one reload into `/nyaa`, with the page and navigation available. A controlled 503 source outage then rendered one Retry status and zero “No matching sources found” messages (`source-outage.jpg`). Web source searches now delegate automatic recovery to the shared coordinator, respecting Retry-After rather than issuing a default immediate retry.

Production Admin access was available: the existing Control room and read-only Refresh worked. No Generate, Resume, approve/reject, account deletion or article mutation was performed. Existing production editorial jobs still report provider discovery outages/skips; this website repair intentionally preserves that review gate.

## Publishing recovery follow-up

Production Admin Generate was reproduced: it reached the worker but failed during AniList activity discovery with HTTP 500. Two rows labeled only `daily · pending` were separate dated runs, not evidence of duplicate publication. No article was published during reproduction.

The repair replaces the failing global media-trend query with bounded per-title daily-history requests, retaining the same request budget, pacing and worker deadline. Completed five-title batches are cached independently so Resume does not restart completed work. Live bounded checks confirmed candidate metadata and per-title daily records were available; automated fixtures cover failure/restart and real date filtering. The inspected candidate sample and missing-day rules are disclosed; instantaneous trending only selects candidates, never supplies the ranking values.

An interrupted daily activity fallback now remains unfinished even when news discovery returned an empty list. Generate reactivates a paused same-day run after its provider deadline and retains its discovery checkpoint. Saved provider/stage/status/retry details survive failure. Admin distinguishes queued/running/paused/private-review/skipped jobs, dates historical jobs, disables early Resume, and no longer presents zero published articles as success. Configured credentials are not described as proven model access. Numeric validation accepts genuine thousands separators while rejecting substring matches.

Verification: TypeScript; 671 frontend tests across 106 files; 18 publishing/review/Calendar/gateway regressions; 19 web/account/route contracts. Private review remains required. Production deployment and a recovered private-draft run are verified separately below; no automatic-publication switch is enabled by these changes.

Live recovery reached Gemini successfully, confirming that model access works. Its rejected data-report draft exposed validator false positives: ISO dates written as calendar dates, two-decimal rounded means for honorable mentions, and sentence punctuation inside quoted official titles. These exact source transformations now pass; changed/invented figures and unsupported quoted statements remain rejected. The latest rejection reason is surfaced instead of a generic quality/duplicate message. An additional regression covers this production case. No draft was published during diagnosis.

The additional explicitly approved production run reached `Article writing`, then Gemini returned HTTP 503. It remained paused and unpublished; final private-draft acceptance is therefore unavailable, not a successful publication. Completed provider work is retained and automatic publication stays disabled and draft review stays required. No further production generation was attempted. A dashboard cache race observed during this run is covered by a delayed-status regression: accepted saved-job status now replaces the old terminal cache before polling starts. Final production routes, full article HTML and live Recent pagination were verified; Recent continuation added visible results. The actual daily cron after deployment has not yet occurred.
