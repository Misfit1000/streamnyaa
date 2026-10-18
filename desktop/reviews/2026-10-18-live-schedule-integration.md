# AnimeSchedule production integration

The user approved accepting AnimeSchedule's API terms, creating the StreamNyaa application and storing its application token only in StreamNyaa's Vercel Production environment. The application requests no anime-list or user-statistics scopes. `ANIMESCHEDULE_TOKEN` was saved as a Vercel Secret; no credential was copied into source, local configuration, release metadata or the installer.

## Live evidence

Production deployment [7ew1Cx98jBNcmjQ8pVQ9MtHz2QeH](https://vercel.com/rabin2071brt-6612s-projects/streamnyaa/7ew1Cx98jBNcmjQ8pVQ9MtHz2QeH) redeployed source `d88e4c23f679298b2e94aa0746c2356d51d8877b` with the secret. Vercel reported Ready.

The public StreamNyaa metadata gateway returned HTTP 200 for both ISO weeks 42 and 43 of 2026, with 271 and 269 records respectively. Both responses reported `stale: false` and retained their original retrieval timestamps. Week 42 contains 147 Original, 75 Sub and 49 Dub records. The canonical Beyblade detail request also returned HTTP 200. Sanitized public observations are in the companion JSON; these are live provider observations, not notification or installed-UI acceptance.

The reported **Beyblade X dub episode 101** is present with `airingStatus: delayed-air`, `delayedText: Break`, and no confirmed revised date (`0001-01-01T00:00:00Z`). The canonical links identify AniList 165159 and MAL 56566. The provider's explanation says it airs once every two weeks. This is evidence of the reported track's break, not a cancellation or proof that another release track is delayed.

## Repairs established by the live response

AnimeSchedule returns canonical website links without a URL scheme. The native parser now accepts these and protocol-relative links while still requiring an exact AniList/MAL hostname and a positive anime ID. Unrelated hosts, deceptive user-info URLs, FTP and zero IDs remain rejected.

The timetable's `status` describes the series; `airingStatus` describes the individual release track. Some rows have a delayed series but an already-aired dub. The native classifier now uses episode/track evidence exclusively; a partial response missing track status cannot establish a delay from the series status. Already-normalized persisted tracks remain compatible. This prevents a series-wide delay from incorrectly flagging an aired or scheduled dub. The reported Beyblade break retains its exact episode, Dub identity, previous date and unknown revised date.

Full Rust checks passed: **97 passed, one integration deliberately ignored without its local tracker/seeder harness**. That download integration had independently passed earlier with unchanged download code. Three added regressions cover actual canonical-link formats, cross-track status leakage and the reported Beyblade record. The first sandboxed Rust attempt could not access Tauri's build context; the unrestricted rerun passed. Existing TypeScript, 471 frontend tests, desktop contracts and player/streaming evidence apply to unchanged frontend/player files; the new native changes were tested separately.

## Acceptance boundaries

The older separate Vercel batch-history/preflight deployment blocker was also checked. The public `/api/download-history` POST preflight now returns HTTP 204, `GET,POST,OPTIONS`, and the planned `Access-Control-Max-Age: 600`. Main-branch deployments of the current API code are successful. This establishes deployment/header presence; an authenticated batch sync/database round trip remains unverified and no account history was modified.

The server credential/deployment and live provider-data blockers are resolved. The native parser repair must be included in the rebuilt installer. Installed Calendar interactions, actual Windows delivery/permission/restart behavior, OS display scaling, trusted signing and isolated Windows installation remain separate open gates. Initial import intentionally seeds existing changes without a burst of Windows alerts. The user reports that in-app YouTube playback now works; that report does not establish every trailer or eliminate provider verification challenges.

The requested cleaner delay/reschedule images are design previews only. They do not change the surrounding Calendar layout or claim implementation of a new status design.

## Installer and Git delivery

Built **0.1.10** from committed source `f7206642814045e71ce3afc2e84575ded53b1db0` and updated the usual release file at `StreamNyaa-desktop/desktop/releases/v0.1.10/StreamNyaa_0.1.10_x64-setup.exe`. The source is pushed to main. [Remote web verification](https://github.com/Misfit1000/streamnyaa/actions/runs/39105243099) and the [Production deployment](https://vercel.com/rabin2071brt-6612s-projects/streamnyaa/2xBFs5tbbkvSXnA6pGNn8zqUaXwj) both succeeded for that source.

- Installer size: **41,872,377 bytes**.
- SHA256: `D41EE9EB86AC05C350D214E35FA98BEC74EE619EF75F32AA9CAD7D5B88A57A77`.
- Executable product version: **0.1.10**; application identity unchanged.
- Signature: **NotSigned**. No signing gate is claimed passed.
- All **328** build input hashes were checked. The serialized source list was independently read back as an ordinary JSON array. All **six** bundled resources, including `mpv/fonts.conf`, matched staged hashes and exact NSIS inclusions. Independent installer extraction was not performed.
- The previous usual installer and metadata were archived at `releases/archive/v0.1.10-20261018-123409`; its SHA256 `33738FA35AAF01DF8CB3EA0C52194C475E10033AB00B9EE45A83579DF83A9869` was verified before and after archival. The earlier 0.1.9 installer is no longer available, so the verified previous 0.1.10 is retained for rollback.

The user's live installed profile was not overwritten or used to pretend to perform an isolated installation. New Watch-page and schedule-status mockups are previews and are excluded from this installer and Git.
