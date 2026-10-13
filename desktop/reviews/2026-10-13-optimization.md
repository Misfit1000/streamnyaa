# StreamNyaa Desktop 0.1.10 — measured optimization pass

This pass builds on `10a3b93`, preserves the existing visual design and Home readiness/source-classification rules, and retains version `0.1.10` and application identity `xyz.streamnyaa.desktop`. No storage schema or native wire migration is required. User media, bookmarks, accounts, settings and watch coverage are retained.

## Implemented and measured

| Controlled workload | Before | After |
| --- | ---: | ---: |
| Three mounted download surfaces, idle for 60 seconds: native queue reads | 65 | 3 |
| Native download-change listeners for those surfaces | 3 | 1 |
| 240 repeated lookups across four persistent caches: JSON decodes | 240 | 4 |
| Characters decoded in that cache fixture | 12,715,260 | 211,921 |
| Native checkpoint with History: storage reads / writes | 8 / 6 | 5 / 4 |
| New offline checkpoint: storage reads / writes | 11 / 6 | 8 / 4 |
| Unchanged offline queue observation: marker writes | 1 | 0 |
| Two admin catalog surfaces: subscriptions / scans per event burst | 2 / 2 | 1 / 1 |
| Regular/unverified catalog-monitor subscriptions and scans | Previously active | 0 |
| Hidden cosmetic countdown callbacks over 60 seconds | 60 | 0 |
| 400-item History or Library: extra descendant renders for confirmation open/cancel | 800 | 0 |

These are deterministic work counts using React/jsdom and controlled storage/native bridges, not measured installed-app CPU, memory, FPS, startup, network or torrent-throughput improvements. The cache fixture still performs 240 synchronous raw storage reads and clones 240 selected results to preserve direct-write detection and caller isolation. Progress counts exclude the bridge's sequence marker and unrelated UI subscribers. Native checkpoints without History retain their original four reads/two writes.

Downloads now share a stable external-store snapshot, coalesced native reads and one change listener. Native events and returned command snapshots update the surfaces; visible active transfers retain a two-second fallback and healthy idle observation uses 30 seconds. If native event attachment is unavailable, idle observation also retains a two-second fallback. Hidden UI observation stops and catches up on visibility return, flushing hidden command updates even when the next read is identical. Native transfer ownership, progress recording and reminder scheduling continue independently. Race handling prevents an old read from replacing a completed command. Queue mutations run in user order so delayed Pause responses cannot undo Resume; an open directory chooser does not block controls and reconciles on success. Errors preserve usable state, and listeners/timers clean up on unmount.

Persistent cache readers reuse decoded JSON while synchronously checking the current raw value. Direct set/remove/clear, backup imports, corrupt-data repair, quota failures and storage replacement remain visible. Selected results are isolated from caller mutation. Original timestamps, retention, provider identities and expiry checks remain intact.

Progress writes remain synchronous. Exact duplicate progress saves are skipped only after confirmed persistence; extra History coverage, legacy baselines, differing metadata and unknown duration retain the original merge path. Progress/history save helpers add boolean durable-success returns; their existing callers can ignore these returns. The optional History argument is an already-persisted progress record used solely for exact duplicate detection. Native replay markers and offline synchronization markers advance only after necessary writes succeed, so storage failures remain replayable. Authenticated accounts do not inherit guest synchronization markers.

Administrator catalog monitoring shares one subscription and throttled scan; regular/unverified accounts do not subscribe or scan. Hidden cosmetic clocks/scans stop without initiating provider retries. Absolute retry deadlines remain fixed, including legacy errors without `errorAt`.

History and Library reuse unchanged row trees with stable callbacks and correct data/view/spoiler dependencies. All rows remain mounted, preserving DOM identity, keyboard focus, search and scroll geometry. Relative time labels update on the next user render after a minute boundary without adding polling. Virtualization and estimated-height containment were deliberately omitted because no measured native benefit justified their interaction risks; Explore already memoizes its cards.

## Verification and delivery

TypeScript, 426 frontend tests across 72 files, 88 Rust tests (one existing ignored local-download integration test), desktop contracts and 525 native player-state assertions passed. Native controls/100-cycle soak and stalled-stream results are recorded in the adjacent installer manifest. Regression cases cover queue races, hidden/resumed observation, chooser cancellation, event/listener cleanup, manual panel dismissal, cache invalidation/mutation isolation, synchronous quota-failure replay, stale coverage, account boundaries, list actions/focus and retry deadlines.

The updated installer is delivered to the existing `StreamNyaa-desktop/desktop/releases/v0.1.10` location after checks pass. The previous verified current installer and metadata are archived before replacement. Version, resource hashes, executable version, checksum, size and signature status are recorded in the revision manifest. The missing original 0.1.9 rollback remains recorded; the previous verified 0.1.10 is the practical rollback.

Native sources and bundled playback resources were not changed by this pass. Installed WebView interaction, actual minimized-window behavior, native CPU/memory/FPS/startup measurements, real notifications, isolated install/upgrade/rollback, live account sync, public-torrent endurance, signing and the separate Vercel deployment remain unverified. No automatic installation, deployment or visual acceptance is claimed.
