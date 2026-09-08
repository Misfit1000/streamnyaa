# 0.1.7 desktop-controls-explore-1 — implementation audit

This is a self-test installer requested by the user, not certification that every historical suggestion is complete. Desktop only. Earlier installers and account data are preserved.

## Included and checked in this revision

| Request | Implementation / verification |
| --- | --- |
| Separate MAL and AniList Top 100 | Separate services, native scores, filters sent before pagination; four underlying 25-item pages per 100-item block. No cross-service substitution. Frontend behavior tests cover 1–100, 101–200 and service switching. |
| Expand other Explore categories | Intersection-based loading and manual Load more; accumulated results survive later-page errors. Empty filtered scans are bounded after three nonmatching pages. |
| Expanded category filters | Genre, format, status, sorting, seasonal year/season; nearest upcoming premieres first. Saved named filter presets added, limited to 12, local only. |
| Truthful Explore state | Removed fabricated reconnect percentage. Incomplete loaded results are not labelled a definitive empty catalog. New episode pages retain one time boundary, including cached pages. |
| Player Settings clicks | Settings stays on top and clickable during buffering. Immediate changed hover paint; press/release target consistency. |
| 5–60 second seek controls | Corrected the rendered submenu action prefix. All options remain reachable by scrolling on smaller viewports; wheel scrolling a menu does not change volume. |
| Loading artwork / stale Retry | Metadata refresh no longer resets started playback. Removed timed artwork hold after decoder restart; hidden-control transitions clear stale OSD. Advancing configured video dismisses stale failure. Native failure messages are generation-tagged; older failures are ignored. |
| Player Download button | Existing selected-video save/cancel/progress retained. This is NOT an independent background download queue. |
| Existing layout changes | Watch top Resume banner removed, Back navigation retained, sources expanded by default; Home spotlight before Continue Watching; shared global search and updated Library/History/Profile/Settings retained. |

## Existing functions retained, not newly certified end-to-end

Same-source/backup recovery, canonical resume history, source matching and default quality, audio/subtitle selection and appearance, subtitles earlier/later/reset, keyboard shortcuts, fullscreen/mini-player, account synchronization, native sign-in/password recovery, bookmarks/favorites, completed/in-progress Library views, airing reminders, delay/cancellation notifications, settings backup, and cache controls remain in the desktop project. Automated tests exercise portions of these; do not equate that with live account, email, peer-network or installation acceptance.

## Not complete — broader earlier suggestions

- Independent background download manager surviving player closure/source changes, durable pause/resume queue, bandwidth limits, batch downloads and offline Library.
- Custom collections and the full Watching/Plan/Completed/On hold/Dropped workflow; bulk actions with undo.
- Sleep timer, shortcut conflict editor, independent UI-scale preference, per-release persisted subtitle offsets, and comprehensive spoiler controls.
- Hide-completed Explore filtering with correct rank semantics, additional card actions and release-window filters.
- Crash-session restoration and a complete interactive diagnostics-export workflow.
- Full app-wide latency/scroll/prefetch audit and measured performance acceptance across every screen.
- Reproduction of the original rqbit HTTP 500 failure, complete first-video-frame acknowledgement through the native bridge, exact manually positioned window restoration, five seeded release checks, 30-minute interrupted playback soak, live account sync and same-version upgrade in isolation.

These are deliberately recorded as unfinished rather than represented by decorative controls or silently removed from scope. External peer availability cannot be guaranteed.

## Tests before packaging

- TypeScript passed.
- Frontend: 112 tests, 29 files passed.
- Rust: 50 tests passed.
- Player state: 452 behavioral assertions passed.
- Desktop contracts passed.
- Bundled MPV: 100-cycle controls soak and deterministic stalled-stream test passed.
- Earlier input-specific D3D11 render captures and 30 mouse-click cycles passed; current generation handling covered by deterministic state tests.

See the staged release manifest for the final installer hash, size, source fingerprint, resources, signing status and production compilation result. No installation on the user's machine is performed by packaging.

## Packaging outcome

Built and staged `desktop/releases/v0.1.7/desktop-controls-explore-1/StreamNyaa_0.1.7_x64-setup.exe`: 41,674,785 bytes, NotSigned, 11,795 bytes larger than desktop-playback-repair-1. The copied SHA-256 matches the build artifact. NSIS version 0.1.7, currentUser install mode, xyz.streamnyaa.desktop identity and bundled MPV/rqbit/Lua resource directives were checked. Previous installers remain intact.

Cleanup was attempted only for the regenerable desktop Rust debug directory (approximately 3.94 GB). The environment rejected the deletion command before execution; no cleanup occurred and no alternate deletion method was attempted.
