# Desktop integration into main — 2026-09-14

Merged desktop-fixes 87c3a8a into main 079a2d4 in an isolated integration worktree.

## Conflict resolution

- Preserved main's account-sync API, strict recovery relay, consolidated auth routes, web recovery parser and browser OAuth return route.
- Retained desktop native authentication, watched coverage and direct account sync. Web uses its existing sync implementation and journal; both providers share the consumer context. Added a regression for web journal isolation.
- Preserved main's web comparison, landing and downloads pages. Desktop variants use desktop-only route loaders, including main's downloads hook-order repair.
- Scoped reconnect refresh to desktop. Mobile source and existing main-only fixes were retained.
- Regenerated the combined dependency lock and updated browserslist/baseline-browser-mapping transitive build dependencies to pass the existing high-severity audit gate. Two moderate Vitest/mocker advisories remain; no breaking test-runner upgrade was attempted.

## Validation

- TypeScript: passed.
- Frontend: 179 tests passed across 44 files (177 in the complete run plus the two native relay tests rerun against the consolidated route).
- Web regression: 15 tests passed.
- Desktop contracts: passed.
- Web production bundle and asset/budget checks: passed, largest JS chunk 388939 bytes.
- Server bundle and production smoke: passed, 13 routes.
- Desktop frontend production bundle: passed.
- Native mpv player-state regression: 477 assertions passed with null video/audio output.
- npm audit at high severity: passed; two moderate development-tool advisories remain.

No installer was rebuilt or replaced for this Git integration. Rust and native player source are unchanged from the tested desktop commit. Full native visual acceptance, live account round trips, fault injection, isolated Windows upgrade/rollback and signing gates remain as recorded in active-completion-gates.md; this merge does not mark them passed.
