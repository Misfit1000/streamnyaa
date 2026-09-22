# Desktop storage cleanup — 2026-09-17

Removed 9.518 GiB (14,929 files) from StreamNyaa-desktop:

- Regenerable Rust target/debug and target/release outputs, including duplicate bundled installers.
- Obsolete desktop/releases/archive and desktop/releases/candidates builds.
- Previous desktop/releases/v0.1.8 release.
- Stale generated dist output in the older desktop-fixes checkout.

Every recursive target was resolved and checked to remain under the desktop workspace, contain no reparse points and contain no tracked files. No Rust build processes were active. Exact paths and byte counts are in 2026-09-17-cleanup-targets.json.

Kept the combined installer in desktop/releases/v0.1.9, including its manifest and checksum. Its SHA-256 remained F5D26645B4496C8D121BB5733E15C34B68E7041F4EF6AEBA87B186527D3F6297 after cleanup. Old artifact paths in historical build records now refer to intentionally removed build outputs; use the v0.1.9 release location.

Preserved Git history/worktrees, source, dependencies, bundled source binaries, UI rollback backups, diagnostic evidence and installed application data/downloads. The next native build will need to regenerate its deleted compilation cache.

Removed TypeScript-confirmed unused declarations from the active main-integration desktop Home and Explore source: old placeholder catalog arrays and their unused factories, unused imports, obsolete sorting/provider helpers, unused detailsQuery and homeLoadPercent. No runtime feature or installer was changed by this source-only cleanup.

TypeScript and desktop contracts passed. Frontend tests initially could not start because the sandbox blocked esbuild (spawn EPERM); an outside-sandbox verification was requested.

Approved frontend verification completed: 199 tests passed across 49 files.
