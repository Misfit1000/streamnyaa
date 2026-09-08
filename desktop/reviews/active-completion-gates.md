# Active desktop completion gates (0.1.8 update)

This is a tracking record, not release acceptance. The full user objective remains active.

## Current evidence
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
