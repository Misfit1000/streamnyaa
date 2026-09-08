# StreamNyya Architecture Review

Repository: StreamNyaa-desktop, branch `desktop-fixes`, baseline `bf22ad6`, application version 0.1.7. Reviewed 2026-09-05.

This is a review, not a certification that every runtime path works. Findings below distinguish confirmed code defects from risks requiring reproduction. No application code, account data, settings, installed applications, or release artifacts were modified for this review. Mobile and web projects were not changed. File references are repository-relative.

## 1. Executive Summary

Keep the current stack. React, Tauri, rqbit and MPV are not inherently the problem. The most urgent defects are ownership and state-transition mistakes between them: a stream-readiness check is bypassed at timeout, cleanup can act on an obsolete session, and account synchronization can apply obsolete data.

The architecture already contains useful improvements: pooled native HTTP, reference-counted request cancellation, incremental source accumulation, resumable related-series traversal, canonical playback checkpoints, a Lua recovery watchdog, and server-side newest-record protection in the supplied SQL. Replacing these systems would unnecessarily enlarge the regression surface.

The strongest immediate release blockers are:

- An unready stream can still be returned as successfully prepared.
- Cleanup outside the session lock can affect a newer session.
- Sync responses lack account-generation and concurrent-edit protection.
- The binary staging loop can skip files after its first successful copy.

Current validation: TypeScript passed; 83 frontend tests in 22 files passed; `npm audit --omit=dev` reported zero known vulnerabilities. These are not proof of actual torrent playback, complete navigation reliability, or live account isolation. No new installer should be advertised as fixing these findings until behavioral reproduction and validation pass.

## 2. Current Architecture

```text
Desktop HTML/bootstrap → AppDesktop → Query/Auth/AccountSync providers → Router
                                      │                          │
                                      │                          └─ Zustand + local history
                                      └─ TanStack Query + public snapshots

Metadata/source requests → JS shared-flight bridge → Tauri commands
                            → native coordinator → pooled HTTPS → AniList/Jikan/Nyaa
                            → normalized results → queries → screens

Watch/source selection → Tauri playback commands → rqbit child → loopback media HTTP
                                               → MPV child → video/audio
                                                 ↕ IPC + Lua controls/watchdog
                                               → telemetry → UI/history

AccountSync → Supabase REST + user JWT → RLS-protected shared rows
```

Main technologies: TypeScript/React 19, React Router 7, TanStack Query 5, Zustand 5; Tauri 2/Rust/Tokio/reqwest; separate rqbit and MPV binaries; Lua native player UI. npm and Cargo lockfiles manage dependencies. PowerShell orchestrates Windows validation and NSIS packaging.

Important boundaries: `src/AppDesktop.tsx`, `src/pages/DesktopWatch.tsx`, `src/lib/desktop.ts`, `desktop/src-tauri/src/main.rs`, `desktop/src-tauri/src/data_requests.rs`, and `desktop/src-tauri/bin/streamnyaa-player.lua`.

Persistence is distributed across query snapshots, specialized metadata caches, local history/settings, per-user sync journals and temporary torrent directories. There is no need to add a new database to repair the immediate defects. The repository also retains server/web code and build paths; its presence is not proof that it is unused or bundled into the desktop runtime.

## 3. Top 10 Problems

1. **P0, confirmed: readiness bypass at timeout.** `desktop/src-tauri/src/main.rs:5128`, `wait_for_stream_with_session_guard`, returns `Ok(target)` whenever a media target exists, before checking whether any bytes arrived. This bypasses `stream_ready_for_player` and the following no-data errors. Fix the real function's terminal branch and test it with a playlist but zero downloaded bytes. This is a plausible contributor to the reported 0% buffering, not proof of every observed failure.

2. **P0, confirmed unsafe interleaving: stale cleanup.** `main.rs:4811`, `spawn_player_watchdog`, releases `playback_operation_lock` before `cleanup_transient_sessions(..., None)` and `prune_cache(..., None)`. A new stream can start between those operations. The storage-trip branch also issues stop commands before reacquiring ownership. `cleanup_session`'s generation guard does not protect these surrounding actions. Guard the entire mutation and protect the current cache path.

