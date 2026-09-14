# Calendar redesign and ranking continuity

- Calendar now uses a broadcast-desk layout: numbered seven-day navigation, selected date heading, chronological release tickets with artwork, episode numbers, status and timezone, and separate save/reminder actions.
- Arrow keys, Home and End navigate day tabs. Reduced-motion styling disables transitions. Responsive rows wrap at narrow widths. A minute clock updates today/release grouping across elapsed time and midnight.
- Notification preferences are expandable; watch history follows the daily agenda. Recurring MAL slots use the same ticket presentation, sort by timezone/time, preserve explicit unconfirmed-episode labeling, and reset pagination when weekday changes.
- Failed AniList Top 100 with no loaded rankings requests a separate MAL preview using the selected filters, with explicit provider/score labels and an action to open the full MAL ranking. It never inserts MAL positions into AniList results. Partial cached AniList rankings remain available and retry independently.
- AniList live HTTP 403 remains unresolved. This change improves the failure flow; it does not claim to restore AniList access or exact episode schedules. No denial bypass was attempted.
- No automated tests or visual/live tests were run, following the user's instruction to perform testing personally. Compilation is not acceptance. Responsive and keyboard behavior remain unverified in the installed application.
- Original native playback, download fault, scaling, account-sync, isolated install/upgrade/rollback and signing gates remain open. Version remains 0.1.8; installer remains an unsigned, unaccepted candidate.
- Build log: .validation/2026-09-10-installed/calendar-redesign-build.log. Update the existing 0.1.8-20260912-010153 candidate installer in place; preserve the original release installer.
