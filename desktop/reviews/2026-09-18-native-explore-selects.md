# Native Explore selects — 2026-09-18

## Repair
The user reports that all Explore menus open but option selection still fails in their installed app. The installed executable hash differs from the preceding generated installer. Rather than keeping the fragile custom popup, PremiumSelect now uses the WebView's native HTML select and option handling, with matching dark styling and a noninteractive chevron.

The shared change covers genre, format, status, sort, release window, year, season and ranking year. React updates the route and catalog query only from the native change event. There is no custom popup, coordinate positioning, document mousedown dismissal, or portal lifecycle between pressing an option and committing its value.

## Verification
- TypeScript passed.
- Frontend: 222 tests passed in 50 files, including all filter families and 2025 in Top by year, Top 100, and seasonal views.
- Desktop contracts passed; the old portal-specific assertion was replaced with a native-select requirement because native popups avoid container clipping without a portal.
- Native/Rust/player code unchanged; previous native suite results retained, not rerun for this frontend-only change.
- No interactive testing: the user will test the installed app.

Version and application identity remain 0.1.9 / xyz.streamnyaa.desktop. The usual installer is updated only after successful packaging and hash verification; its predecessor and metadata are archived. Code signing and interactive acceptance remain unresolved.
