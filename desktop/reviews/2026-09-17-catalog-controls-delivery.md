# Catalog and desktop controls repair — 2026-09-17

Implemented in StreamNyaa-main-integration, based on 55729f7, preserving existing working-tree changes.

## Changes
- AniList Explore queries now omit unused nullable filters and their variable declarations. The previous null date comparisons produced HTTP 400.
- Home recent episodes no longer requests the invalid `Media.airingAt` field. Airing time is read from the parent schedule.
- New episodes never substitutes arbitrary saved/airing series. Verified cached episodes keep their retrieval timestamp; Jikan listings are distinguished from confirmed airing records.
- Saved filters UI removed; stored presets and backup compatibility preserved.
- Watch Desk uses a document-level portal, a full draggable header, guarded pointer capture with window listeners, frame-based movement, end-of-drag persistence, viewport clamping, and keyboard repositioning.
- Spotlight has a translucent central hover/focus pause control. Four-second rotation, interaction pause and reduced motion remain.
- Administrator visibility uses the authenticated server role lookup. Failed lookups remain nonadmin without breaking normal login. Diagnostic badges, tests, settings search links and command shortcuts are hidden from regular users; plain freshness/failure notices remain.
- Calendar keeps explicit delay/postponement and observed schedule-change behavior; recurring broadcast references do not claim confirmed episode times.

## Verification
- TypeScript: passed.
- Frontend: 212 passed in 50 files.
- Rust: 56 passed, 1 existing ignored local-tracker download integration test.
- Desktop contracts: passed.
- Native player state: 510 behavioral assertions passed.
- Native controls: 20 cycles passed; soak: 100 cycles passed; stalled-stream integration: passed.
- Web regressions: 15 passed.
- Live AniList: all nine Explore modes returned HTTP 200 with 25 records each. Corrected Home recent query returned HTTP 200 with 12 episode records. See companion probe JSON files.
- Jikan recent-episode endpoint returned HTTP 504 during this run. Its failure and saved-snapshot paths are covered by regressions; live fallback availability is not guaranteed.

## Native acceptance limits
An isolated debug native app (separate application identifier, fresh profile and temporary data root) was inspected. The Home layout displayed the centered Spotlight control and no regular-user provider badge. This inspection exposed the remaining Home query defect, subsequently fixed and checked against AniList.
The user stopped Computer Use with Escape, then explicitly requested to do interactive testing themselves. No further UI automation was performed. Native dragging, all display-scaling combinations, authenticated admin round trips, and clean-install/same-version upgrade/rollback are not claimed as passed. The isolated validation process was closed; the user's installed app/player was left untouched.

The installer remains unsigned. Packaging records include version, NSIS resource source paths, resource hashes, installer checksum and size. Installer payload extraction is not claimed; staged resources and the generated NSIS inclusion script are checked.
