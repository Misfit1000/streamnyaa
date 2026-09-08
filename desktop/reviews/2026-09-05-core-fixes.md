# Desktop core fixes — 0.1.7

Scope: StreamNyaa-desktop only. This follows the architecture review; it does not replace the player, torrent engine, account schema, routes or installer identity.

## Implemented

- Removed the timeout branch that returned a playable target solely because a playlist existed. Timed-out preparation now returns an explicit failure rather than bypassing the buffer gate.
- Added a shared local HTTP deadline for preparation, including nested stats/playlist requests, and a single budget across source-add candidates.
- Kept watchdog cleanup, pruning and stop commands inside the session ownership lock, with a generation check before any mutation. Storage checks compare generations as well as reused torrent IDs.
- Revalidated progress ownership after blocking HTTP and held the operation lock while collecting/publishing player telemetry.
- Removed process-name-wide rqbit termination. Untracked processes are left untouched.
- Preserved accumulated native source results when a later response has invalid UTF-8 or malformed RSS.
- Serialized account synchronization, re-captured edits after network reads, rejected stale session/epoch responses, and retained outgoing account and guest projections in separate journals.
- Added safe handling for local persistence failures; merged records are saved before replacing the visible projection.
- Paginated account collections and chunked writes instead of silently truncating at 500 records. REST calls have explicit timeouts.
- Restricted cache removal to known application cache roots or generated session directories within custom temporary roots; rejected symlink/reparse paths and unrelated sibling files. Native tests no longer sweep the installed application's legacy cache roots.
- Honored non-retryable request errors and refreshed retry cooldowns; removed orphaned recovery scheduler entries.
- Fixed payload copying so a changed earlier file cannot prevent later files/directories from being staged.
- Fixed the keyboard-control test's readiness race: temporary missing duration is tolerated only during a bounded startup wait; control assertions remain strict.

## Validation

- TypeScript: passed.
- Frontend: 92 tests passed across 24 files, including real provider lifecycle tests for edits during sync, logout, account switching, same-account re-login, and serialized sync.
- Rust: 45 tests passed, including nested deadline and cache ownership regressions.
- Desktop contract checks: passed.
- Native player state: 54 behavioral assertions passed.
- Native controls: 20-cycle and 100-cycle runs passed after correcting the test startup wait.
- Deterministic MPV stalled-stream integration: passed.
- Production desktop frontend compilation: passed.
- Diff whitespace checks: passed.

These checks do not establish a successful live torrent playback soak, account round-trip against the live database, or installer upgrade behavior. They must not be reported as such. Generation race changes still need a controlled live source-switch/close stress check.

## Release status and remaining scope

No installer was rebuilt, installed, published, or replaced. Existing release artifacts remain available. The installed desktop application does not yet include these source changes.

The broader review backlog remains: timeline resolution of permanently missing relations, complete typed identity migration, measured navigation/queue/load performance, diagnostic sink hardening, protected credential storage, binary provenance/signing and revisioned artifact promotion. Those are separate changes, not silently included in this stabilization batch.
