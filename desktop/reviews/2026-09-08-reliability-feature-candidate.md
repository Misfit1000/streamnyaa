# Desktop 0.1.7 reliability/features test candidate

Includes the previously unbuilt feature-completion batch: sleep timer, local Library organization and guarded bulk undo, interface sizing, hidden-completed Explore filtering preserving ranks, per-release subtitle timing, and serialized player preference writes. Also includes local-budget Retry-After handling, sanitized transport failure flags and actual elapsed request timing, and protection against missing/nonfinite progress telemetry overwriting a valid resume point. Explicit playback restarts remain supported.

Validation on 2026-09-08: TypeScript passed; 120 frontend tests across 31 files passed; desktop contracts passed; 463 player-state assertions passed; 20-cycle controls integration, deterministic stalled-stream integration, and 100-cycle controls soak passed; all 51 Rust tests passed.

A single direct public AniList GraphQL probe returned HTTP 403. No bypass attempted. This does not prove all installed-app failures have the same cause. Live catalog reliability is unresolved; the installer is a test candidate, not a fully accepted reliability release. Live playback, account sync, visual scaling and isolated same-version upgrade acceptance were not performed in this pass. Existing installer revisions remain available; the installed app is not overwritten by testing.

Still outstanding: independent durable download queue/offline Library, shortcut-conflict editor, spoiler controls, crash restoration, fuller diagnostics/export, keyboard subtitle-offset persistence and complete live acceptance. Local organization is not account-synced. No claim that all prior suggestions are complete.
