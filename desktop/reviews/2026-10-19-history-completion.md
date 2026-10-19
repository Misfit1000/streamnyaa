# StreamNyaa 0.1.10 — durable history and completion controls

Validated source: `ee087dffc1753595f58bea8a41ab4a814f5a3824`. Native/frontend source is unchanged from `ad57e1c`; the final correction affects the separately deployed SQL migration. Application identity remains `xyz.streamnyaa.desktop`.

## Changes

- Desktop history and episode progress use per-owner SQLite, transactions and paged reads. The frontend keeps a bounded working set. Browser records, native checkpoints and account journals remain recoverable during restartable import. Legacy cloud rows are archived locally before retention is enabled.
- Actual resume position is separate from watched intervals. Five-second native checkpoints and pause/end/close saves remain. Native storage precedes event publication; failed writes retain recovery data and surface errors.
- Cloud synchronization uses a persistent outbox and authenticated transactional RPC. One current episode resume is retained for each of the 20 most recently played anime. All title tracking and watched markers survive retention. Per-account serialization, device acknowledgements and reset epochs protect concurrent edits and stale checkpoints. Qualified IDs remain qualified during migration.
- Watching/Completed uses title tracking. Automatic completion requires a finished title and all confirmed episodes watched. Ongoing titles can be caught up. Manual status and undo are account-scoped.
- Clear history removes local details and queues matching cloud resume removal while preserving watched markers. Reset tracking is separate and confirmed. Full backups use SQLite online backup; old JSON imports remain supported. Downloads and credentials are excluded.
- Episode complete owns rendering and input through EOF, idle and loading repaints. Next/Close/Replay dispatch through bundled MPV; pending Next can be cancelled. Replay reopens media if needed. The panel has Watch-style charcoal/crimson controls and keyboard focus navigation.
- Confirmed EOF displays `Ended · <last actual playback time>` when reported duration extends beyond the actual end. Decoder duration and watched coverage remain unchanged. Seeking/replacing media clears this presentation state.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Frontend | 90 files, 550 tests passed |
| Web/account API contracts | 17 passed |
| Local real PostgreSQL | Migration count/fingerprint, qualified IDs, 21st-title eviction, device sequencing, resets, aliases, RLS/account isolation and anonymous denial passed |
| Rust | 114 passed; 5 opt-in tests ignored in the default run |
| Separate native checks | Archive benchmark and isolated local torrent download/pause/resume/completion passed |
| Player state | 539 behavioral assertions passed |
| Bundled MPV | 20-cycle controls, stall recovery and 100-cycle soak passed, including actual seekable-file EOF and pointer Next/Close/Replay through MPV input |
| Responsive pages | 45 actual React renders with synthetic native data: small/1080p/1440p/4K windows, 100/150/200% browser scaling and reduced motion; no overflow/runtime errors |
| Production database | Approved migration and identity correction both returned “Success. No rows returned”. Deployed RPC returns 401/42501 to anonymous callers |
| Build | Windows x64 NSIS installer built; executable version `0.1.10` |

Three ignored native tests are opt-in live Tenrai/direct-bridge and AnimeSchedule probes; those network paths were unchanged and were not rerun for this history update. Native history tests cover real Windows SQLite creation/reopening/online backup, ownership, read-only save failures, failed-import atomicity and restart recovery. A physical full-disk condition was not injected.

## Measurements

100,000 synthetic episodes across 1,000 titles, written in 500-record transactions to a real temporary SQLite file without provider requests:

- Database: **33,443,840 bytes (31.9 MiB)**.
- Write/import: **13.15 seconds**. Repeated checkpoints update existing records.
- Fifty-row recent page over 100 reads: **p50 12.79 ms, p95 18.53 ms**.
- Standalone test process peak sampled working set: **15,601,664 bytes (14.9 MiB)**, sampled every 100 ms. This includes SQLite and the generator; it is not whole-app memory.
- Read model: 50 rows. The initial unoptimized page measured about 333 ms p95; the indexed recent query reduced that without changing retention.

The 100-cycle player run retained one owned MPV process. Its 12-replacement phase measured about 61.2 → 63.2 MiB working set. These are controlled fixtures, not public-torrent throughput evidence.

## Release and open acceptance

Resource/source hashes, checksum, size, signature and rollback are recorded in [the installer manifest](2026-10-19-history-completion-installer.json). The release preparer preserves the verified previous 0.1.10 installer and metadata. A 0.1.9 installer is absent; no old-version rollback is invented.

Production SQL deployment is complete. Real authenticated account migration, two-device round trips and a fresh-device restore remain interactive gates; local PostgreSQL tests do not claim those. Installed Windows pointer/DPI/focus inspection, physical low-disk behavior, isolated install/upgrade/rollback, Windows notifications and long public-torrent playback remain unaccepted. No signing certificate is available: **NotSigned**.

Deployment itself does not migrate or trim existing account history. An account switches only after the updated desktop commits and verifies its local archive. Already-evicted records cannot be reconstructed. Other devices retain their local archives; full older history on a new device requires a personal backup.
