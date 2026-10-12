# Desktop 0.1.9 catalog, source matching, and release alerts

This revision implements the approved desktop repair. Automated verification and installer packaging are recorded below and in the adjacent installer manifest. Installed interaction acceptance remains separate and will be performed by the user.

## Implemented behavior

- AniList requests start at least 2.1 seconds apart, reduce admission when observed capacity falls, and prioritize foreground consumers. Local queue waiting is distinct from a provider 429 and does not trigger fallback or provider cooldown. Queue admission, HTTP attempts, and bridge lifetimes have separate bounds; cancellation and coalescing remain in place.
- Recovery uses absolute retry times, provider reset information, a shared coordinator, and a single probe gate after cooldown. Home admits visible shelves and batches at most two compatible shelves per primary request. Calendar background work stops after one schedule page; opening Calendar continues foreground discovery. Hover requests are cancellable and cannot overwrite newer foreground data.
- Home and Explore share minute-rounded recent-feed bounds. New episodes uses episode records, preserves provenance and original retrieval timestamps, and distinguishes confirmed airing records from recently listed Jikan episodes. Cached content is not presented as a fresh release feed.
- Top by year, Top 100, and This season remember independent year selections. Unrelated Explore sections ignore year parameters; genre, format, and status remain ordinary shared filters.
- Requested episode metadata pages return before optional latest-page enrichment. A failed/stale latest page cannot erase valid titles, block numbered navigation, or claim the tail is resolved.
- Watch and native release-availability checks use the same canonical installment classifier. Explicit wrong seasons, parts, and known episodes are rejected. Bare franchise roots cannot establish sequel identity across TV, ONA, OVA, or specials. Batches and unresolved identities remain manual **Advanced / uncertain matches**; automatic playback and alerts exclude them.
- Source discovery uses ordered diverse aliases, retains raw torrent candidates across display filters, deduplicates torrent identities, publishes early safe results, and resumes unfinished queries with **Find more sources**. Each pass is bounded by upstream requests and elapsed time. Episode source caches expire after 60 seconds; title caches after five minutes.
- Calendar bells are persistent title subscriptions. Native processing continues while the app is running in the tray and stops on explicit Quit. Pre-air reminders, aired notifications, and exact-source availability notifications have distinct durable delivery state. Reopening performs bounded catch-up; schedule changes update the same episode identity. Missing records do not imply cancellation or postponement.
- Source availability is versioned. Bounded background probes can establish a safe positive but cannot establish exhaustive absence. Home/Explore hide a title only after a successful complete empty title search, independent of quality/audio filters; negative evidence expires after 15 minutes. Unknown titles, upcoming titles, and local playable downloads remain visible. **Show unavailable titles** restores suppressed titles.
- Backup/import includes subscriptions, delivery state, and availability records, while older backups remain valid. Import cannot regress newer availability evidence. Settings, account identities, progress, downloads, and existing user media are preserved.

## Live primary-request evidence

Normal direct public HTTPS requests used the current query builders with at least 2.1 seconds between starts. All nine Explore modes and an active date/genre/format request returned HTTP 200 without GraphQL errors; New episodes returned 25 confirmed episode records. A seven-shelf Home batch exceeded the real eight-second HTTP bound. After limiting Home batches to two shelves, all four batches covering seven shelves passed in 583–2007 ms, without fallback.

Evidence: [Explore and original Home probe](artifacts/2026-10-12T09-07-16-574Z-primary-catalog-query-probes.json), [repaired Home batches](artifacts/2026-10-12T09-09-35-938Z-primary-catalog-query-probes.json). These are query/transport checks, not installed UI acceptance or a guarantee of future provider availability.

## Verification and packaging

Final checks passed: TypeScript; 336 frontend tests across 62 files; 85 Rust tests with one existing ignored local-tracker test; 16 web compatibility tests; desktop contracts; 514 player-state assertions; the native controls test with 20 cycles and 12 file replacements; stalled-stream recovery; and the 100-cycle soak with 12 file replacements and one owned MPV process. The final player script was unchanged during this catalog repair. Build tooling preflight and whitespace checks also passed. Logs are copied into the release evidence folder.

Final suite counts, packaged resource hashes, executable version, installer size, SHA-256, signature status, and rollback location are recorded in [the release manifest](2026-10-12-catalog-installer.json). The publication step checks source hashes against the validated build inputs, matches every bundled resource against its staged file and NSIS inclusion, archives the previous installer and metadata, then verifies the replacement checksum in the usual release folder.

## Remaining acceptance and external dependencies

- Actual installed mouse/touch/keyboard interactions, display scaling, native tray behavior, OS notification delivery, and real source startup have not been accepted in this revision. The user performs final interactive testing.
- The existing Vercel batch-history/preflight-cache server change is a separate deployment. The [fresh public POST-preflight probe](artifacts/2026-10-12-download-history-options-headers.txt) returned 204 but lacked the planned 600-second `Access-Control-Max-Age` header. Vercel CLI authentication is available, but no linked project, project-specific permission, or exact deployed revision was verified; no deployment was performed. The server revision and authenticated batch round trip remain unverified. Installing the desktop build does not deploy server code.
- Signing material is unavailable. The installer signature status is reported honestly; an unsigned package does not pass signed-release acceptance.
- Isolated Windows clean installation, same-version upgrade with state preservation, rollback execution, live account-sync round trips, app-wide cold/warm UI timings, and real torrent endurance remain unverified.
- Source availability means a safe matching release was discovered, not guaranteed torrent startup. Discovery supports three pages per alias/category; episode discovery prioritizes six aliases, while title discovery covers all supported aliases. Title suppression is deliberately conservative: nonempty all-conflict or incomplete searches do not prove that no usable release exists. Providers can still throttle or experience outages.

Earlier reports remain historical evidence. Persistent download management, offline playback, exact recovery identities, watched-interval tracking, bookmarks, Home layout controls, and the player repairs are present in current source; their old unaccepted native gates are not silently converted into passes by this catalog repair.
