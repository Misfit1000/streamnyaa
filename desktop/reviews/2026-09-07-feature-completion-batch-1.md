# Feature completion batch 1 — source changes, not packaged

Implemented:

- Player sleep timer: Off / 15 / 30 / 60 / 90 / 120 minutes, real pause at expiry, pending autoplay cancellation and automatic next suppression. Saved autoplay preference unchanged.
- Desktop-only interface sizing at 85 / 100 / 115 / 125 percent. Updates rem-sized app text/controls immediately; video/subtitle sizing unaffected. Default restoration and storage errors handled.
- Local Library organization: Plan to watch / Watching / Completed / On hold / Dropped; named collections, search/filter, selection, bulk status/collection assignment and undo guarded against newer edits. Existing bookmarks, favorites and episode history untouched. This metadata is local, not account-synced.
- Explore can hide manually marked Completed titles while retaining original ranking numbers. Saved filter presets include this setting.
- Subtitle timing adjustments from player Settings persist by normalized torrent hash and episode, restore at decoder restart, and remain bounded to +/-120 seconds. Metadata refresh for the same release does not overwrite the live adjustment. Reset writes zero. Keyboard-adjusted offsets are not yet connected to this persistence path.
- Native preference disk writes stay serialized with memory updates. Removed delete-before-rename to preserve the previous file if publication fails.

Validation:

- TypeScript passed.
- Rust 50 tests passed after metadata/persistence changes.
- Player state 463 assertions passed, including timer and subtitle timing actions.
- Desktop contracts, 100-cycle controls soak and deterministic stalled-stream integration passed.
- Frontend behavior includes interface sizing, local organization/undo, and hidden-completed ranking semantics. One earlier full-suite run timed out waiting one second for four mocked ranking pages; isolated test passed. The behavior-test wait is now four seconds, explicitly not a production latency claim.
- Final frontend run: 119 tests across 31 files passed with normal parallelism after preserving poster-object identity during pagination. A two-worker run also passed. TypeScript passed on the final source. A prior parallel run also hit the five-second overall ranking-test deadline; production performance acceptance remains separate.

Still pending before the requested final installer: independent durable download ownership/queue and offline Library, shortcut conflict editor, spoiler controls, crash restoration, full diagnostics/export and release-window/card actions, full visual scaling review, live playback and isolated upgrade acceptance. Cross-device organization sync is not implemented. No installer or cleanup was performed in this batch; the prior installer does not contain these changes.
