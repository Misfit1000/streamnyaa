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
