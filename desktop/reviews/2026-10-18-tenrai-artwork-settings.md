# 0.1.10 — metadata recovery, series artwork and compact preferences

The retired Jikan public service caused recurring episode-title failures. New requests use Tenrai's public catalogue through an endpoint allowlist. AniList remains primary for discovery, details, Cast and broadcasts; account OAuth and AnimeSchedule are unchanged. The gateway accepts the legacy `jikan` name and reports actual Tenrai provenance. It preserves upstream status/Retry-After, original cache timestamps and cancellation. Unsupported `/watch` requests never turn catalog titles into new releases. New Episodes retains real AniList episode events and saved genuine feed snapshots.

Episode-page caches retain legacy provenance, identities and artwork. Public transport cache keys include the adapter version. Recovery uses 30/60/120/300-second delays and absolute provider deadlines; regular-user notices omit technical HTTP details. Numbered navigation and source discovery remain usable without optional episode metadata.

Watch episode cards and native loading now use identity-bound series artwork. Native preparation ranks decoded candidates, contains unsuitable aspect ratios over a matte, bounds compressed reads to eight MiB and decoded images to 16 megapixels, and caches raw artwork within 128 MiB. Images and overlays share the composition; overlays preserve aspect ratio. Jobs write separate temporary outputs and check playback generation before late publication. Existing native video, seek, download and progress ownership remain unchanged.

Settings uses compact category navigation and keeps controls mounted while switching categories. Search/deep links, path edits, downloads, appearance, shortcuts, notifications, cleanup and backup remain available; diagnostic controls remain administrator-only. Library retains its poster grid, search, sorting, categories, collections, undo and confirmations in a smaller header/toolbar. Existing shell branding remains in use.

## Verification

- TypeScript passed. Frontend: 527 tests across 86 files. Web compatibility: 16 tests. Desktop contracts passed.
- Rust: 103 passed, four opt-in/live tests excluded from the ordinary suite. A separate live native-command test verified completed Frieren episodes, One Piece page two (starting at episode 101), and published current-season episodes. These use actual native scheduling/HTTP, not mocked responses.
- Player state: 525 behavioral assertions. Native controls: 20 cycles plus 12 replacements. Stalled-stream suite passed. Original 100-cycle soak passed in isolation, including 12 replacements. An earlier concurrent soak ended with a broken IPC pipe; its cause is not established and the failure is retained in validation evidence.
- Actual Settings/Library components rendered at 18 viewport/scaling combinations each (36 renders), including small windows, 1080p, 1440p, 4K and reduced motion. Category and backup navigation worked without horizontal overflow. Native responses were synthetic; this is browser layout evidence, not Windows DPI or installed acceptance.
- Release metadata separately records build inputs, resource hashes, executable version, installer size, checksum, signature status, rollback and deployment verification.

## Acceptance limits

Tenrai is a beta public metadata service, with limits and cached upstream data. A working episode request does not establish universal coverage, real-time schedules or torrent throughput. Native installed interactions, real Windows notification delivery, OS DPI, and an isolated installer installation remain user acceptance checks. Trusted signing material is unavailable; report the actual signature status. No credentials, account records, downloaded media or generated screenshots are committed.
