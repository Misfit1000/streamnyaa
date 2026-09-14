# Local continuity repair

User requested no further testing and will perform acceptance personally.

- Online search failures now expose a separate device-local result section using saved, favorited, Watch-cached and Explore-cached titles. Identity deduplication, content preference, query terms, genre, format, status, year, season, date and hidden-completed filters remain applied. These results are explicitly neither complete online search nor provider rankings.
- Calendar can use stored broadcast references after ordinary network endpoint failures. References are labeled as unrefreshed cached data, keep weekday/content/saved filters, and do not invent episode times or reminders.
- Includes the previously built episode final-page resolution, stable episode selection, episode pagination controls, Calendar day-tab wiring and provider-rank preservation.
- No automated or UI tests were run for these local continuity additions, per user instruction. Installer compilation does not count as acceptance.
- AniList HTTP 403 and Jikan endpoint errors remain external unresolved gates. Exact schedules and uncached search results cannot be claimed restored. Full original native/installation/account validation remains open.
- The previous UI test was stopped by the user with Escape. The preceding candidate installed successfully, but complete live retesting was not completed.

Build log: `.validation/2026-09-10-installed/local-continuity-build.log`. Installer output updates the existing candidate directory only.
