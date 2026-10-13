# StreamNyaa Desktop 0.1.10 — Home browsing repair

This revision supersedes the positive-source-proof requirement for Home browsing, following the user's request to exclude Chinese animation instead of leaving ordinary titles hidden until verification. The screenshot's 74 unverified titles were not 74 confirmed unavailable anime. Native logs record completed source requests, while Home's positive-evidence filter can still reject every result. This repair changes that display policy; it does not claim every title has a working stream.

## Behavior

- Ordinary Home catalog titles appear immediately, including titles whose source availability is unknown. Source checks remain bounded and run in the background; they no longer empty the banner and shelves. Existing strict/balanced/broad matching and playback safety rules are unchanged.
- Home's former **Show unavailable titles** control is replaced with **Show Chinese animation**, off by default. Only explicit provider country-of-origin metadata (`CN`) identifies Chinese animation. ONA format, names, Han characters and audio are not origin evidence. Unknown-origin records remain visible instead of being guessed away.
- Primary Home and episode-feed queries request `countryOfOrigin`, and the shared mapper retains it additively. A new Home query/cache metadata marker triggers refresh of older snapshots without removing their usable content or inventing timestamps. Providers that omit country information remain unknown; no extra per-title metadata requests are issued solely to infer nationality.
- The preference has its own versioned key, is included in personal backup/export/import, and does not modify Explore's existing availability preference. Legacy backups that omit it leave the current selection intact. In-memory selection remains usable if storage is unavailable.
- Verified source proof can still label an available episode and select a safe ready episode. Unverified Spotlight entries say **Open anime** rather than claiming a ready stream. New Episodes always opens its advertised episode, even when proof exists only for an older episode.
- Personal Continue Watching entries stay visible and retain their actual saved episode, independently of source-proof expiry and the discovery-country preference. History, bookmarks, accounts, downloads, watch coverage and source classifiers are retained.

## Verification

TypeScript, 445 frontend tests across 74 files, and desktop contracts passed. Ten new regressions exercise the mounted Home page with no source proof, origin filtering/toggle persistence, independent Explore settings, Japanese ONA/unknown-origin handling, advertised-episode routing, Continue Watching routing, quota failure, legacy cached metadata and personal backup compatibility.

A single normal public AniList request returned three Chinese-origin and three Japanese-origin records with `CN` and `JP` respectively, confirming the added field is accepted. The public response is recorded in [origin evidence](artifacts/2026-10-13-home-origin-live.json). No account credentials or authenticated requests were used.

Native/player sources and binaries are unchanged from the preceding verified optimization revision. The existing 88 Rust tests, 525 player-state assertions, controls, stall and 100-cycle soak evidence remains the unchanged-native baseline; those suites were not repeated for this Home-only repair. Build inputs and native baseline hashes are checked before packaging.

## Delivery and limits

Rebuild version **0.1.10** into `StreamNyaa-desktop/desktop/releases/v0.1.10`, archive the verified current installer and metadata before replacement, verify resource hashes/version/checksum/size/signature, and push the completed changes normally to `main`. The adjacent installer manifest records exact delivery evidence.

Installed Home interaction, native display scaling, real torrent startup, notification delivery, isolated install/upgrade/rollback and live account sync remain separate acceptance gates. Signing material and the original 0.1.9 rollback remain unavailable; the verified previous 0.1.10 is retained as rollback. This revision does not install itself or guarantee source availability by country.
