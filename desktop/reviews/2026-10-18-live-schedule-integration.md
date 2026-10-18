# AnimeSchedule production integration

The user approved accepting AnimeSchedule's API terms, creating the StreamNyaa application and storing its application token only in StreamNyaa's Vercel Production environment. The application requests no anime-list or user-statistics scopes. `ANIMESCHEDULE_TOKEN` was saved as a Vercel Secret; no credential was copied into source, local configuration, release metadata or the installer.

## Live evidence

Production deployment [7ew1Cx98jBNcmjQ8pVQ9MtHz2QeH](https://vercel.com/rabin2071brt-6612s-projects/streamnyaa/7ew1Cx98jBNcmjQ8pVQ9MtHz2QeH) redeployed source `d88e4c23f679298b2e94aa0746c2356d51d8877b` with the secret. Vercel reported Ready.

The public StreamNyaa metadata gateway returned HTTP 200 for both ISO weeks 42 and 43 of 2026, with 271 and 269 records respectively. Both responses reported `stale: false` and retained their original retrieval timestamps. Week 42 contains 147 Original, 75 Sub and 49 Dub records. The canonical Beyblade detail request also returned HTTP 200. Sanitized public observations are in the companion JSON; these are live provider observations, not notification or installed-UI acceptance.

The reported **Beyblade X dub episode 101** is present with `airingStatus: delayed-air`, `delayedText: Break`, and no confirmed revised date (`0001-01-01T00:00:00Z`). The canonical links identify AniList 165159 and MAL 56566. The provider's explanation says it airs once every two weeks. This is evidence of the reported track's break, not a cancellation or proof that another release track is delayed.

## Repairs established by the live response

AnimeSchedule returns canonical website links without a URL scheme. The native parser now accepts these and protocol-relative links while still requiring an exact AniList/MAL hostname and a positive anime ID. Unrelated hosts, deceptive user-info URLs, FTP and zero IDs remain rejected.

The timetable's `status` describes the series; `airingStatus` describes the individual release track. Some rows have a delayed series but an already-aired dub. The native classifier now uses episode/track evidence and reads generic status only for legacy records that lack a track status. This prevents a series-wide delay from incorrectly flagging an aired or scheduled dub. The reported Beyblade break retains its exact episode, Dub identity, previous date and unknown revised date.

Full Rust checks passed: **97 passed, one integration deliberately ignored without its local tracker/seeder harness**. That download integration had independently passed earlier with unchanged download code. Three added regressions cover actual canonical-link formats, cross-track status leakage and the reported Beyblade record. The first sandboxed Rust attempt could not access Tauri's build context; the unrestricted rerun passed. Existing TypeScript, 471 frontend tests, desktop contracts and player/streaming evidence apply to unchanged frontend/player files; the new native changes were tested separately.

## Acceptance boundaries

The server credential/deployment and live provider-data blockers are resolved. The native parser repair must be included in the rebuilt installer. Installed Calendar interactions, actual Windows delivery/permission/restart behavior, OS display scaling, trusted signing and isolated Windows installation remain separate open gates. Initial import intentionally seeds existing changes without a burst of Windows alerts. The user reports that in-app YouTube playback now works; that report does not establish every trailer or eliminate provider verification challenges.

The requested cleaner delay/reschedule images are design previews only. They do not change the surrounding Calendar layout or claim implementation of a new status design.