3. **P0, confirmed: sync race and account isolation gap.** `src/context/AccountSyncContext.tsx:257`, `syncNow`, captures local data before awaiting the remote fetch and subsequently replaces local data without checking the active account or intervening edits. `AuthContext` sign-out does not clear the shared library projection. A late response can apply after logout; a new account can capture the previous account's global library. Preserve guest data explicitly, scope projections, and check a session epoch after every await.

4. **P1, confirmed: packaging skips later files.** `scripts/prepare-desktop-binaries.mjs:49`, `copyFolderContent`, uses `changed ||= copyFileIfChanged(...)` and the same pattern for recursion. JavaScript short-circuits the right-hand side once `changed` is true. Subsequent entries are not copied. Execute every copy before aggregating its result; test fresh, partial and unchanged staging directories.

5. **P1, confirmed: timeout does not bound nested playback I/O.** `main.rs:1451`, `rqbit_get`, permits 35 seconds; `rqbit_post` permits 60 seconds. The readiness loop checks its 20-second budget between blocking calls, not during them. Session switching can therefore wait considerably longer than the advertised deadline. Thread one remaining deadline and cancellation identity through each operation, rather than adding another timer.

6. **P1, confirmed: broad process termination.** `main.rs:1603`, `stop_rqbit_server`, falls back to `taskkill /F /T /IM rqbit.exe` when no child is tracked. This can terminate an unrelated rqbit process. Restrict cleanup to the owned child/PID and fail safely when ownership cannot be established.

7. **P1, confirmed: malformed later source responses discard accumulated items.** `desktop/src-tauri/src/data_requests.rs:456`, `sources`, preserves items for transport failure but uses an early `?` for UTF-8 decoding and `return Err` for invalid RSS after earlier lanes may have succeeded. Convert lane validation failure to incomplete results when valid accumulated data exists. Test the native function, not only the JS accumulator.

8. **P1, confirmed: account collections silently truncate.** `src/lib/accountSync.ts:161` fetches at most 500 records; `libraryRows` and `watchRows` also slice to 500. There is no pagination at this boundary. Larger accounts can fail to transfer records. Add stable pagination and chunked upserts without changing record identities or deleting rows.

9. **P1, confirmed insufficient validation: cache deletion scope.** `main.rs:1065`, `is_safe_cache_path`, accepts any descendant of AppData, LocalAppData or Temp; `safe_delete_dir` trusts this. This is much broader than application-owned cache directories. Current caller restrictions reduce exposure, but the helper itself is not a safe ownership boundary. Validate an explicit StreamNyaa-owned root, refuse the root itself, and account for junctions/reparse points. Exploitability through current commands has not been established.

10. **P2, confirmed: automatic recovery ignores terminal errors.** `src/lib/desktopAutoRecovery.ts`, `installDesktopAutoRecovery`, excludes cancellation but does not honor `retryable: false`. Later attempts also ignore newly reported Retry-After values. Permanent failures can continue consuming active-screen requests. Respect structured terminal/transient classification on every attempt.

## 4. Torrent & Streaming Engine

The engine is an external rqbit process serving media locally. Source identity drives reusable cache directories. Existing generation tracking and preserving files during same-source recovery are worth retaining.

Do not interpret an advertised seeder count as a connected peer, a selected file as downloaded video, or a successful load command as a decoded frame. Record these as separate milestones: engine ready, torrent accepted, metadata ready, requested file selected, selected bytes available, player opened, first frame, advancing playback.

Besides the top findings, inspect the session teardown API against the bundled rqbit binary: `cleanup_session` attempts DELETE routes then stops the process regardless of their result. Verify the actual supported API before changing it. Torrent IDs can be reused between restarted engines; telemetry and commands need generation plus torrent ID, not torrent ID alone.

Large/batch releases require selected-file progress and seek-relevant bytes; total torrent bytes alone cannot prove playable data at the requested timestamp. Reproduce with controlled fixtures before tightening thresholds, since over-restrictive thresholds can also delay working releases.

## 5. Playback Architecture

MPV owns decoding; Lua owns native controls, buffering presentation and much recovery logic; Rust owns process lifecycle and local stream startup; React owns episode/source intent. This split is workable if request/session identity accompanies every transition.

The Lua script already has startup and mid-playback watchdogs, pause/cache distinctions and terminal recovery state. Preserve these instead of introducing a second recovery controller. The weak point is their contract with Rust: an early successful handoff is not readiness, and stale progress calls must not update a new player session.

