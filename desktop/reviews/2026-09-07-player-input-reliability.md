# Player input and overlay correction

Scope: desktop MPV skin and regression fixtures; version remains 0.1.7.

## Changes

- Keep Settings rendered and hit-testable during buffering, including telemetry arriving between mouse-down and mouse-up.
- Render Settings last, so underlying timeline and toolbar controls cannot steal overlapping menu clicks.
- Paint changed menu hover states immediately; unchanged hover positions do not request a new paint.
- Correct the missing seek-step submenu action prefix. Rendered 5–60-second options now invoke the intended action.
- Make overflowing option menus scrollable instead of replacing unreachable options with a disabled “more items” label. Menu scrolling does not alter volume.
- Preserve established playback state during metadata refreshes, including buffering.
- Remove the timed artwork hold after playback restart. Clear stale OSD on loading-to-playing transitions even when controls are hidden.
- Dismiss an obsolete terminal failure when playback advances with configured video output. Audio position alone is insufficient.

## Validation actually run

- TypeScript: passed.
- Frontend: 107 tests across 28 files passed, including the pending Explore pagination tests.
- Desktop contract checks: passed. Updated the catalog cache-version assertion for the existing v3 paginated implementation and replaced the obsolete timed-artwork contract with explicit overlay removal.
- MPV state: 450 assertions passed, including 30 rendered mouse-click cycles with buffering inserted between press and release, scrolling to the 60-second option, and stale overlay transitions.
- Real bundled MPV controls: 20 cycles and 100-cycle soak passed.
- Deterministic stalled-stream integration: passed.
- Native D3D11 GPU rendering: passed; Settings-over-buffering and overflow-menu captures generated. Settings-over-buffering visually inspected.

## Limits / remaining acceptance

This does not establish zero latency throughout every application screen. No new installer was built for this input-specific change. Installed-app click latency under real torrent load, native generation-scoped delayed failure delivery, audio-only decoder failure, and the broader requested app-wide feature/release work still require acceptance. Existing user data, installers, mobile, and web projects were not changed or deleted.
