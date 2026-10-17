# Desktop 0.1.10: artwork, Cast, schedule changes and in-app trailers

This is implementation and build evidence, not a claim that every live provider or installed interaction has passed acceptance. Application identity, version, existing visual design and user data remain compatible.

## Implemented behavior

- Watch uses one episode-artwork resolver for episode cards and selected-episode previews. It accepts explicit episode numbers or unambiguous canonical title matches, never list position, arbitrary story-title numbers or inferred season offsets. Duplicates and title-only refreshes preserve valid saved images and their retrieval timestamps. Broken images advance to consistent series artwork; accessible labels identify that fallback. Spoiler mode intentionally uses series artwork and numbered titles.
- Cast & characters is collapsed below Series Timeline. Expanding it loads real AniList metadata, with first-page Jikan fallback only for a verified MAL identity. Six cards appear initially, with Japanese, English and All languages controls, additional batches, responsive columns, provider-pinned pagination, cancellation and 24-hour caching. Existing cast survives refresh errors.
- Calendar merges canonical Original, Sub and Dub records without sharing release times across tracks. Explicit delayed, postponed, on-break and cancelled records remain visible when dates disappear or move out of the week. Revised times are labeled rescheduled, not inferred delays. Rows retain previous/revised times, awaiting-date text, expandable explanations and original freshness information.
- A versioned native schedule-change store drives Bell updates and Windows delivery while the app is running, including in the tray. It uses the existing Personal/Global preferences, canonical identities and track-qualified revisions. Initial imports do not generate bulk Windows notifications; catch-up is bounded to 24 hours and summarized. A successful OS notification call is required to record delivery; permission denial leaves Bell updates available. Resolved historical revisions are not delivered as current changes. Existing pre-air/airing/source-availability bells continue to describe the original broadcast, and known original postponements suppress obsolete checks. This does not introduce separate recurring dub availability subscriptions.
- AnimeSchedule metadata is requested through the server gateway, keeping the application token off desktop. Shared week caches refresh no more than every 15 minutes. Canonical identity hydration is bounded to 12 requests/30 seconds per pass and yields to foreground playback. Missing rows, failed requests and partial responses do not invent delays or cancellations. Backups preserve new additive state alongside existing preferences and delivery history.
- Trailers stay in the existing in-app modal with privacy-enhanced embeds, fullscreen delegation, a full-window fallback, Escape/Close, focus restoration and manual Retry. The same iframe survives fullscreen changes. Official player events distinguish playback from document loading and report supported errors. Windows client identification is scoped to HTTPS YouTube embed documents and uses the registered application identifier. It leaves account traffic and the WebView profile unchanged. Provider verification challenges are neither hidden nor bypassed.

## Automated verification

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Frontend complete suite | 467 tests, 80 files passed |
| Additional trailer modal regressions | 4 tests passed: fullscreen continuity/rejection, manual retry/errors, route cleanup/focus |
| Web compatibility | 16 passed |
| Rust | 94 passed, 1 ignored |
| Desktop contracts | Passed; label expectations updated for schedule-change statuses |
| Player-state | 525 behavioral assertions passed |
| Controls | 20 cycles and 12 episode replacements passed |
| Stalled stream | Passed |
| Soak | 100 cycles and 12 episode replacements passed on isolated rerun |
| Diff whitespace | Passed |

The first final soak attempt encountered a closed MPV IPC pipe without a classified cause. The isolated repeat passed with one owned MPV process; working set changed from 62,877,696 to 64,950,272 bytes across the transition portion. The prior complete soak also passed before the final Calendar-only changes. This is controlled regression evidence, not public-torrent endurance acceptance. The ignored Rust test requires the separate local torrent integration harness and is not counted as a pass.

Regressions cover thumbnail identity, duplicate/invalid images, spoiler fallback, cache provenance, lazy Cast/loading/languages/provider failures/pagination, schedule TBA retention/track isolation/restart deduplication, canonical identity validation, global/personal preferences, gateway failures/stale timestamps and trailer modal behavior. Browser and synthetic fixtures do not establish native visual acceptance.

