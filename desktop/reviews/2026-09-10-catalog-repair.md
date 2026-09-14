# Catalog and Calendar repair — 2026-09-10

This repair addresses failures observed in the installed 0.1.8 app. It includes all prior local completion work; application version and identity remain unchanged.

## Diagnosis
Normal requests to Jikan's heavily parameterized catalog/search URLs returned HTTP 504. The response identified a Jikan upstream BadResponseException. This is distinct from AniList's HTTP 403 access denial.

The following standard public Jikan endpoints returned HTTP 200 during diagnosis: `/top/anime`, `/top/anime?filter=bypopularity`, `/top/anime?filter=airing`, `/top/anime?filter=upcoming`, `/top/anime?page=2`, `/seasons/2026/summer`, `/seasons/now`, `/schedules`, and `/anime/1`. No proxy, address substitution, authentication workaround or access-control bypass was used.

## Changes
- Plain Popular, Top, Airing and Upcoming shelves use dedicated top-catalog endpoints. Plain seasonal discovery uses the provider's season endpoint. Optional page parameters are sent only beyond page one.
- Content filtering is applied to returned standard catalog data, including adult ratings and explicit genres. Active user search/genre/status/date filters continue to use appropriate filtered requests rather than being silently discarded.
- Existing Explore cached cards are retained. Old pagination sequences cannot append pages from the new endpoint ordering until refreshed. Both ranking providers preserve their identities.
- Unavailable Trending/New Episodes exposes a Browse Popular action. These feeds are not mislabeled as a different feed.
- Calendar offers a separately labeled, paginated MyAnimeList weekly broadcast reference when exact AniList scheduling fails. It explicitly shows provider-local recurring slots, does not manufacture episode numbers or exact release dates, and cannot create episode reminders from approximate data. Saved-title and content filters remain available.
- Calendar rechecks primary data every five minutes while active, allowing recovery after provider cooldown.

## Limits
### September 12 shared-failure repair
- Ordinary endpoint failures now receive a request-specific 30-second cooldown. A failed search cannot block working Calendar, detail and shelf requests. Access denials and rate limits retain provider-wide cooldowns.
- Filtered searches omit redundant first-page, limit and server-side safe-content parameters. User query, genre, format, status and date constraints remain intact; adult-content filtering still applies to the returned data.
- Explore opens on Popular when no mode is selected. Explicit Trending and New Episodes selections retain their true capability requirements.
- Home and Explore periodically recheck failed catalog queries. Calendar's broadcast reference retries transient failures every 30 seconds and refreshes successful data every five minutes.
- Added regression coverage for endpoint failure isolation, minimal filtered URLs and default Explore navigation. The prior fullscreen control check failed once; an isolated rerun passed. The full rerun is recorded in `shared-catalog-repair-tests.log`. No installed-app UI acceptance is claimed for this repair.
- Final regression passed: 149 frontend tests in 38 files, TypeScript, desktop contracts, 470 player-state assertions, native controls, stalled-stream check, 100-cycle soak, and 56 Rust tests (one ignored). TypeScript was also rerun after the final Explore recovery-interval edit. Build log: `.validation/2026-09-10-installed/shared-catalog-repair-build.log`.

AniList access is still externally denied. Exact episode schedules, trending/new-episode feeds and complex filtered Jikan searches may remain unavailable when their upstream providers fail. The basic fallback catalogs succeeded in normal live requests, but this repair must still be installed before new installed-app UI acceptance can be recorded. No debug preview is counted as installed-app acceptance.

Final validation and installer build logs are in `.validation/2026-09-10-installed/catalog-fix-final-regression.log` and `catalog-fix-build.log`. The existing candidate and original archived installer remain separate for rollback.

## September 12 episode, Calendar and ranking follow-up
- Normal live episode and full-detail requests returned Jikan 504; schedule requests returned 429/504. External provider availability remains a blocker to complete live acceptance.
- Exact-MAL basic details are now attempted after full-detail failure, with identity validation and no retry across denial, cancellation or rate limiting. The first episode page omits redundant query parameters.
- Episode-number selection is visible for every released title, including when metadata is absent. Unknown ongoing counts do not clamp manual selection to the first fetched page. Source matching still validates the selected title/episode. No speculative episode list is manufactured. Metadata errors show Retry and recover periodically.
- Calendar tries current-season broadcast slots after ordinary schedule failure, preserves the selected provider endpoint through pagination, and offers a provider-weekday filter. Approximate broadcast slots remain explicitly distinct from exact episode schedules/reminders.
- Ranking controls are grouped as dedicated provider Top 100 filters, with year selection and reset. MAL score/popularity/format and supported status combinations use the top endpoint. AniList errors offer an explicit MAL switch without relabeling MAL ranks.
- Validation: 153 frontend tests, TypeScript, desktop contracts, 470 player-state assertions, controls, stall, 100-cycle soak, and 56 Rust tests passed (one ignored). Final frontend/TypeScript checks rerun after the selection and pagination adjustments.
- Installer is updated in the existing `0.1.8-20260912-010153` candidate directory at the user's request. No additional candidate directory is created. The original archived release remains preserved. This is an unsigned internal candidate, with native live acceptance and original completion gates still open.

## Consolidated follow-up
- Fixed the shared release-state classifier: Jikan `Currently Airing` and `Finished Airing` titles with unknown counts no longer become upcoming titles. Both providers' explicit unreleased states are supported. Resolved metadata can override a stale upcoming route marker.
- MAL-only Watch links no longer copy MAL IDs into AniList's ID namespace. Explicit mapped identities remain intact.
- Cached Watch title metadata now survives restart in bounded, versioned local storage. Calendar title links prime the same cache. Corrupt/expired snapshots are ignored, and metadata failures periodically retry. Cached data is not claimed as a new live response.
- Diagnostics now check details, episodes, Calendar and rankings separately rather than treating a successful single-title lookup as proof that the whole provider works.
- Downloads add Select all and an explicit missing-video recovery message; removal clears stale file buttons.
- No new candidate directory is created. The existing candidate is rebuilt once after the consolidated regression suite. Original external/native acceptance blockers remain open; these repairs do not prove live provider restoration or isolated installation acceptance.

Consolidated validation passed: 158 frontend tests across 40 files, TypeScript, desktop contracts, 470 player-state assertions, controls, stall, 100-cycle soak and 56 Rust tests (one ignored). Logs: `.validation/2026-09-10-installed/consolidated-repair-tests.log` and `consolidated-repair-build.log`.
