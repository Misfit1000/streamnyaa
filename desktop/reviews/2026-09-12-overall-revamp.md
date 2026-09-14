# Consolidated desktop improvements — 0.1.8

## UI preservation

Before edits, all 110 source files were archived to `desktop/ui-backups/before-overall-revamp-20260912.zip` (367,827 bytes). SHA-256: `bebdaf9aaded9f76ea372ad1a708ab18af053515480aac0dbccfb6a0e23265a4`. The adjacent JSON records the snapshot. Existing local recovery/desktop modifications were retained.

Settings > Appearance offers Classic and Revamped. Classic disables the new visual CSS layer and restores Home's original ordering; functional additions remain available. This is an appearance rollback, not a byte-for-byte restoration of every old page. The source archive preserves the exact pre-revamp frontend for a broader source-level revert, which would require rebuilding and carefully retaining desired functional repairs.

## Implemented

- Scoped broadcast-desk visual layer with warm typography, restrained red, stronger focus indicators, responsive controls and reduced-motion behavior. Appearance changes persist locally.
- Ctrl+K command palette: navigate pages, find saved titles, search online, and jump to appearance, backup and diagnostics. Uses a native modal dialog with Escape, focus containment and arrow navigation. Existing search form remains available.
- Activity center combines active catalog failures, fallback/cache status, transfer counts and existing schedule reminders. Status is derived from observed requests, not presented as a live connectivity test. Retry acts on the affected query.
- Home shelf visibility/order preferences, Continue Watching first by default in revamped mode, a recent-session summary and tracked-Calendar link. Discovery rails avoid reusing titles already assigned to preceding shelves. Catalog warnings are collapsed into one disclosure; Popular no longer shows endless loading placeholders after a settled failure.
- Explore keeps separate provider ranking filter preferences and shows removable active filter chips. MAL alternate previews retain provider labels and honor hidden-completed preference. Existing page/scroll restoration remains.
- Settings has indexed search and anchor navigation. Version 2 personal backups include Library/favorites, existing playback history/preferences/reminders, collections, saved filters, appearance, Home layout and native shortcuts. Existing version 1 backups remain supported. Import validates the envelope/limits, stages old values and rolls back on failures. Account credentials and media files are excluded.
- Library has URL-addressable Offline/Downloads and Collections tabs. Sidebar Downloads and Favorites links address the intended views. Collections support rename, delete while retaining anime, remove selected membership, and existing bulk status actions. Library history cap expanded to 100 entries.
- Calendar adds tracked/saved-show filtering, search within a day, Today action, and corresponding filters for recurring fallback slots. Exact releases remain distinct from approximate broadcasts.
- Episode metadata has a separate bounded persistent page cache using exact MAL ID/page identity, avoiding ordinary discovery-cache eviction. Saved pages are labeled stale and refreshed periodically. Page-one timeouts/server failures may try the standard explicit `?page=1` form once; cancellation, denial and throttling are not bypassed. No failure is converted into an authoritative empty list.
- Guided diagnostics now uses the same episode-fetch path as Watch, distinguishes saved results from live responses, records HTTP status when available and provides endpoint-specific advice instead of universally blaming the user's connection. Failure of the sample title does not imply all episode lists failed.
- Source switching takes the active player's current checkpoint only when anime and episode identity match; otherwise the existing exact checkpoint lookup applies.
- Native download file selection: a separate Choose files action resolves release metadata using rqbit list-only mode, validates torrent identity, persists choices, pauses for selection, then downloads selected file indices. Full-release downloading remains available. External subtitle files can be selected explicitly. The queue remains one concurrent transfer with existing bandwidth/pause/retry controls.
- Offline videos have durable release/file checkpoints, explicit Resume and Start over actions, and watched status. A generation guard prevents an older offline monitor from updating a newer opening. Checkpoints survive app restart and failed opens; updates are sampled every five seconds after the player opens the exact file.
- Completed moved release folders can be relinked only when their original ownership marker matches the queue ID. Relinked folders are read-only to the queue; removing the entry retains their files. A fresh download requires a new entry. Offline listings limit selected downloads to the chosen files.
- Download UI has search/status views, storage totals, progress display, explicit no-match state, file selection and missing-file/relink actions. Native queue writes enforce the same size bound as the decoder; additive defaulted fields preserve existing version-1 queue compatibility.

## Compilation and remaining acceptance

No automated tests, native UI walkthroughs, live provider acceptance checks, download transfers, or installed-app tests were run in this turn, per the user's instruction to test personally. TypeScript compilation passed; Rust compiler checking passed before final packaging. Final release build log is `.validation/2026-09-10-installed/overall-revamp-build.log`. Compiler success is not runtime acceptance.

AniList HTTP 403 remains an external unresolved gate. Uncached episode metadata can still fail when Jikan is unavailable; cache continuity and accurate error reporting are not a claim to restore provider availability. Offline checkpoints are release/file-local and are not merged into online anime episode history or account sync. Automatic offline next-episode selection is not implemented. Original live playback/first-frame/subtitle/scaling, crash/download fault, account-sync, isolated install/upgrade/rollback and distribution-signing gates remain open.

## Packaging

Overwrite the existing `desktop/releases/candidates/0.1.8-20260912-010153/StreamNyaa_0.1.8_x64-setup.exe` in place and refresh its manifest, checksum and source evidence. Do not create another candidate directory or overwrite the archived original release. Remain version 0.1.8 with the same application identity. The candidate is unaccepted and unsigned; it is not installed automatically.

Implementation reference for selective downloading: rqbit's published HTTP API and librqbit 8.1.1 HTTP query types (`list_only`, comma-separated `only_files`), https://github.com/ikatson/rqbit and https://docs.rs/librqbit/8.1.1/src/librqbit/http_api_types.rs.html . No external content was executed.

## Screenshot follow-up included before final packaging

- The screenshot showed an early exact match while the source panel remained at 54%. Discovery published partial results, but the UI disabled Play and hid the source list until every query finished. Readiness now depends on usable matches, independently of background discovery. Verified matching sources can be selected immediately; ongoing discovery is labeled separately. Non-playable results are excluded from the play/recovery pool.
- Unknown episode counts no longer render an empty picker. The numbered navigation starts with 1–12 and extends to a manually selected episode. These are explicitly unconfirmed navigation targets, not fabricated aired episodes. Exact title/season/episode source validation still applies. Numeric search can jump beyond the current unknown-count range.
- New Episodes now supports Jikan's documented `/watch/episodes` recent-additions feed after AniList failure. Home and Explore label these as recently added listings, not exact broadcast timestamps. Only declared episode labels or episode URLs provide episode numbers; video IDs never become episode numbers. Unsupported fallback filters report their limitation instead of returning false empty results. Existing provider caches and identities are retained.
- API schema consulted: https://github.com/jikan-me/jikan-rest/blob/master/storage/api-docs/api-docs.json . A documentation-oriented web request to the public watch endpoint returned HTTP 429; no live-success claim is made for that endpoint or the user's installed app.

## Player artwork and first-frame follow-up (2026-09-12)
- Added the series poster as a bounded fallback when landscape banners are unavailable. Portrait art is composed intact over a blurred background instead of leaving the loader blank.
- Added first-video confirmation from an advancing, unpaused playhead with a configured video output. This no longer depends on playback-restart having already set the started flag; placeholder images and seek transitions are excluded.
- A confirmed playing video now takes priority over stale startup display timers, and the cover overlay is cleared immediately on confirmation.
- Rebuilt the same 0.1.8 candidate. Native runtime acceptance is not claimed; user requested to perform testing themselves. Remote artwork still requires a readable image source.