## Live observations and unresolved gates

- A normal public AniList request for anime 154587 returned canonical MAL 52991, 12 Cast records with another page, 28 episode-image entries and no GraphQL errors. This validates the query shape for that title; it does not promise stills or Cast for every title.
- The initial deployed AnimeSchedule gateway returned HTTP 500 with `Unexpected end of JSON input`. After pushing source commit `615bf40`, the existing Vercel Git integration reported a successful deployment. A new production read-only probe returned HTTP 500 with the now-explicit cause: **`AnimeSchedule application token is not configured on the metadata server.`** Live delay coverage requires the owner to configure `ANIMESCHEDULE_TOKEN` (or `ANIMESCHEDULE_API_TOKEN`) in StreamNyaa's Production Vercel environment and redeploy. The available Vercel CLI account/team does not own that deployment, so the credential cannot be configured here. No unrelated Vercel project was modified and no token belongs in desktop or Git.
- The reported Beyblade dub delay cannot be accepted against current live provider evidence until that gateway works. Missing episodes alone are never labeled delayed. No promise is made of live announcements absent provider evidence.
- An opt-in debug profile launched the actual native WebView separately from the user's installed process. Startup and the accessibility tree were observed. Temporary delay data was explicitly labeled as preview data, not live provider evidence. The user saw the preview and asked to resume delivery. The owned debug/helper processes were closed; the installed application was preserved. Calendar interactions at 100%, 150% and 200% scaling, Cast interactions, real Windows notifications and the affected trailer's native playback remain for interactive acceptance.
- YouTube can still require verification, sign-in, or disallow embedding. Referrer integration is not proof that the reported trailer now plays. The existing WebView session is retained; no authentication or bot-control bypass was implemented.
- No signing material is available. Installer signature status must be reported as observed, not treated as signed. Isolated clean installation, same-version upgrade/rollback, live account sync and public-torrent endurance remain open historical gates.
- [Web CI for the source commit](https://github.com/Misfit1000/streamnyaa/actions/runs/39061831136) passed TypeScript and all 16 web tests, then stopped at `npm audit --audit-level=high`: six dependency advisories (one moderate, two high, three critical) in the unchanged JavaScript lockfile. They concern `@vitest/mocker`/Vitest, `proxy-addr`, `source-map-js`, `tinypool` and `undici`. Package manifests and the JavaScript lockfile are unchanged from `c075084`; a breaking Vitest/toolchain upgrade is outside this desktop feature pass. This CI/security gate is explicitly unresolved; the web production build and later CI steps did not run in that job. Vercel deployment success is not equivalent to a passing web release check.

## Installer delivery

The verified candidate is built from the source commit recorded in the adjacent installer evidence. Packaging verifies version 0.1.10, executable version/hash, staged binary/player-script hashes and exact NSIS resource inclusion, installer size, SHA-256, and signature status before updating the usual release location. Independent installer extraction is not part of this check.

The requested old 0.1.9 rollback is absent after the earlier cleanup. Preserve one verified previous 0.1.10 installer with its manifest, checksum and notes instead of inventing an older artifact. See `2026-10-18-artwork-cast-schedule-trailers-installer.json` for final output paths and measured packaging results. The installer is a candidate with the explicit live/signing/acceptance gates above.

Final packaging succeeded from source commit `615bf4097731ffc3cb883b3c4b07633fe9ea6e7d`. The usual `StreamNyaa-desktop/desktop/releases/v0.1.10/StreamNyaa_0.1.10_x64-setup.exe` is **41,873,167 bytes**, SHA-256 **`33738FA35AAF01DF8CB3EA0C52194C475E10033AB00B9EE45A83579DF83A9869`**, signature **NotSigned**. Executable version is **0.1.10**. All five staged binary/player resources match their source hashes and exact NSIS inclusions; the nested `mpv/fonts.conf` was verified separately as well. The previous installer checksum `31C0928583AD575AF46266BC9FFB31C4458B00D407494877F2102BD7F03F566F` and its metadata were verified and archived before replacement. No installation into the user's running app was performed.
