# September 13 source changes — no installer build

Implemented Calendar reminder controls (next alert, bookmark filter, notification test, delivered-alert cleanup and per-reminder removal), a draggable history rail with arrow/keyboard controls, and episode-rail scrolling that no longer resets on metadata refresh.

Explore uses explicitly labeled MAL popularity alternatives for unavailable Trending, recent MAL episode listings with an airing-series alternative, and filtered saved titles when providers fail. Cancellation, ranking identity and pagination boundaries remain protected. Calendar can use cached broadcast references after provider denial or throttling. Saved alternatives do not represent current release confirmations.

Player timestamps moved above the seek bar. Settings menus fit and scroll on smaller surfaces. Fixed a Lua display-scale error and an Escape/fullscreen property-observer race found in soak validation.

Revamped colors use stronger contrast. Spotlight rotates every four seconds with crossfade, interaction pause and reduced-motion support. Shared catalog actions combine previous saved/favorite memberships as Bookmarks without deleting legacy storage.

Validation against source:
- TypeScript passed.
- Frontend: 168 tests passed in 41 files.
- Desktop contract verification passed.
- Player state: 470 assertions passed.
- Native headless controls: 20 cycles passed.
- Stalled stream test passed.
- Final native headless soak: 100 cycles passed after fixing Escape race.

Logs: .validation/bookmarks-*.log. These checks do not constitute a full visual/native acceptance walk of every button or display scale. Live account sync, isolated Windows installation/upgrade, signing and the complete disk/network fault matrix remain unresolved release gates. No installer was built or replaced for these changes; the installed application does not yet contain them.
