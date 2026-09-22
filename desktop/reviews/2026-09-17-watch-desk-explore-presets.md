# Watch Desk, Explore feed and saved presets — 2026-09-17

## Source changes

- Watch Desk is a closed-by-default, nonmodal 420px panel with pointer capture, movement threshold, keyboard positioning, viewport clamping, persisted position and focus restoration. It displays five resumable sources, three history rows and up to four known tracked releases. Resume uses the existing playback entry point; Details retains episode routing and missing-identity search.
- Upcoming releases use existing Home/bookmark/history data without an extra catalog request. Later loaded schedule data takes precedence over older bookmark data. No release times are fabricated.
- Explore starts a new recent-feed time window on first-page fetch/refetch. Subsequent pages retain that window and provider. The recent feed has a one-minute freshness window, focus/reconnect refresh, shared Home/Explore schedule validation, episode-level deduplication and explicit saved/live/fallback labels.
- Cached recent pages remain usable across cache-version migration, and saved episode cards take precedence over generic browsing alternatives after a refresh failure. Provider cooldown errors retain a retry delay, shown on disabled Retry controls.
- Presets migrate from v1 URL records to v2 IDs/timestamps. They strip pagination/provider/layout parameters, show readable summaries and provide Apply, Update, Rename/edit, duplicate detection and Delete/Undo. Applying retains the current layout. Backup includes v2 and importing a legacy backup permits v1 migration.
- Native stale responses are not promoted into fresh local metadata cache entries. Cache responses expose their original timestamp where available.

## Verification

- TypeScript: passed.
- Frontend: 199 tests passed across 49 files, including new preset manager, schedule validation, tracked releases, Watch Desk interaction and fresh-cursor/provider-locked pagination regressions.
- Web regression suite: 15 passed.
- Desktop contracts: passed.
- Rust data request coordinator: 4 passed.
- Desktop frontend bundle: built successfully. No installer was built from the overhaul source, as requested in the attached plan.

## Candidate and acceptance limits

The earlier player-only 0.1.9 installer exists and has verified version, size, checksum and unsigned status. Its staged Lua resource matches source. See `2026-09-17-player-0.1.9-candidate.json` for exact values. This candidate does not contain this source overhaul; the current release installer was not replaced.

Installer extraction remains unverified: automatic approval review rejected the command to download and administratively extract an archive utility, reporting only "blocked by policy". No compatible existing extractor was found. Staged-file equality is not claimed as proof of extracted installer contents.

The revised native layout, live catalog acceptance, physical dragging/touch/scaling and the prior player click acceptance matrix are not verified by these automated tests. No visual/native acceptance is claimed. Existing signing and isolated installation gates remain open.

## Subsequent combined installer build

The user subsequently requested all latest changes in the installer. Rebuilt 0.1.9 successfully from the current working tree using npm run desktop:build. The same NSIS installer path now contains the combined player fixes and Watch Desk/Explore/preset overhaul. The earlier player-only candidate and its manifest/checksum were archived under archive-player-only-55729f7 before replacement. See 2026-09-17-combined-0.1.9-installer.json for current checksum, source hashes and resource staging verification. Native acceptance remains for user testing; signing and extracted-installer comparison remain unverified.
