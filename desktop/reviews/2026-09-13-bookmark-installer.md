# StreamNyaa 0.1.8 — Bookmarks and interface update

This installer packages the accumulated desktop working tree, including catalog continuity, downloads and Offline Library, playback fixes, Calendar reminders and scrolling, stronger Revamped contrast, four-second Spotlight crossfades, and unified Bookmarks. Existing saved/favorite storage is retained and surfaced together. Classic remains available in Settings; the earlier UI source backup remains under desktop/ui-backups.

Validation: TypeScript passed; frontend 168 tests passed; desktop contracts passed; native player-state 470 assertions passed. Earlier controls (20 cycles), stall, and final soak (100 cycles) passed. Compiled frontend checked for the new contrast, Bookmark controls, rotation interval, and reminder UI.

The installer is unsigned and not marked as fully accepted. Full native visual/action acceptance, account-sync round trips, download fault coverage, isolated installation/upgrade and rollback remain open. Building this installer does not count those gates as passed.

Previous release archived and SHA256 verified at desktop/releases/archive/0.1.8-before-bookmark-revamp-20260913. Current installer is updated at the existing v0.1.8 release path; installation itself has not been performed by this task.
