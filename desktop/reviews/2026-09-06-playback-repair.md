# Playback repair — in progress, not release approved

## Evidence

Installed-player logs showed local video HTTP 500 followed by automatic window resize. The native handoff ignored selected-file prioritization errors and accepted cached byte totals without checking video readability. The original failed engine session was no longer listening during investigation; its underlying HTTP 500 cause is not yet reproduced.

## Implemented in this batch

- Fresh MPV opens maximized with auto-window-resize and online extractor fallback disabled.
- Explicit mini-player exit restores previous maximized/fullscreen mode and viewport size. Exact manually positioned window coordinates remain to be implemented/verified.
- Local engine HTTP bypasses proxies and refuses redirects.
- File selection is checked before readiness; unknown/initializing/error torrent state cannot be considered healthy from cached byte counts alone.
- Selected local video must return a successful bounded byte read before MPV handoff. Probe failures retain a local-engine error category rather than silently reaching the player.
- File-selection response reads are capped at 64 KiB; error classification and fixed-size stderr draining exclude raw paths, URLs and credentials. Engine generation and elapsed time accompany diagnostics.
- Removed invented startup percentage floors; remaining startup metrics still require a complete truthfulness audit.
- Local-engine errors are excluded from release-health penalties.
- Watch top banner removed; Back uses router history with Explore fallback. Sources default expanded and reset expanded for a new episode. Home spotlight precedes Continue Watching. Bulky search submit button removed; Enter/search state preserved.

## Checks

- TypeScript passed.
- Frontend 97 tests passed; extended source-health test passed separately after its final edit.
- Rust 48 tests passed.
- Player state 301 assertions passed, including explicit mini mode and fullscreen/maximized restoration commands.
- Native controls 20-cycle integration passed.
- Production frontend build passed before the final source-health classification edit (rebuild needed for release).
- Real bundled rqbit tested in an isolated temporary fixture with DHT, peer listening and UPnP disabled. Cached verification, selected-file update and HTTP byte read succeeded. It returned HTTP 200 with the whole 64 KiB fixture despite a Range header; this does not establish seek support or decoded video playback. Fixture/owned test process cleaned up.

## Required remaining work

- Reproduce and repair the reported engine 500 with a failing session; the new guards prevent false success but do not alone repair its underlying cause.
- Check range/seek behavior with actual media and the exact installed engine API.
- Complete first-frame/advancing-playhead acknowledgement and generation-scoped opening/playing bridge states; MPV loadfile acceptance alone remains insufficient.
- Complete exact window-position restoration, loading artwork/percentage audit and visual tests.
- Finish Library, History, Profile and Settings redesign and behavioral coverage for changed navigation/default expansion.
- Five-release live acceptance, 30-minute playback/interruption soak, account/resume regression checks, isolated upgrade and installer packaging.

Subsequent packaging: `desktop-playback-repair-1` is now built as a separate unsigned 0.1.7 test candidate, per the user's request to test playback themselves. No installation was performed. The previous desktop-streaming-ui-1 installer remains intact. See the candidate's release manifest and `2026-09-06-player-seek-download.md` for final checks and limitations. Mobile and web projects are untouched.
