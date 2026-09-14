# Installed-app reproduction and repair

The latest installed candidate was tested through Windows UI Automation, not a browser preview.

## Reproduced before repair
- Fullmetal Alchemist: Brotherhood loaded 64 numbered cards and sources; episode-title metadata failed initially.
- One Piece initially displayed an empty episode rail. When page one loaded, selection jumped from 1 to 100 and the app incorrectly labeled 100 as its latest aired episode. No visible navigation to later metadata pages existed.
- Calendar loaded a broadcast reference but its main day tabs did not control that list. It displayed zero exact titles, duplicate broadcast titles and a second unavailable panel alongside successful fallback data.
- AniList Top 100 returned access denied. MAL loaded 97 visible titles from the first 100 positions after content filtering, but ranks were compressed after omissions. Ranking controls were present in the installed app.

## Repairs
- Episode loading resolves the final metadata page, preserves partial results if that request fails, and exposes previous/next/latest-page navigation. Default selection stays at episode 1, rather than moving when metadata arrives. Partial counts are labeled as loaded counts.
- Calendar day tabs control the fallback weekday. Normal filtered requests fall back to all-week or seasonal reference data on ordinary errors. Broadcast rows are deduplicated. Exact-time and history-feed failures are no longer labeled as zero valid results, and fallback timezone labels are explicit.
- Provider ranking positions survive content filtering. All-years rankings no longer display the current season as their subtitle.

## Validation
161 frontend tests, TypeScript, desktop contracts, 470 player-state assertions, native controls, stalled-stream integration, 100-cycle soak, and 56 Rust tests passed (one Rust test ignored). A prior full frontend run timed out in the ranking navigation test under concurrent load; the isolated test and subsequent full run passed.

Build, same-path candidate update and installed retest are pending. AniList access denial, upstream availability, isolated clean installation and full original acceptance gates remain unresolved.