`main.rs:5580`, `get_local_playback_progress`, matches the active session by torrent ID before blocking HTTP and does not establish a generation-scoped snapshot at that boundary. Reproduce an old poll completing after source switch and reject obsolete telemetry before publishing or updating buffer samples.

Buffer percentage must represent measured playable seconds against the configured buffer target, not torrent completion. Unknown depth needs an honest connecting state. Preserve pause, seeks, volume, speed, subtitles, audio selection, fullscreen and canonical position in regression tests.

## 6. Jikan & AniList Integration

The adapter `src/api/jikan.ts` handles both providers and normalization despite its name. AniList mapping now keeps a missing MAL ID null; desktop `fetchAnimeEpisodes` throws on failed/invalid responses instead of returning a successful empty list. Those are improvements, not defects to undo.

A numeric string check alone cannot prove an ID belongs to MAL. Require namespaced identity at adapter boundaries and verify caller mappings. `src/store/useStore.ts` still identifies records through `mal_id ?? id ?? title`, which is ambiguous when generic numeric IDs come from different providers. Migrate by verified mapping, never by silently treating one number as the other.

`src/lib/desktopSeriesTimeline.ts`, `loadSeriesTimeline`, preserves partial relations and resumes bounded batches. Missing entries are requeued; genuinely unavailable records have no terminal resolution in this helper. Add an explicit unresolved outcome and retry policy so a missing relation cannot keep the entire timeline perpetually incomplete. Do not label an incomplete graph as a complete single season.

## 7. State Management

TanStack Query for server data, Zustand for local preferences/library, and React context for auth are reasonable choices. Keep them. Define ownership instead of consolidating everything into one global store.

Account sync is the urgent exception: per-user journals sit above a global library/history projection. Establish an explicit user/guest scope and a generation-scoped sync operation. Recapture or merge edits made during a fetch; never replace newer local state with the pre-fetch snapshot.

The supplied `supabase/account-sync.sql` includes newest-update triggers that retain the existing record on equal timestamps. Preserve that safeguard. Its presence in the repository does not establish live deployment. Client races still matter even with correct RLS and server conflict handling.

## 8. Async / Concurrency

`src/lib/desktopRequests.ts` already shares equivalent work, tracks consumers, promotes foreground priority and cancels the native request when the last consumer leaves. The native coordinator similarly tracks clients and owns cancellable tasks. Preserve shared-request semantics.

Remaining risks: first-caller deadlines govern joined work; the native lane has concurrency/rate limits but no explicit pending-count cap; each queued waiter polls; playback uses a separate blocking path; account REST calls have no explicit timeout or cancellation. Add tests for last-consumer cancellation, priority promotion, queue expiry and account epoch changes before modifying concurrency.

Schedule recovery centrally. Do not layer page retries, bridge retries and independent polling around the same failure. Honor rate-limit instructions even after reconnect.

## 9. Performance

There are no new measured cold-load or memory baselines from this review. Do not claim the requested p95 targets have passed.

Useful measurement points: navigation intent, usable cached render, first metadata response, first compatible source, queue wait, torrent metadata readiness, first frame and stall recovery duration. Separate cache hits from cold requests and external outages.

Likely costs worth measuring: directory traversal during storage checks, repeated specialized-cache serialization, overlapping idle snapshot callbacks, relation enrichment while foreground loading, and native queued-waiter polling. The Lua 50ms periodic UI timer is conditional; measure draw activity before changing it. Optimize expensive measured paths rather than indiscriminately memoizing every component.

## 10. Resource Lifecycle & Memory Leaks

Confirmed lifecycle hazards are stale cleanup and broad process termination. They are higher priority than speculative heap leaks.

`desktopAutoRecovery` can retain pending entries after queries disappear from the cache because it only visits current queries. Bound/prune those entries. `desktopQuerySnapshot` schedules idle persistence without cancelling a previously queued idle callback before scheduling another; coalesce pending work.

Native shared-request subscriber cleanup and frontend abort listeners already have explicit teardown. No measured memory leak has been demonstrated. Test repeated open/close/source-switch cycles with process count, handles, memory, pending requests and cache size before asserting leak freedom.

## 11. Error Handling & Logging

Structured native data errors are a good foundation. Keep cancellation, timeout, invalid response, successful empty and incomplete results separate all the way to rendering. The malformed-RSS escape path shows that an accumulator alone does not ensure this.

