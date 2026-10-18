# Watch reference polish and Calendar repairs — 2026-10-18

Version remains **0.1.10**, identifier `xyz.streamnyaa.desktop`.

## Changes

- Home and Watch share the same logo/wordmark component. Watch retains Home, Browse, My List and Back. Its standalone Bookmark action is removed.
- Compact thumbnail Timeline, cached-only Cast previews, captioned landscape episode cards, horizontal trailer, selected-episode card and aligned Options fields follow the supplied reference. Source counters/discovery tools live in Options; actual release titles, codec, audio, size, confidence and seeders remain visible. Controller, source matching, download handlers and progress ownership are unchanged.
- Calendar groups the same canonical title and episode visually, retaining independent Original/Sub/Dub records, dates, statuses and notification delivery keys. Counts use distinct title identities.
- Native schedule normalization preserves the provider image route. Existing tracks recover missing artwork from their saved provider feed. Frontend artwork checks canonical cached metadata, handles image_url variants and broken images, and renders an accessible placeholder.
- The native schedule cache remains authoritative. Publishing its full snapshot no longer rewrites a duplicate multi-megabyte localStorage value or reports optional browser quota failure as native disk failure. Legacy/imported snapshots migrate before removal; backups serialize the live native view. Genuine native errors remain visible and clear on recovery.
- Actual installed logs showed repeated Jikan connection timeouts at the previous two-second connection bound. Connection setup now has six seconds within the existing eight-second HTTP bound. A connection-only failure can use the existing same-Jikan relay for the second attempt, within the original two-attempt budget. HTTP denial/throttling never triggers alternate routing. Cached episode pages hydrate immediately with original retrieval age; optional tail metadata remains independent.
- Jikan relay responses include original retrieval age and stale status. Older cached relay replies without provenance stay stale. The server's Jikan request is bounded to five seconds so cached/error responses can arrive within the desktop bound. This additive API change requires the main deployment.

## Verification

- TypeScript; 501 frontend tests / 84 files; 102 Rust tests passed / three explicitly ignored live/opt-in tests; 16 web API compatibility tests.
- Desktop contracts, player state (525 assertions), controls (20 cycles and 12 handoffs), stall and original 100-cycle soak (12 handoffs) passed. Soak used the direct existing wrapper; prior npm runner flakiness is not claimed resolved. No production player script change.
- Actual DesktopWatch and DesktopSchedule components, with synthetic metadata/native responses, passed 18 browser viewport/scaling combinations (36 page renders), small sizes through 4K, 100/150/200% equivalent CSS sizes, reduced motion, no horizontal overflow, grouped release tracks, source-mode selection and drawer dismissal. Screenshots inspected. Remote artwork was unavailable in this browser fixture; placeholder behavior was inspected instead. This is not Windows DPI acceptance.
- Isolated native preview built and launched using a separate profile. Computer Use activation failed with `GetCursorPos: Access is denied`; capture then returned black. Native visual/interaction acceptance is unavailable in this pass. The owned preview was stopped; user profile and installed app were not altered.
- Current real profile's native schedule cache exists with schema 1 and saved records. Disk has ample free space. The browser-cache warning path was reproduced with quota failure and repaired/tested; no claim is made that every possible filesystem error is eliminated.

## Explicit open gates

1. **Live Jikan episode connectivity remains unresolved.** Direct, IPv4 and relay probes timed out. The explicit native episode probe also failed; AniList connectivity succeeded. Connection recovery and cache durability are tested, but live episode-provider success is not established. Do not report that warning as universally fixed.
2. Real installed UI/mouse/touch and Windows 100/150/200% DPI, Calendar artwork delivery, Windows notifications/tray/restart and isolated installer installation remain user acceptance.
3. Main deployment of the additive Jikan gateway response/timeout requires verification. No provider credential is introduced or changed.
4. Trusted installer signing material is unavailable. Report the actual signature status; do not claim signing.

## Delivery

Build from the committed final source; verify source/resource hashes, executable version, installer size and SHA-256. Preserve the current verified 0.1.10 installer and metadata as rollback, then update `StreamNyaa-desktop/desktop/releases/v0.1.10`. Source and release evidence are pushed normally to main. Installer measurements are recorded in the companion JSON after packaging.
