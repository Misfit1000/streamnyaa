# Desktop-to-Android feature parity

The desktop product lives on `main`; the Android product lives on `mobile`. This audit compares user workflows, not only route names.

## Parity map

| Desktop workflow | Android implementation |
| --- | --- |
| Animated home spotlight, continue watching, new episodes, trending, airing, seasonal, upcoming, popular, top year | Swipeable featured carousel, direct synced/local resume, and seven virtualized touch-friendly media shelves |
| Search modes, metadata filters, sorting, and progressive result loading | Anime/manga switch, recent searches, mobile filter sheet, genre/format/status/season/year/score/episode filters, four sort modes, and infinite loading |
| Airing calendar, saved-only view, add/remove reminders | Seven-day local-time calendar, saved filter, inline bookmark actions, and persisted Android notifications that can be cancelled |
| Watching, completed, saved, liked, library search and sorting | Four horizontally scrollable collection chips, progress rows, poster grids, search, and context-aware sorting |
| Integrated anime cinema, episode selection, audio/quality controls, source ranking and recovery | One-screen title-to-player transition, real episode metadata, romaji/English alias discovery, one-tap compatible-source playback, exact/balanced/broad matching, advanced source sheet, timed backup recovery, persistent failed-source memory, resume, PiP, and auto-next |
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
- Desktop's direct anime-to-cinema navigation is preserved: anime cards open the integrated Android watch screen instead of a separate web-style details page.
- Desktop source confidence, failure recovery, and exact episode intent are preserved, but the Android compatibility rank favors H.264/AVC and avoids expensive 10-bit, HEVC, AV1, and 4K releases on battery-saver or constrained phones.
- Advanced playback choices use a modal source sheet so the common path is title -> automatic best source -> player, while manual control remains available.
- Native torrenting runs in a dedicated Android process. A libtorrent worker failure can be recovered or retried without crashing the React Native interface.
- The five desktop destinations map to four visible Android tabs. Schedule stays available from Home and You, reducing bottom-navigation decisions without removing the workflow.
- Magnet links use Android's share sheet when another client is preferred; supported releases stream inside the app.
- iOS is intentionally outside this branch and build configuration.
