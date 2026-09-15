# Player clicks and episode titles repair — 2026-09-15

Status: source repair implemented; native live acceptance incomplete. Do not replace the current released installer.

## Changes and evidence

- Preserve a pressed hit region across a buffering repaint when pointer bounds, window dimensions and interaction layer remain unchanged. A different target or changed layout cancels the click. The expanded regression fails on the original player with “Buffering repaint must not drop the pressed toolbar button” and passes on the repair.
- Cancel interrupted presses and handle complex double-click down/up events without firing fullscreen twice or swallowing rapid control clicks.
- Expire an unanswered next-episode request after 30 seconds, allow retry, and reject late responses by request identity.
- Check native command/property return values and stop a superseded frontend preference-sync batch from overwriting newer preferences.
- Add opt-in player input diagnostics (disabled by default) for coordinates, targets and dispatched actions. Raw mpv logs are local artifacts and are not included in this review or commit.
- Preserve cached episode pages if refresh returns an empty page. Keep requested pages independent of failures on later pages. Distinguish missing verified identity, loading, provider errors, cooldown and unpublished titles. Available streaming episode titles no longer produce a false empty-title warning.

This establishes a reproducible dropped-click failure; it does not establish that every reported unresponsive native button has the same cause.

## Verification

- TypeScript: pass.
- Frontend: 192 tests in 47 files pass.
- Web regression suite: 15 pass.
- Desktop contracts: pass.
- Player state: 485 assertions pass.
- Native controls integration: 20 cycles pass.
- Native stalled-stream integration: pass.
- Native soak integration: 100 cycles pass.
- Rust on unchanged native Rust source: 56 pass, 1 existing ignored test (previous verification in this repair session).

Automated native integration and synthetic media are not live acceptance.

## Unresolved gates

- Final-source GUI player launched, but Windows input returned `GetCursorPos failed: Access is denied. (0x80070005)`. No final-source real mouse-click acceptance is claimed. Windowed/fullscreen/mini-player, active playback/buffering, all visible actions and 100/150/200 percent display scaling still require live verification.
- Normal Jikan requests on 2026-09-15 to `/v4/anime/1/episodes?page=1` and `/v4/anime/21/episodes?page=2` returned HTTP 504. Cached titles and numbered navigation are protected, but uncached live episode-title recovery remains unverified. No alternate installment or invented titles are substituted.
- Installed-package live verification, isolated clean install/same-version upgrade/rollback and signing acceptance remain open.

Version and application identity remain 0.1.8 / xyz.streamnyaa.desktop. Current installer and release metadata must remain unchanged while these gates remain open. Candidate checksum, size, signature and resource input hashes are recorded separately after packaging; resource input hashes alone do not prove extracted installer contents.
