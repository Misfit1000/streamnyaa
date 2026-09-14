# StreamNyaa 0.1.8 download manager and completion follow-up — 2026-09-13

## Implemented in this build
- A native Windows folder picker opens before the first queued download. Cancellation adds no release. The selected directory is checked for write access and persisted in the version-1 native queue using additive, backward-compatible fields.
- Settings > Downloads changes the default for future releases. Every new release stores its original storage root; existing legacy downloads retain their previous offline directory. Removal still requires the exact owned release subdirectory and ownership marker.
- A globally available download manager dialog opens after Watch download requests and from the native player. The dialog supports individual/batch pause, resume, cancel, retry, file selection, bandwidth limits, offline playback and removal. Closing it does not stop transfers.
- Native player download requests now enqueue independent persistent transfers instead of copying from a playback-owned HTTP stream. Player requests open file selection so the user can choose the episode from a batch. Downloads remain independent of source switching and player closure.
- Offline Next uses natural numeric file ordering within the current release/folder. It respects autoplay, guards the current player path, and reports a missing next file. This is next-local-video ordering, not a claim that arbitrary filenames have verified catalog episode identities.
- Crash markers now persist exact position/duration alongside anime, episode and source identity. Explicit Resume uses this checkpoint; a failed open retains recovery data.
- Native catalog client identifies itself using the actual Cargo application version instead of a stale hard-coded 0.1.7 identifier.
- All earlier candidate changes, including the UI revamp/Classic switch and artwork/first-frame repair, remain included.

## Direct network observations
Normal public AniList requests from this PC returned HTTP 200: Top 100 score-sorted query with 25 titles and no GraphQL errors; recent airing feed with 25 entries; upcoming Calendar feed with 25 entries. No AniList hosts-file overrides or proxy environment configuration were present. These observations do not prove all installed UI requests, cooldown transitions, or future availability. A Jikan recent-listings request failed; secondary-provider live acceptance is still open.

## Compilation and packaging
TypeScript compilation and Rust compiler checking (including test source compilation) passed. Runtime suites and installed UI tests were not run in this turn, preserving the user's earlier instruction to do testing personally. Build log: .validation/2026-09-10-installed/download-manager-build.log.
The existing local release installer is updated at the user's request. Its prior installer, manifest and checksum remain in desktop/releases/archive/0.1.8-before-completion-20260909. Version and application identity remain 0.1.8 / xyz.streamnyaa.desktop. Installer is unsigned. Updating the release folder is not acceptance certification or a GitHub publication.

## Still incomplete / not claimed as passed
- Offline file progress is not merged automatically into catalog episode history or account sync: arbitrary release files lack verified anime/episode mapping.
- Full final frontend/Rust/player controls/stall/soak runtime regression, every action walkthrough, native first-frame/playback/source-switching/shortcut/recovery acceptance, and visual/scaling/reduced-motion checks.
- Restart/network-loss/disk-full/simultaneous-playback download matrix.
- Live account-sync round trips (account access required), signing (signing material required), isolated Windows clean install/same-version upgrade/rollback (isolated environment required).
- Complete primary/fallback/both-unavailable/recovery acceptance across Home, Explore, Watch and Calendar. Current successful AniList network requests do not close that matrix.
