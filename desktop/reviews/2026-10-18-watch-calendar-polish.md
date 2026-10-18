# Desktop 0.1.10: Watch polish and durable Calendar updates

## Result

The Calendar's provider/parser success previously did not establish durable native delivery. The installed profile contained a version-zero orphaned `.tmp` cache and no primary schedule cache. `File::open` produced a read-only handle before `sync_all`; Windows flushing requires write access. A second race allowed a background refresh initialized before preferences to publish schema zero.

The writer now creates a write-enabled temporary file, writes and flushes it, closes the handle and atomically replaces the primary file. Native state starts at version 1. Recovery validates schema, qualified identities and record limits, and prefers a valid primary over an orphan. Failed saves retain live records and discovery cursors, publish `persistenceError`, and retry locally with bounded backoff independently of metadata requests. The frontend also retains its live snapshot when browser storage fails. Windows delivery waits for durable schedule storage; initial import still seeds prior changes silently.

Watch now has Home/Browse/My List navigation, a smaller details column, one-row Series Timeline, collapsed Cast, consistent existing episode artwork, a combined search/jump input and one selected-episode playback card. Resume position and unique watched coverage are separate labels. The closed-by-default Options drawer contains audio, quality, match/order, episode actions and source tools. Compact source rows retain actual release titles, quality/audio/codec/size, confidence and seed counts. Use chooses an eligible source for the central action and is invalidated by identity, episode or filter changes. Source-order filtering now preserves the chosen ordering instead of re-sorting it by confidence. Existing playback ownership, classification, uncertain-source review, discovery and download handlers remain in the controller.

Calendar reminders now use a compact button/next-alert line and a drawer with Followed titles and Scheduled alerts. The single bookmarks toolbar filter remains. Administrator alert testing stays inside management. Confirmed changes use compact status/time/Details rows, real provider dates, track labels and last-reported information. A delayed title can be followed without a revised date; no timed alert is fabricated.

Revamped is the only appearance. It is applied in the HTML shell and before React render, even without writable storage. Legacy preferences and personal backups normalize to Revamped while keeping interface size and Home layout. Classic switches, fallback branches and revert wording have been removed from the app.

## Verification

| Check | Evidence |
| --- | --- |
| TypeScript | Passed |
| Frontend | 493 tests, 83 files passed |
| Rust | 100 passed, 2 opt-in integrations ignored by the default suite |
| Live schedule integration | Explicit opt-in test passed: production gateway, canonical Beyblade identity, normalization, real Windows save/reopen, frontend View; initial changes seeded |
| Desktop contracts | Passed |
| Player state | 525 behavioral assertions passed |
| Player controls | 20 cycles and 12 episode replacements passed |
| Player stall | Passed |
| Player soak | Original unmodified test passed at 100 cycles and 12 replacements through a direct PowerShell wrapper; see runner caveat below |
| Browser layouts | 30 synthetic cases using the real presentation components; 960/1280/1920/2560/3840 widths, 100/150/200% equivalent CSS viewports, reduced motion, no page overflow, source Use, drawer/tab interactions and dismissal |
| Native UI | Separate debug identity/profile at 1440×900: real Frieren metadata/artwork/sources, compact timeline/playback card, Options, compact Calendar reminders and dismissal. Reopened native cache displayed Beyblade X dub episode 101 as On break / Awaiting new date |

Windows persistence regressions cover initial creation, atomic replacement/reopen, schema initialization, validated orphan recovery, primary precedence, failed-save retention/backoff and retry recovery. Frontend regressions cover live publication despite failed storage, version-zero rejection, appearance/backup migration, routing, manual navigation beyond stale airing counts, source selection invalidation, menus, focus and Calendar status variants.

The live gateway test uses the server-side credential already configured in Production; no token or account data is in source or the installer. The isolated UI profile was seeded from the native live test's published schedule View, then reopened by the application. This is staged end-to-end evidence, not an installed-profile notification test. Original/Sub/Dub remain separate; the Beyblade record identifies AniList 165159 / MAL 56566 and does not establish a delay for another track.

## Remaining acceptance boundaries

- The npm-launched 100-cycle soak failed three times with closed/broken IPC. The same original test passed through a direct PowerShell wrapper, and diagnostic copies also passed. Production player code/resources were unchanged. Runner/timing stability is unresolved; these failures are retained, not reclassified as successes or a repaired player crash.
- The native preview was inspected at one actual window size. Browser viewport/device-scale cases do not establish Windows 100/150/200% DPI acceptance or every installed interaction. Final installed playback, relocated download/file chooser behavior and all keyboard/touch combinations remain the user's interactive acceptance.
- Real Windows permission/delivery/tray/restart acceptance and an isolated Windows installation were not completed. Notification preferences and delivery history were preserved; no test alert was sent from the user's account/profile.
- Trusted signing material is unavailable. The installer signature status must be reported as NotSigned after verification.
- YouTube verification remains provider-controlled. Earlier user-reported working trailers are not a guarantee for every trailer; this pass does not change trailer transport.

## Delivery

Version and identifier stay `0.1.10` / `xyz.streamnyaa.desktop`. Build from the committed source, preserve the verified previous 0.1.10 installer and metadata as rollback, and update `StreamNyaa-desktop/desktop/releases/v0.1.10`. The companion installer manifest records source inputs, packaged resource hashes/NSIS inclusion, executable version, checksum, byte size, signature and exact rollback path. Generated previews, binary fixtures, scratch files and credentials are excluded from Git. Push normally to main after fetching current main.

Built and verified from `018df901a51b72670c10c98254d8543432095b6d`. The final schema guard additionally rejects a primary cache with no explicit schema marker, allowing a validated orphan to recover its records. The full Rust suite and explicit live gateway/cache probe passed again after that guard; frontend and player inputs were unchanged. Native UI inspection preceded this final disk-input guard; it is not installed final-binary acceptance.

- Usual installer: `StreamNyaa-desktop/desktop/releases/v0.1.10/StreamNyaa_0.1.10_x64-setup.exe`.
- Size: **41,892,928 bytes**. SHA256: `580E2540743BC93A940EC312DEB59435A3B713CF8E9A3AE9EF9C68D5C1EBECB6`.
- Signature: **NotSigned**. Executable version and application identity verified.
- Independently re-read the manifest and verified all **336 source hashes**, all **six staged resource hashes and NSIS inclusions**, installer/release-copy agreement, validation-log checksums and rollback checksum. Player Lua hash remains `AF75EB23DB44B44F1E068311087BBAD181309EB91BD7CA2CB027FE52C231989D`. Independent installer extraction was not performed.
- Verified rollback: `releases/archive/v0.1.10-20261018-141218/StreamNyaa_0.1.10_x64-setup.exe`, SHA256 `D41EE9EB86AC05C350D214E35FA98BEC74EE619EF75F32AA9CAD7D5B88A57A77`, with prior metadata/checksum/notes. The current release was not replaced until verification succeeded.
