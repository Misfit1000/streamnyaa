# Active desktop completion gates (0.1.8 update)

This is a tracking record, not release acceptance. The full user objective remains active.

September 9–10 update: see [completion candidate evidence](2026-09-09-completion-candidate.md) for implemented catalog fallback, durable downloads, recovery, spoiler/card/diagnostic work, final regression results and precise remaining engineering/live gates. The previous installer is archived and retained. An internal candidate build does not satisfy release acceptance.

September 10 installed follow-up: [installed smoke test](2026-09-10-installed-smoke.md) confirmed actual video/subtitles and keyboard pause/fullscreen in the installed candidate. [Catalog repair](2026-09-10-catalog-repair.md) fixes failing plain-shelf request construction using live-tested standard Jikan endpoints and adds a labeled Calendar broadcast reference. The repair passes 146 frontend tests and the full existing native suite; installed acceptance must use its newly built installer.

## Current evidence
- Consolidated September 12 repair: fixed ongoing-title release classification, MAL/AniList link identity, Watch snapshot restart persistence, endpoint-specific diagnostics and offline missing-file feedback. Includes prior episode, Calendar and ranking repairs. See the catalog repair report; external and installed acceptance gates remain open.
- September 12: shared catalog repair isolates ordinary Jikan failures per request, simplifies filtered search URLs, defaults Explore to Popular, and schedules recovery probes for failed pages. Final regression: 149 frontend tests, 56 Rust tests (one ignored), desktop contracts, 470 player-state assertions, controls, stall and 100-cycle soak passed. Candidate build and installed acceptance remain distinct; see the catalog repair report.
- Installed-app logs show AniList HTTP 403 alongside successful Jikan/Nyaa responses. General internet loss is not established. Access restoration requires resolving the denial; no bypass attempted.
- Native denial circuit now prevents repeated consumers from sending requests to a denied endpoint for five minutes. Error remains non-retryable and distinct from transport interruption. Four native coordinator tests passed.
- Frontend retains structured access-denied errors and Home no longer claims an automatic reconnection for that state. Eight lifecycle tests and TypeScript passed.
- Boot layout enlarged/rearranged responsively; motion respects reduced-motion preference. Late milestone updates cannot regress labels and invalid numbers are ignored. Four startup tests passed. HTML generated successfully; multi-resolution visual acceptance is still missing.

## Required work not yet proven complete
- Restore catalog access through an authorized resolution and verify Home, Explore, Watch and Calendar with live requests. No false empty states or erased cached content during fault tests.
- Independent persistent download ownership, pause/resume queue, bandwidth controls, batch selection and offline Library, without breaking active playback.
- Shortcut customization implementation now covers six primary actions, native persistence, duplicate/reserved-key validation, defaults and actual MPV bindings on next player open. Alternate/navigation keys remain unchanged. TypeScript, three validation tests, native validator test and 470 player-state assertions passed. UI save/reopen and real-player keyboard acceptance still required.
- Crash-session restoration with correct episode/checkpoint identity and explicit user resume.
- Complete spoiler coverage beyond Watch episode lists, plus remaining card/release-window actions.
- Complete interactive diagnostic workflow and UI/readability checks.
- App-wide performance, source switching, first-frame recognition, exact window restoration, live account sync, interrupted-playback soak and isolated upgrade acceptance.
- Inspect startup rendering at small/1080p/1440p/4K viewports and 100–200% scaling.
- Run complete regression suite on final source, build updated 0.1.8, archive previous revision, verify resources/signature/version/checksum and deliver actual results.

Do not mark the goal complete based on isolated tests or an installer existing. Current delivered 0.1.8 does not contain changes made after its build.

September 13 follow-up: [download manager and remaining gates](2026-09-13-download-manager.md) records native location selection, independent player downloads, popup management, offline next-video handling, exact crash checkpoints, and current successful AniList network observations. Full acceptance remains open.

September 14: [Home, downloads and watched coverage](2026-09-14-home-download-progress.md) records the unified ranking UI, watch desk drawer, compact transfer panel, Settings Home layout and actual watched-interval progress. Frontend 178, Rust 56 (1 ignored), player-state 477, contracts, controls, stall and 100-cycle soak passed. Native UI inspection was stopped with physical Escape; final visual acceptance and external gates remain open.
