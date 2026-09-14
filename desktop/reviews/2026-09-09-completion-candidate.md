# Desktop 0.1.8 completion candidate — September 9–10, 2026

Status: **not accepted for release**. The completion objective remains active. The existing `desktop/releases/v0.1.8` installer has not been replaced or installed over. Changes start from `c591590338e2e2bedbe2181b6fe4c81468df0bec` with the pre-existing local recovery work preserved. Work is uncommitted on `desktop-fixes`.

## Implemented in the working tree

- AniList-first Home, Explore and seasonal loading, with bounded provider cooldowns, existing caching/coalescing, Jikan fallback where a supported equivalent exists, and background primary recovery probes. Explore pins pagination to one provider and preserves provider IDs, filters and saved results. New-episode/trending feeds explicitly report the lack of an equivalent fallback. Separate ranking services never silently switch. Both-provider errors identify each provider.
- Native versioned download queue, one concurrent release, separate rqbit process and durable offline directory outside playback cache. Pause/resume/cancel/retry, bulk queue selection, bandwidth limit, disk-space guards, explicit removal and missing-file errors. Restart requires explicit resume. Windows job ownership prevents an orphaned download process after app termination. Typed Tauri commands and a versioned queue-change event connect the Library UI.
- Offline Library enumerates completed release videos and opens them with the native player. Cancel retains partial files; explicit Remove deletes only an owned release directory. Retry re-verifies retained data. Downloads are owned independently of playback source switching and player closure.
- Crash restoration matches anime, episode and release identity, requires explicit Resume and retains recovery information if opening fails. Conditional clearing protects newer session markers.
- Spoiler preference suppresses stored episode artwork in Continue Watching, Library and History in addition to Watch and player startup artwork; release labels in History/Library become episode labels. Episode navigation remains available. Calendar notifications currently contain series titles and episode numbers, not episode titles/stills.
- Explore Save/Favorite actions use existing store identity. Release-window filter is retained in saved presets. Guided diagnostics report native tools and both providers with actionable outcomes and export only fixed check labels/statuses/advice, excluding account data and paths.
- Player-control test now waits for registered Lua bindings and bounded property transitions instead of fixed 80–120 ms sleeps. A failed K check passed on reproduction; startup timing was the observed test race.

## Verified evidence

Local evidence directory: `.validation/2026-09-09/` (ignored by Git).

| Check | Result | Evidence |
| --- | --- | --- |
| Final TypeScript/frontend | Pass: 142 tests, 37 files | `final-regression.log` |
| Desktop contracts | Pass | `final-regression.log` |
| Player-state | Pass: 470 behavioral assertions | `final-regression.log` |
| Native controls / stall / soak | Pass: 20 cycles, stall scenario, 100 cycles | `final-regression.log` |
| Rust | Pass: 56 ordinary tests; one integration test intentionally ignored in this command | `final-regression.log` |
| Separate native download integration | Pass: real local tracker/seeder, rate-limited transfer, pause, retained pieces, resume, byte verification and completed queue reload | `download-final-integration.log`; fixture directory recorded there |
| Native Home / Explore failure states | Observed explicit unavailable state; no live catalog-success acceptance | `native-explore-unavailable.png`; inline Home capture |
| Native Library empty queue layout | Pass at approximately 1280×800 client size | `native-library.png` |
| Native diagnostics | Player tools ready; AniList access-denied; Jikan single-title request responding | `native-diagnostics.png` |
| Native shortcut save | UI reported saved; isolated `player-shortcuts.json` contains pause `q` | `native-shortcut-save.png` |

The local torrent fixture contains deterministic test bytes, not playable footage. It proves transfer and persistence behavior, **not native video acceptance**. The native UI observations were made with an isolated debug app using the built frontend. They do not replace installed-candidate acceptance. No screenshot is claimed as 1080p/1440p/4K or OS scaling acceptance.

## Still open — engineering and live validation

- Live AniList access restoration, success→fallback→primary-recovery and both-unavailable behavior across Home, Explore, Watch and Calendar. Normal requests returned 403; Jikan single-title requests succeeded but list requests timed out/returned 504. No bypass was attempted. Calendar retains its existing exact schedule behavior; an approximate Jikan schedule must not be presented as exact episode airtimes.
- Complete episode/file selection within a batch release. Current downloading is release-level; bulk selection controls queued releases. Do not describe it as a per-episode batch picker.
- End-to-end offline playback progress/recovery identity and next-episode behavior, actual video decoding and first-frame detection. Current offline player integration alone does not establish these.
- Download process restart/hard-crash, network interruption, actual disk exhaustion, simultaneous playback, retry repair and removal fault matrix. Queue decoding and disk guards are implemented; the local pause/resume test is not the entire matrix.
- Full spoiler coverage acceptance including older source labels, active player surfaces and offline filenames. Native crash resume, exact checkpoint/preferences restoration and failed-open retention need end-to-end footage tests.
- Walk every retained action across Home, Explore, Watch, Library, History, Calendar, Profile and Settings, including shortcut save/reopen/player behavior and diagnostic export in the native app.
- Native startup/layout at small, 1080p, 1440p, 4K and 100–200% OS scaling; keyboard focus/navigation and reduced motion. Current single-window observations cover only a subset.
- Real source switching, resume, subtitle-heavy footage, exact window restoration, performance timings and live account-sync round trips. No account credentials or authenticated test account was supplied.
- Isolated Windows clean install, same-version upgrade preserving settings/history and rollback. No isolated Windows VM/Sandbox was established. Launching a release executable here would register application deep links; the debug-only isolation flag is not treated as release isolation.
- Distribution signing: no usable signing certificate was found. Candidate signature status must be recorded; unsigned is not a signing pass.

## Installer retention

The previous installer, manifest and checksum were copied to `desktop/releases/archive/0.1.8-before-completion-20260909/` and each copy was hash-verified. Original installer SHA-256: `06DA17E205FA7C79729505E7AD2BCED225B10D2A4A4410ABEAE4DABB27FEA64A`; size: 41,680,964 bytes.

`scripts/prepare-desktop-candidate.ps1` packages into a unique `desktop/releases/candidates/` directory, records signature/version/size/checksum/resource inputs and source hashes, and marks acceptance false. It cannot replace the current release directory. Do not run the old `prepare:desktop-release` overwrite path while these gates remain open.
