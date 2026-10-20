# StreamNyaa 0.1.11: Calendar, publishing and player delivery

## Changes

The website retains its existing shell and poster grid. Calendar adds verified release tracks, confirmed change details, current-week relevance and the approved flat double-border delay badge. Desktop keeps horizontal cards and can scroll through every eligible recent change. Shared provider snapshots retain confirmed changes through outages; only verified provider IDs join records.

Public browsing uses bounded IndexedDB/memory reuse, original retrieval timestamps, caller freshness, per-consumer cancellation, optional cross-tab coordination and delayed hover intent. Unvisited Home sections do not fetch early. An immediate remount cannot inherit an abandoned request. Credentials, mutations and private queries remain outside this cache.

Publishing uses persistent leased jobs shared by cron and Admin, checkpoints and duplicate-event claims. Public Blog, archive and sitemap reads cannot generate articles. Supabase is primary storage; GitHub is used only on primary write failure. Articles require primary evidence, citations and quality validation, with one bounded revision. A quiet day can skip publication. Weekly activity rankings use recorded daily AniList data, code-calculated ranks and disclosed bounded coverage, independently of daily slots.

The installed 0.1.10 player script did not match the later 0.1.10 release script. Version 0.1.11 packages the approved left-information/right-poster composition, removes excessive background blur, versions artwork compositions and verifies the player resource marker in release builds. Source-tree player fallback is limited to debug builds. Application identity and local user archives remain unchanged.

## Verification

Final TypeScript, frontend, web/account compatibility, history PostgreSQL, publishing/Calendar PostgreSQL, desktop contracts, Rust and bundled MPV state/controls/stall/100-cycle checks are recorded in the companion installer manifest. Controlled GPU renders cover startup, buffering, long titles, completion, menus and advancing fixture video at wide, small and square sizes. Website Calendar was inspected in the existing shell with a long-title delayed fixture and Details/day-tab controls.

The controlled gateway fixture retained 12 upstream requests for 144 concurrent clients and 436,281 upstream bytes, matching the prior implementation. Final p95 was 29.26 ms versus 39.50 ms; this small local fixture is not a production capacity estimate. Warm p95 was 0.0201 ms versus 0.0219 ms. CPU/RSS include runtime/import variation and are not an isolated performance claim. Home's controlled initial request count falls from four to three until Upcoming approaches the viewport. No production CDN savings percentage is asserted.

## Deployment and acceptance

The additive service-only publishing/snapshot schema was applied successfully to production Supabase before worker deployment. Production Fluid Compute was confirmed enabled. The previously missing CRON_SECRET was added to Production after explicit approval. No credentials are embedded in source or evidence.

The normal daily cron remains 00:00–00:59 UTC (05:45–06:44 Nepal), subject to Vercel Hobby scheduling precision. Scheduled execution and editorial quality of future real articles require live acceptance; successful HTTP responses or model drafts are not publication proof. Production deployment evidence is recorded separately after push.

Direct AniList activity verification from this machine timed out; deployed-provider evidence is tracked separately. A live provider failure cannot be treated as an empty schedule. Controlled fixtures do not establish installed-app interaction, physical 100/150/200% DPI behavior, real notifications, isolated installer acceptance or live-torrent endurance. No trusted code-signing certificate is available. Existing CDN overage is not reset by this update.

The verified 0.1.10 installer is retained as rollback. The 0.1.11 manifest records executable version, staged resource hashes, NSIS resource inclusion, checksum, size and signature status. Installer extraction/installation are distinct acceptance gates.

## Live delivery addendum

Production Calendar returned 315 records with fresh AniList and AnimeSchedule retrieval times. The initial cold read took 15,661 ms. Identity discovery was moved out of first paint and independent snapshot reads were parallelized. Two later normal reads took 5,826 ms and 2,829 ms. Their cache states differ from the first observation, so these are timings, not a percentage improvement or a promise about every cold load. Continuation remains explicit and the response accurately reports incomplete discovery.

The exact daily-activity query through the deployed gateway returned HTTP 200 with an empty record set. It confirms query compatibility, not sufficient ranking coverage. Missing statistics must never be invented.

One immediate production cron run was explicitly approved and executed. The durable job `bd6e51cb-ef70-4c0e-8283-8dc3d8485d0d` recorded a pre-draft timeout and zero publications. Candidate metadata and six news feeds were durably saved. Model access, a successful real article publication, representative editorial review and scheduled-run acceptance remain unverified. Timeout handling now names the provider when available, records its stage and preserves a resumable checkpoint without an automatic loop. The original failed run remains visible in Admin; it was not silently marked successful or run a second time.

Production function permissions were checked directly: anonymous and authenticated roles cannot execute the service-only generation and snapshot RPCs. Unauthenticated cron/Admin requests return 401; public Blog and sitemap reads return saved content without generation.

Individual article URLs and the dynamic article sitemap exist. A Googlebot request to a published article returned an empty React root and the generic StreamNyaa title before JavaScript rendering. The public article JSON endpoints were blocked by robots.txt. The repair allows only those essential read endpoints, adds noindex on their JSON responses, and retains blocking for unrelated/private APIs. The website UI is unchanged. Server-rendered article HTML and Search Console URL Inspection remain follow-up SEO work; this release does not establish Google index inclusion or rankings.

The final web-only changes were checked against the desktop build: all 65 embedded frontend files are byte-identical. The verified installer remains 42,474,467 bytes, SHA-256 `A2203D48B63C2C52FD64830960ED77BD46810D2069D687C570DA48E8ABE86B40`, NotSigned. Its native build source is recorded in the installer manifest; later server-only changes and integration validation are recorded separately.
