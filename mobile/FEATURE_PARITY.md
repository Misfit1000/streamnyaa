# Desktop-to-Android feature parity

The desktop product lives on `main`; the Android product lives on `mobile`. This audit compares user workflows, not only route names.

## Parity map

| Desktop workflow | Android implementation |
| --- | --- |
| Animated home spotlight, continue watching, trending, popular, airing, upcoming | Swipeable featured carousel, synced/local resume card, and four touch-friendly media shelves |
| Search modes, metadata filters, sorting, and progressive result loading | Anime/manga switch, recent searches, mobile filter sheet, genre/format/status/season/year/score/episode filters, four sort modes, and infinite loading |
| Airing calendar, saved-only view, add/remove reminders | Seven-day local-time calendar, saved filter, inline bookmark actions, and persisted Android notifications that can be cancelled |
| Watching, completed, saved, liked, library search and sorting | Four horizontally scrollable collection chips, progress rows, poster grids, search, and context-aware sorting |
| Episode selection, audio/quality controls, source ranking and recovery | Previous/next and direct episode jump, audio and quality controls, trust/remake filters, source sorting, automatic backup source selection, resume, PiP, and auto-next |
| Release browser with quality/audio/source filters and health summary | Episode controls, audio/quality filters, trusted/no-remake filters, best/seeders/size sorting, health metrics, in-app stream, and Android share sheet |
| Source browser with recent searches and release filters | Dedicated source search with persisted recents, episode/audio/quality/trust/remake controls, sorting, stream, and share actions |
| Searchable/filterable/sortable watch history | Search, all/watching/completed/recent filters, recent/progress/title/episode sorting, resume, item removal, and safe clear actions |
| Anime comparison with performance, production, overlap, and release actions | Side-by-side score/popularity/episodes/format/status/studio/genres, shared-genre insight, and release shortcuts |
| Playback, storage, and support diagnostics | Android playback/data/battery/cache settings plus on-demand metadata/source/account latency checks and native-engine status |
| Account profile, library/history stats, and sync controls | Shared-account identity, saved/liked/watched/reminder stats, manual sync, and shortcuts to history/compare/sources/settings |

## Intentional Android adaptations

- Windows MPV and torrent-engine executable paths are not exposed. Android uses the bundled native torrent module and `expo-video`.
- Windows temporary-directory selection is replaced by private app storage, an automatic size limit, and one-tap cache cleanup.
- Desktop hover menus, wide tables, and grid/list density toggles are replaced with thumb-friendly chips, filter sheets, compact rows, and adaptive poster columns.
- Magnet links use Android's share sheet when another client is preferred; supported releases stream inside the app.
- iOS is intentionally outside this branch and build configuration.