`main.rs`, `append_log_line`, serializes and rotates logs, but writes the provided message directly; redaction is not enforced at this final sink. Apply centralized redaction and bounded fields in addition to call-site checks. Do not log OAuth URLs, JWTs, email addresses or full magnets. Existing log call sites need dedicated redaction fixtures before claiming diagnostic safety.

Consumer screens should say what can be done: reconnecting, retrying, another release available, or playback could not start. Provider names and technical stages belong in opt-in diagnostics.

## 12. Security

Existing defenses include HTTPS endpoint validation, no redirects in the coordinated HTTP client, bounded response reads, callback validation, CSP, user-JWT account access and RLS SQL. These should remain intact.

Prioritize ownership-restricted deletion and process termination; account-generation isolation; sink-level log redaction; and integrity verification of bundled binaries. `supabaseAuth.storeSession` stores bearer/refresh tokens in localStorage. This is an architectural exposure to a compromised WebView, not evidence of compromise. A later OS-protected credential migration needs compatibility, recovery and logout tests; it is not a casual cleanup.

The CSP permits broad HTTPS connectivity and inline styles. Narrow it only after inventorying required endpoints and testing art, authentication and trailers. This review does not prove live RLS isolation or the absence of every injection path.

## 13. Dependency Health

The current production npm audit found zero known vulnerabilities. This does not cover Rust advisories, downloaded MPV/rqbit binaries, or unknown vulnerabilities. Rust tests/advisory checks and native compilation were not rerun in this read-only review.

Pin and record binary version/hash/provenance: `prepare-desktop-binaries.mjs` currently stages from environment or developer-machine installation paths, including optional MPV configuration directories. A local executable upgrade can silently change the release payload. Test and lock the payload without removing required fonts/configuration.

Do not delete server dependencies merely because the active task is desktop. Establish import/build reachability first. Avoid major framework upgrades during playback stabilization. The existing `clean` script uses a Unix command; replace it later with a bounded cross-platform cleanup command, not a broad recursive deletion.

## 14. Testing Gaps

Executed in this review: TypeScript; all 83 frontend tests; production npm audit. No live account mutation, torrent playback soak, installer build or installation was performed.

`tests/desktop/run.ps1` contains substantial source-pattern assertions. They guard contracts but do not prove runtime behavior. `sourceAccumulation.test.ts` loops 300 accumulator cases; this is not a 300-navigation network-fault soak. Existing player tests should be retained, but helper tests do not cover the readiness function's contradictory timeout branch.

Add behavioral tests for: zero-data playlist timeout; native partial RSS followed by malformed RSS; switch during cleanup; stale telemetry after reused torrent ID; sign-out/account switch during sync; edits during initial sync; accounts over 500 entries; staging multiple files and directories; permanent recovery errors; cache-root escape/junction cases; and unavailable timeline relations.

Then run controlled end-to-end playback and navigation fault injection, followed by paced live checks. Publish measured results rather than converting unit-loop counts into user-navigation claims.

## 15. Technical Debt Inventory

| Severity | Area | File / symbol | Problem | Recommendation | Effort |
|---|---|---|---|---|---|
| P0 | Startup | main.rs / wait_for_stream_with_session_guard | Timeout bypasses readiness | Fix terminal branch with behavioral fixture | Small–medium |
| P0 | Lifecycle | main.rs / spawn_player_watchdog | Stale cleanup can mutate new session | One ownership guard for every effect | Medium |
| P0 | Account | AccountSyncContext.tsx / syncNow | Stale response and unscoped projection | Session epoch + pending-edit preservation | Medium–large |
| P1 | Release | prepare-desktop-binaries.mjs / copyFolderContent | Short-circuited copy calls | Execute every copy; fixture tests | Small |
| P1 | Streaming | main.rs / rqbit_get, rqbit_post | Nested calls exceed deadline | Shared deadline/cancellation contract | Medium |
| P1 | Processes | main.rs / stop_rqbit_server | Image-wide taskkill | Owned PID/child only | Small–medium |
| P1 | Sources | data_requests.rs / sources | Malformed lane discards earlier items | Return preserved incomplete results | Small |
| P1 | Account | accountSync.ts / rows and fetch | 500-record truncation | Pagination and chunked writes | Medium |
| P1 | Filesystem | main.rs / safe_delete_dir | Broad accepted roots | Owned subdirectory validation | Medium |
| P2 | Requests | desktopAutoRecovery.ts | Terminal errors keep retrying | Re-evaluate retryability and cooldown | Small |
| P2 | Timeline | desktopSeriesTimeline.ts | Missing relation retries indefinitely | Explicit unresolved state | Medium |
| P2 | Identity | useStore.ts | Mixed numeric identity | Verified namespaced adapter/migration | Medium–large |
| P2 | Persistence | desktopQuerySnapshot.ts | Weak per-payload validation/coalescing | Versioned validators and one idle writer | Medium |
| P2 | Credentials | supabaseAuth.ts | Plain WebView storage | Tested OS-protected migration later | Large |
| P2 | Reproducibility | prepare-desktop-release.ps1 | Same-version artifact overwritten | Preserve revisioned rollback before promotion | Small |

