# StreamNyaa 0.1.14: matching, discovery and playback

Strict and Balanced now filter the actual Watch rows, counts and quality choices, excluding conflicting or unverified installments. Broad retains seeded manual-review entries without making them automatic recommendations. Confirmed zero-seeder releases are excluded; unknown peer counts require manual review. Classification version 6 reclassifies restored results. Numeric sequels accept equivalent season spelling only with a matching canonical prequel. Shared TypeScript/Rust fixtures cover the pictured Cyberpunk releases and wrong-season cases.

Use starts playback, continuing automatically after a required file choice. One operation owns inspection, choice and launch, with duplicate-click and cancellation guards. Known conflicts can be inspected/downloaded in Broad but cannot play as the requested installment. Packs remain separate from individual releases; pack identity never proves an episode file exists.

The native handoff now reads the engine manifest and validates hash, manifest revision, file index, full path and size. Indexed stream endpoints replace playlist display-label equality. Nested paths, Unicode, spaces, brackets, commas, literal plus/percent characters and duplicate basenames have coverage. Ambiguous encodes and unknown numbering open a picker; unrelated best-score and subtitle fallbacks were removed. OVA installments are distinguished from bonus extras. Local resolution errors do not blacklist the release. Failure information distinguishes stages, file health is episode/file scoped, and success requires advancing MPV samples.

Discovery searches episode variants and title packs together. Title results are reused, page lanes continue until an actual empty/repeated page, and failed/partial pages remain unfinished. Existing 12-request/30-second desktop and 8-request/24-second web budgets remain. Visible searches with no eligible candidate may continue twice, then keep Find more. Upstream 403/429 and retry deadlines survive the gateway without fallback bypasses. Website manual-review controls preserve the existing design; known conflicts are absent from default downloads/recommendations.

## Final source validation

- TypeScript passed; frontend: **722 tests / 113 files passed**.
- Native: **134 passed, 8 opt-in tests ignored**; the local native acceptance test was separately run and passed.
- Web/account/config/ESM contracts: **19 passed**. Gateway: **3 passed**. Source denial/throttling: **2 passed**. Desktop contracts passed.
- Web production build, entry-asset checks and **13** standalone production-route smoke checks passed.
- Player state: **561 behavioral assertions**. Pointer/keyboard completion controls, real EOF, Next, Replay, Close, stalled recovery and **100-cycle** control soak passed.
- Controlled ten-file local torrent: metadata-only inspection added no Download; the actual `play_local_torrent` launch decoded episode 2 and same-pack episode 3, verified advancing MPV time, resumed, rejected stale file selections and kept a separate transfer engine alive. Nested Unicode/plus/percent filenames passed. Cached manifest resolution measured **9 ms**; native acceptance took **18.58 s**. Isolated ports, fixture engines and process-private cache/preferences/logs were used for final acceptance. No public anime media was downloaded.

## Controlled performance comparison

Compared baseline `7d354fa` against final discovery logic with 20 samples, a simulated 5 ms page fetch, six nonempty first-page lanes followed by empty pages, and the same 12-request cap. Median cold first usable result: **15.85 → 15.97 ms**; total pass **93.91 → 93.54 ms**, **12 requests** in both. Warm first result: **0.045 → 0.022 ms**, **0 requests / 12 cache hits** in both. The cold difference is below the agreed 50 ms investigation threshold. These are controlled discovery measurements, not live network/browser-load measurements or a percentage saving claim.

## Delivery and limits

Website production and final installer evidence are recorded after rollout. Desktop version is **0.1.14**; checksum-verified **0.1.13** must remain the immediate rollback. No publishing configuration or archive changes are included.

Clean installation/upgrade/rollback in a disposable Windows environment, physical 100/150/200% display checks and manual interaction with an installed desktop app were not performed. Automated Watch-controller pointer/keyboard tests and real bundled-MPV fixtures are separate evidence. External peers and mislabeled public uploads remain availability limits. Comprehensive security auditing remains deferred as requested. No public-provider load testing was performed.
