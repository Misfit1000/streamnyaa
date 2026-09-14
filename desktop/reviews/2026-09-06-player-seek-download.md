# Player seek controls and selected-video download

Desktop only; 0.1.7 test candidate, revision `desktop-playback-repair-1`.

## Included

- Saved seek step, default 10 seconds, configurable 5–60 in five-second increments. Buttons, tooltips and J/L use that value; arrows retain their five-second action.
- Seek numbers rendered inside vector icons. Removed the offset black icon shadows, aligned speed text, and improved pointer feedback. A drag/release onto a different control no longer activates it.
- Download toolbar action when space permits, with the same action in the player Settings menu at smaller sizes. It saves only the active selected video, not an entire batch.
- A native save-location picker, measured byte progress in Settings/tooltip, Cancel, bounded stalled reads, low-storage checks, and exclusive temporary-file creation. Completion is published without replacing existing files. Partial exports are removed on handled failure or cancellation.
- Uses the active local torrent HTTP stream; no second torrent engine, transcoding, or background download queue. Keep playback open; changing sources/closing playback cancels. Files already cached by the streaming engine are reused by its HTTP reader. The save dialog permits MKV/MP4 names; naming a file does not convert its format. Final publication requires a filesystem supporting hard links (normally NTFS).

## Validation

- TypeScript passed; frontend suite 98 tests passed.
- Player-state suite 352 assertions passed after the toolbar addition (includes layout-region checks).
- Rust suite 50 tests passed, including complete HTTP transfer, HTTP 500, truncated body, cancellation before transfer, external-address rejection, and existing-file protection.
- Player controls passed 20 and 100 cycles on the final controls; the final deterministic stall and desktop contract tests passed. One concurrent-build rerun failed the test's 80ms percentage-shortcut check; its isolated rerun passed. This timing-sensitive failure is retained here rather than hidden.
- GPU fixture screenshots inspected on dark and bright footage. Pure-white footage reduces contrast for shadow-free white toolbar icons; no opaque horizontal control bands were introduced.

## Not acceptance claims

No new live torrent playback/download, Windows save-dialog interaction, live account sync, or isolated installer upgrade was validated in this pass. The original local-engine HTTP 500 cause and remaining items in `2026-09-06-playback-repair.md` are not declared resolved. The installer is for the user's requested playback testing, not a production-readiness claim.
