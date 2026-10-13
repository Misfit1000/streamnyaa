# StreamNyaa Desktop 0.1.10 — Home source-verification coverage

The unchecked **Show unavailable titles** view still requires a current, safely matched episode source or a native-verified offline file. Checking the box includes titles whose availability is unknown; it does not establish that they have no sources. Application identity, version, user data and the existing player remain unchanged.

## Repair

- Home previously admitted only the first eight catalog candidates of each visible shelf into source verification. All loaded candidates of visible shelves now participate in round-robin discovery. Display rails retain their eight-card layout. Discovery remains sequential and bounded to 16 requests or 30 seconds per pass, with at least 60 seconds between additional passes in the mounted Home view.
- Shelf visibility, late catalog responses and layout changes update the running worker's candidate list instead of cancelling healthy requests. Route/foreground cancellation retains the unfinished query without creating a provider cooldown. Real provider retry timestamps are still respected.
- Rich catalog metadata and sparse recent/history cards of the same canonical entry share Home identity metadata. Recent source proof from Watch or an explicitly linked provider identity is reclassified locally against that identity before reuse. Wrong seasons, conflicting provider mappings, uncertain matches, stale results and metadata-only positives still do not qualify.
- Local reclassification preserves original retrieval and expiry timestamps. Fresh partial responses can establish a safe positive without claiming exhaustive discovery or a complete negative.
- Calendar's lightweight positive records can no longer overwrite unexpired source proof in either frontend or native persistence. They cannot extend that proof's age; expired proof remains subject to normal revalidation.
- Home explains that remaining titles await source verification and offers all-title browsing while checks continue. Both checkbox states retain the same background verification policy.
- Release tooling accepts revision-specific validation/evidence paths so this patch's installer does not overwrite the October 12 historical report.

## Verification

- TypeScript passed; 354 frontend tests passed across 64 files.
- Rust: 88 passed, one existing local-download integration test ignored by the default suite. Desktop contracts passed.
- New regressions cover 24 candidates across two bounded passes, no request overlap, shelf updates during an in-flight check, sparse/rich identity reuse, original cache timestamps, qualified provider equivalence/conflicts, wrong installments, fresh partial positives, stale/metadata-only rejection, cancellation/remount recovery, and Calendar proof preservation/expiry in both runtimes.
- This is a targeted Home/availability patch. Player Lua, streaming/seek implementation and bundled engine resources are unchanged; the October 12 player/streaming evidence remains the baseline rather than a newly executed native acceptance claim.

## Delivery and open gates

The rebuilt 0.1.10 installer belongs in the existing `StreamNyaa-desktop/desktop/releases/v0.1.10` release location. The adjacent revision manifest records source/resource hashes, executable version, checksum, size and signature status. The previous current installer and metadata are archived before replacement; the verified 0.1.9 rollback remains available.

Installed Home population with the user's live catalog/network has not been interactively accepted. External source availability and transfer speed remain provider-dependent. Signing material, installed UI/display scaling and notifications, isolated install/upgrade/rollback, live account sync, public-torrent endurance and separate Vercel deployment acceptance remain open.
