# Desktop streaming UI — working revision

Version remains 0.1.7. Proposed release marker: `desktop-streaming-ui-1`.
This is a working-tree validation record, not release approval.

## Retained actions and presentation

| Area | Presentation change | Existing action retained |
| --- | --- | --- |
| Home | Continue Watching first; compact manually navigated spotlight; This Season before Trending | Resume, Details, Remove, Watch, shelf navigation |
| Search / Explore | One global search input; compact existing filters; restore browsing position after suspended content hydrates | Search, category, genre, format, status, sort, display modes |
| Watch | Landscape identity area with Play/Resume; narrower poster column; expandable playback options | Existing episode selection, series timeline, source selection, quality/audio filters, technical details |
| Navigation | Playback options in secondary navigation | All existing route destinations |
| Library / History / Profile / Settings | More restrained typography, spacing, surfaces and radii | Existing account, collection, history and preference actions |
| MPV toolbar | Logical display scaling; 44-pixel hit areas; 24-pixel vectors; transparent backgrounds | Play/pause, seek, mute/volume, next, speed, subtitles, settings, fullscreen, mini-player |
| Small player windows | Secondary actions use the existing settings menu | Track, speed and mini-player actions remain available |
| Completion | Centered 520-logical-pixel prompt, constrained to viewport | Request-scoped Next, Replay, Close, autoplay and cancellation |

The search route helper retains Explore filters when changing the query. Scroll restoration is bounded to ten seconds and stops immediately on user scroll/pointer/keyboard intent. No account or preference storage identities changed for these UI changes.

## Additional issues found during validation

- Bright GPU footage made toolbar text unreadable. Added localized text outlines without reintroducing top/bottom backplates.
- The completion panel was smaller than its intended logical size at 720p. It now uses the bounded display scale.
- Timeline fallback interpreted buffer fill as a fraction of the entire remaining episode. It now uses measured seconds ahead when an endpoint is unavailable.
- Initial one-frame scroll restoration could run before suspended content had height. Added cancellable content-aware restoration and behavioral tests.
- Removed duplicate blurred poster decoration and decorative navigation glow. Home navigation is visible in the Watch identity area.

## Actual checks completed

- TypeScript: passed after final UI edits.
- Frontend: 97 tests across 26 files passed, including three scroll-restoration regressions and two shared-search regressions.
- Rust: 45 tests passed.
- Desktop contracts: passed after final UI edits.
- MPV state: 298 assertions passed, including hit-area bounds/overlap and centered controls across 640x360, 980x600, 1280x720, 1920x1080 and 3840x2160 with 100–200% scale cases.
- Native control integration: 20-cycle and 100-cycle runs passed.
- Deterministic stalled-stream integration: passed.
- GPU fixture rendering: artwork, buffering, dark controls, bright controls and completion screenshots generated. Bright controls and completion inspected and corrected. These use synthetic footage, not live anime playback.
- Production desktop frontend compilation: passed; final CSS 161,305 bytes. This is not an installer-size measurement.

## Remaining acceptance / release work

- Full application visual walkthrough, including subtitle-heavy footage and actual display scaling.
- Live torrent playback, source switching, resume and account-sync round trips.
- Exhaustive retained-action walkthrough on Home, Explore, Watch, Library and Settings.
- Release compilation, artifact resource/signature checks and measured installer size.
- Archive previous installer/manifest/checksum before replacement, recording the exact final source revision and validation results.
- Same-version upgrade/data-preservation validation in an isolated Windows environment.

No installer was built, installed, replaced or published in this UI pass. Existing installed application and rollback artifacts remain untouched. Mobile and web projects are not modified. Passing deterministic tests does not establish live torrent reliability or justify claiming every regression gate has passed.
