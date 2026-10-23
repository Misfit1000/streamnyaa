# StreamNyaa 0.1.13: movie bounds, release timing and batch-only titles

Single-part movies use one shared bound for their episode rail, manual jumps, source requests and Next. Playback metadata disables native Next for the final part, retaining Replay and Close. Existing history is retained.

Web and desktop Home / View All use the same Sub-timed feed and stable snapshot pagination. Confirmed Sub schedules take priority; absent Sub times use a clearly labeled original-plus-45-minute estimate. Confirmed blocked tracks cannot be estimated. Dub-only uses confirmed Dub records. Timing is distinct from source availability. Saved cards remain visible during refresh failures; incomplete and stale native results are not cached as complete.

Watch retains retrieved nonzero-seeder listings for explicit selection. Batch sources are grouped separately and explain that one pack can serve multiple episodes. Use inspects the manifest; a unique verified episode is selected automatically, otherwise a file picker presents the actual release and the reason review is needed. Conflicting known seasons and non-video extras remain ineligible for automatic selection. Explicit selections remain bound to the manifest and requested episode. Quality/audio/confidence preferences continue controlling recommendations. Seeders alone do not prove playability.

The pictured numeric sequel followed by `2 - 01 ~ 10` previously lost its installment number when interpreted as an episode range. TypeScript and Rust now preserve it. Manifest-confirmed episodes have the existing Available from batch label; this does not change broadcast counts or Calendar dates.

## Verification

- TypeScript and 702 frontend tests passed.
- Web/account/config contracts: 19 passed. Gateway/database/ESM/release-pagination tests passed; frozen pagination makes zero provider calls.
- Native suite: 129 passed; live/environment-specific tests remain opt-in.
- Player state: 561 assertions passed. Pointer/keyboard, real EOF, Next, Replay, Close, stalled recovery and 100-cycle controls passed.
- A ten-file local torrent fixture inspected metadata without adding a Download, decoded selected episodes 2 and 3 in bundled MPV, reused the same torrent session and left the active transfer alive during native inspection. Cached native inspection measured 12 ms in this fixture; this is not a public-provider performance claim.
- Production web build and 13-route standalone-server smoke checks passed. No article or publishing configuration changed.

## Delivery / acceptance

Production verification and installer evidence are recorded separately after rollout. Version 0.1.12 must be checksum-verified and retained before preparing 0.1.13.

No public-provider load test or percentage savings claim. Full paired cold/warm interactive measurements, physical 100/150/200% display scaling, clean install, upgrade and rollback in a disposable Windows environment are not established by the automated checks above. Actual public packs still depend on valid files and reachable peers; the controlled fixture proves selection and playback mechanics, not every listed release.

The first production acceptance pass caught two missing integration allowlist entries: the browser public-cache namespace and the native dispatcher provider. Both now have transport-level regressions, beyond the mocked page tests. The real browser client validated a progressive production pass with 24 eligible records (13,077 ms during cold provider enrichment), then another 24-record pass in 3,799 ms. This is not a paired old/new speed comparison. The corrected native bridge also reached the public release gateway with real retrieval/completeness fields.

A saved complete production release snapshot returned 24 records in 931 ms in one normal client request. Home and View All were checked with the same cutoff and episode URLs. Release cards now show the selected Sub episode without duplicating the original-broadcast count as a competing episode label.

Production commit `9a6958a` was confirmed Ready in Vercel and matched the live hashed entry asset. A normal browser reload retained navigation, rendered 24 saved eligible cards and exposed stable Load More. Confirmed and estimated timing labels and selected episode URLs were checked. The prior verified production deployment remains available for rollback.

The current PHP RCE advisory does not match this Node.js/TypeScript and Rust application stack; no PHP source, Composer configuration or PHP runtime configuration was found in the repository. The npm advisory check on 2026-10-23 reported zero known vulnerabilities. This is not a security certification: cargo-audit was unavailable, and a full native/player/hosting security assessment was deferred at the user's request.

Final installer: **0.1.13**, 42,509,295 bytes, executable version `0.1.13`, SHA-256 `832B3E50BA02561CC01B71787A21F89CCF3D2BC0874059C57AE09EB3D1580422`. Authenticode status is **NotSigned**. All staged resource hashes and NSIS inclusions matched, the release copy checksum matched, and verified **0.1.12** remains the immediate rollback. Independent installer extraction and clean install/upgrade/rollback were not performed.

Release preparation completed by invoking the unchanged script in PowerShell 7 after the npm wrapper's Windows PowerShell process could not discover Get-FileHash. No checksum or resource check was bypassed.