Effort is relative engineering scope, not a delivery-time promise.

## 16. Proposed Target Architecture

Keep the existing runtime, with stronger contracts:

```text
Views → typed query/intent adapters → existing request coordinator
                                   → validated cache/network results

Playback intent → generation-scoped session owner → rqbit + MPV
                                                → identified telemetry
                                                → existing Lua recovery UI

Account intent → user-scoped journal → serialized sync → shared Supabase rows
```

Extract modules from `main.rs` only after tests pin behavior: engine process ownership, cache ownership, playback orchestration, telemetry and auth callbacks. Do not introduce a second torrent engine, cache database, request broker or navigation system. Make identity, completeness and ownership explicit rather than adding more loosely related boolean flags.

## 17. Refactoring Roadmap

- **P0 — containment:** reproduce readiness bypass, cleanup race and account sync race; fix in separately reviewable patches. Block release on failures.
- **P1 — reliable boundaries:** fix payload staging, nested deadlines, partial source handling, owned-process cleanup, deletion validation and collection pagination.
- **P2 — responsiveness:** retry classifications, timeline unresolved states, queue caps, persistence coalescing and typed identity adapters.
- **P3 — maintainability:** extract tested native modules, consolidate diagnostics, document ownership and reduce duplicate adapters based on import evidence.
- **P4 — release hardening:** reproducible binary manifests, measured fault-injection gates, revisioned rollback artifacts, and separately planned credential protection/signing.

Each patch preserves public commands, settings keys, account schema compatibility and installer identity. Backward-compatible optional fields are preferable to a wholesale migration.

## 18. Quick Wins

Fix the short-circuit copy loop; preserve partial native sources on parse failure; honor terminal errors in auto-recovery; coalesce snapshot writes; correct release claims unsupported by tests. Each has a small regression fixture and should be isolated from visual redesign.

Do not classify deletion of unknown folders as a quick win. Remove only verified regenerable output when specifically needed, retaining installers, rollback artifacts, application data and diagnostics required for reproduction.

## 19. Things I Should NOT Refactor Yet

Do not replace rqbit, MPV, React, Tauri, TanStack Query or Zustand. Do not redesign navigation, retune source matching broadly, weaken season/episode validation, remove subtitle controls, change auth redirect behavior, or migrate storage while investigating startup reliability. Do not delete the copied server/web layers without a build/import inventory.

Do not ship a same-version installer simply because frontend tests pass. `prepare-desktop-release.ps1` overwrites the artifact and includes a claim that zero-data handoff never occurs; that claim contradicts the current timeout branch. Preserve the current artifact under a revisioned rollback name before a future promotion and write the manifest from actual validation evidence.

## 20. Recommended First Implementation Pass

First build deterministic reproductions around the actual native startup/cleanup paths and React account provider, without depending on a particular public torrent being seeded.

Then implement three contained fixes: reject unready timeout handoff while retaining reusable cache; make all cleanup/stop/telemetry effects session-generation scoped; and serialize/account-scope sync without losing edits made during network waits. Add the independent copy-loop fix before any packaging.

Acceptance: zero-byte metadata cannot report successful preparation; stale work cannot stop/delete/update a newer session; intentional pause/seek remains untouched; account changes cannot receive an old account's late response; edits survive synchronization; every payload file is staged. Follow with existing TypeScript/frontend/native/Lua suites and actual playback checks. Only afterward resume the wider improvement list or rebuild 0.1.7.

Per the attached instructions, this review stops before implementation. The safe next step is this bounded first pass, not a broad rewrite or speculative cleanup.
