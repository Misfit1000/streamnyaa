# Home, downloads and watched coverage — 2026-09-14

## Included in this build
- Continue Watching Details routes to the matching anime Watch page and episode, or title search when identity is absent.
- One Top 100 interface with automatic first-page AniList/MAL selection, provider-pinned subsequent pages and source attribution in a tooltip.
- Bookmark icons appear on hover/focus for mouse and keyboard users and remain visible for touch input.
- Watch Desk is a closed-by-default side drawer; Home layout customization lives under Settings Appearance.
- Active downloads use a compact dismissible transfer panel. Completion hides it; polling does not undo dismissal. File selection is separate. Full Downloads adds explicit filters, transfer metrics, folder access, location controls and separate record removal versus file deletion.
- Native playback records actual watched intervals, last position and furthest watched position. Seeking, pause and buffering do not inflate coverage. Rewatching merges intervals. Restart episode is explicit.
- Version-two coverage is additive to existing local records and the existing account source JSON, without changing account identity/schema. Legacy checkpoints remain resume baselines without fabricated intervals. Offline progress uses the same coverage semantics; account merges preserve intervals for surviving records.
- New commands: forget_download (keeps files), open_download_destination. Queue events optionally expose transfer telemetry.

## Validation
- TypeScript passed.
- Frontend: 178 tests passed in 44 files.
- Rust: 56 passed, 1 ignored.
- Desktop contracts passed.
- Native player-state: 477 assertions passed, including forward/backward seeking, pause, buffering and playback speed coverage cases.
- Native controls: 20 cycles passed. Stall passed. Soak: 100 cycles passed.
- Logs: .validation/update-*.log and .validation/home-download-cargo.stdout.log and .validation/home-download-cargo.stderr.log.

## Acceptance limits
Native UI inspection was stopped by the user with physical Escape before the new build could be inspected. No subsequent Computer Use actions were performed. Full native visual acceptance, live account-sync round trips, disk/network fault matrix and isolated Windows clean-install/upgrade/rollback remain unresolved. The installer is unsigned; building it does not mark these gates passed. This task updates the installer file, not the installed application.

Previous installer, manifest and checksum are archived and hash-verified at desktop/releases/archive/0.1.8-before-home-download-progress-20260914.
