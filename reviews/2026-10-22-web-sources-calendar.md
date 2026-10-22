# Web source discovery and false Calendar warnings

## Delivered behavior

- Both web source pages use the existing desktop alias, installment, episode, audio and bounded discovery primitives. Movies use title intent; episode queries also discover title-scoped packs. A successful first alias does not end discovery.
- Each search pass admits at most eight exact provider requests over 24 seconds, with two lanes and existing gateway pacing, coalescing and public caches. Unfinished pages can be resumed. Quality, audio, ordering and Show all are local views and do not restart discovery. This improves coverage; it is not a claim of fewer first-search requests than the former narrow search.
- Conflicting releases are excluded. Uncertain matches require an explicit checkbox. General text searches remain general until the user confirms the suggested canonical anime. Download history cannot silently inherit the first metadata suggestion's identity.
- Episode navigation allows manually requested episodes even when the metadata provider is behind. An ongoing title's planned episode total is not treated as its aired count. Upcoming metadata keeps source lookup idle initially, but an explicit source-listing action can proceed without changing the title's airing status.
- A compact, initially collapsed Batch downloads section offers whole-release magnet links, validated Nyaa torrent links and release details. Episode-file manifests are not inspected on web. Whole-pack actions record no individual episode. Clipboard failures do not create successful-copy history.
- Calendar no longer interprets a provider disagreement as a chronological move, or an unchanged refresh as another reschedule. Real previous dates survive repeated refreshes. Existing snapshots with equal old/new timestamps are repaired on read; presentation also guards older cached records. Other delay, cancellation, break and postponement evidence remains intact.
- Change explanations include dates, so different weeks cannot appear to be the same weekday/time.

## Evidence

- One production Calendar snapshot returned 299 records, including nine rescheduled records with exactly equal previous/current timestamps. The affected titles included White Cat Legend 3, Renegade Immortal, My Happy Marriage Special, Ranma's third season and Umayuru. Local reconciliation removed these nine no-op warnings. The snapshot was stale and incomplete, so this does not establish complete provider coverage.
- One public Infinity Castle title search returned HTTP 200 and 48 releases. Offline classification against the existing verified movie fixture produced 40 exact, seven uncertain and one conflicting title match. This tests listing identity, not torrent contents, seed connectivity or download speed.
- Controlled browser checks confirmed the existing dark layout, a separately expandable pack section, a manually selected episode beyond provider metadata, and a genuine Calendar revision remaining in Schedule changes while an unchanged entry moves to Airing Soon.
- Final checks: TypeScript; 688 frontend tests; 19 website/account/ESM contracts; 14 gateway/Calendar/publishing contracts; production build and asset checks; 13 local production route smoke checks.
- The ESM deployment check caught an extensionless helper import during development; the final code uses an emitted `.js` import and the deployment fixture includes that helper.

## Scope and acceptance limits

Website release only. Desktop stays at 0.1.12, with no installer or native player changes. No database migration, article generation, publication-mode change, account mutation or deletion of historical schedule/delivery records is needed. Existing free infrastructure is retained.

No public-provider load test, physical-display scaling test, native installation test, or actual torrent download was performed. Provider availability and manifests remain external constraints. No percentage performance improvement is claimed; regressions assert that changing view filters makes zero additional discovery requests. Production revision and post-deployment observations are recorded separately in local validation evidence.
