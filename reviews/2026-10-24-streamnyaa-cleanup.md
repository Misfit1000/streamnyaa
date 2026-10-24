# StreamNyaa workspace cleanup — October 24, 2026

Only real StreamNyaa directories inside `C:/Users/HP/Documents/New project 2` were eligible. The `StreamNyaa` junction points outside this workspace and was skipped. Older source checkouts contain independent/uncommitted work and were preserved.

## Measured storage cleanup

- Removed 23,795 generated files, totalling 15,103,304,598 logical bytes (14.07 GiB).
- C: free space increased from 37,336,530,944 to 50,084,368,384 bytes during removal: 12,747,837,440 bytes (11.87 GiB). Logical file sizes and recovered disk allocation differ; no compression/hardlink allocation equivalence is claimed.
- Removed integrated desktop `desktop/src-tauri/target` and generated `dist` output.
- Removed mobile Android `app/build`, `app/.cxx`, project `.gradle`, root `android/build`, local torrent-module `android/build`, and the two project-local `.npm-cache` folders.
- Every absolute deletion target was checked against an exact directory allowlist, its project boundary, reparse points, tracked source and active executable paths before recursive removal. No broad `git clean` or repository deletion was used.

All existing release artifacts, their manifests, installed apps, runtime data, downloads, history, signing files, SDK/JDK/NDK installations, dependencies and Git repositories were preserved. Post-cleanup SHA-256 checks matched all 1,269 protected source/release files, including 143 release files. The current 0.1.15 installer and verified 0.1.14 rollback are unchanged. The next Rust/Android developer build must rebuild its cleared intermediates; installed application performance is unaffected.

## Conservative source cleanup

Removed compiler-confirmed unused import bindings and five uncalled private helpers: legacy debug output, title-family/season-signal helpers, installment discovery ordering, and an unused settings status-color helper. Active source matching, native player code, history migration and publishing behavior are unchanged. A stale desktop contract that only asserted an unused thumbnail import now checks the actual `resolveEpisodeArtwork(...)` call; behavioral artwork tests remain intact.

Automatic approval review rejected the first broader automated patch because it included helpers still named in desktop contracts. That patch was not applied. The replacement deliberately retains those source-matching/artwork helpers and limits removal to the separately verified declarations above. No claim is made that every exported, compatibility or dynamically referenced declaration is unused.

## Verification

- TypeScript passed.
- Frontend: 749 tests in 117 files passed.
- Web/account contracts: 19 passed.
- Desktop contracts passed after correcting the stale import-only assertion.
- Production web build passed before deleting its generated output.
- No providers were load-tested, articles generated, installers rebuilt or personal records cleared.

The ignored `.validation/cleanup-*` receipts retain the exact selected paths, before/after byte counts, source audit and protected-file checksums. Historical checkouts with pending edits and the external junction were not modified.
