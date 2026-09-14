# Installed StreamNyaa 0.1.8 smoke test — 2026-09-10

Tested the running installed application at `C:/Users/HP/AppData/Local/StreamNyaa/streamnyaa_desktop.exe`, not a debug or browser preview.

## Build identification
The installed executable is 5,663,232 bytes, version 0.1.8. Byte comparison with the final candidate application found exactly three differing bytes: Tauri's bundle-type marker is NSS in the installed executable and UNK in the post-build output. All remaining bytes match. Installed mpv.exe, rqbit.exe and streamnyaa-player.lua hashes match candidate resource inputs.

## Observed results
- Home renders existing cached content and Continue Watching, with an explicit catalog-update failure notice.
- Library retains 12 saved titles. History displays 18 entries (13 in progress, 5 completed).
- Downloads and Offline Library shows the new bandwidth control and Pause/Resume/Cancel/Retry selection controls. Empty-queue controls are disabled. No download was started in this installed-app pass.
- Settings opens and native tools report Ready. Guided diagnostics returns Primary catalog: access-denied; Fallback catalog: Responding. This only proves the diagnostic single-title request.
- History Resume opens the installed bundled MPV for the selected saved episode. Actual video and rendered subtitles are visible. Playback advances and K pauses at 3:18. Exact initial resume accuracy and the mismatch between older stored duration (31:01) and current player duration (23:50) remain unverified.
- F enters fullscreen; Escape returns to the previous window mode. The player is left paused.
- Calendar retains its reminder and shows schedule-refresh failure. Exact live scheduling is NOT a pass.
- Explore Trending explicitly reports AniList unavailable and no equivalent secondary feed. Filters and release-date selector render. Catalog success is NOT a pass.

Evidence: `.validation/2026-09-10-installed/playback-paused.png` and `calendar.png`, plus inline native captures. Native player capture was 1920x1032 in windowed mode and 1920x1080 fullscreen; this does not establish the full OS scaling matrix.

This is a limited installed-app smoke test. Full source switching, download faults/offline playback, account-sync mutation round trips, clean install/rollback and multi-resolution acceptance remain open. No settings/history were cleared, no accounts changed, and no old/debug screenshot was used for these results.
