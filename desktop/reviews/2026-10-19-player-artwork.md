# StreamNyaa 0.1.10 — player artwork

Implements the approved loading/buffering design with real series artwork. The generated design preview is not bundled. Accounts, history, downloads, source classification, playback recovery limits and application identity remain unchanged.

## Change

- A contained, sharp poster sits to the right of a compact title, episode, known release facts and loading status. A continuous, muted version of the same image fills the background. Landscape-only metadata uses a contained landscape foreground. Images retain their proportions; no lower region is removed to make room for text.
- Adequate posters take priority over panoramic mastheads. Small posters do not prevent a better landscape candidate from being considered. Existing canonical identities, bounded source cache, eight-MiB download limit, decoded-image limits, asynchronous work and generation checks remain in use.
- Background blur runs at 640 × 360 before composition, with output capped at 2560 pixels wide. Foreground enlargement is capped at 1.25×. Provider assets still limit detail; the reported title's cached poster is 460 × 649 pixels.
- Startup and buffering use the same composed RGB. MPV bitmap overlays always sit above ASS text; the buffering bitmap therefore retains the composed colors with premultiplied alpha that leaves room for readable text. There is no vertical transparency cutout. Menus, completion and terminal recovery clear the bitmap, and advancing video removes it.
- Preparation is indeterminate. Percentages are shown only for measured selected-media buffering. Buffered seconds and MPV's actual resume threshold remain distinct from read-ahead targets.
- Long titles wrap within the text column. A fitted 16:9 stage preserves artwork proportions in other window shapes. The existing operating-system titlebar is unchanged.

## Verification

Final suite results and release checks are recorded in the accompanying installer manifest. The committed GPU-render harness uses the real bundled MPV/D3D11 renderer and actual native-prepared artwork. It captures loading, buffering, Settings, completion, long titles and advancing test-pattern video. Controlled states are fixtures, not live torrent acceptance.

- TypeScript, 92 frontend files / **572 tests**, 18 web/account contracts, local PostgreSQL history compatibility and desktop contracts passed.
- Rust **115 passed / 5 opt-in ignored**. Player state **558 assertions**, real bundled-player controls, stall recovery and the **100-cycle soak** passed. The controls harness includes real EOF and pointer Next/Close/Replay.
- Web/server builds, bundle budget and server smoke passed. Dependency audit reported zero vulnerabilities.

The actual cached poster was rendered at a requested 1920 × 1080 window, 640 × 360 and 800 × 800. Windows constrained the large capture to the available viewport (1834 pixels wide); these are not claims of physical 4K or 150–200% scaling acceptance. The title in the long-title fixture deliberately changes only to stress typography; it is not a real metadata identity example.

## Release

Implementation commit: `e3692d172c649dd047458ff3272f6e693ee6af23`. The rebuilt **0.1.10** installer is **42,474,874 bytes**, SHA-256 **6B1398CD66E1194BB181AD5B83B1648CA881C38EA420F7291C5550A89B6CA666**. Executable version, six staged resources, exact NSIS inclusions and 368 source-input hashes are verified in the [installer manifest](2026-10-19-player-artwork-installer.json). The previous verified 0.1.10 installer (`72B2E46D1A4139EB4A10C473CEA9F0EB457DBC9C3F97596811E3A634554961A0`) and its metadata are archived as rollback. A 0.1.9 installer is not available. The usual release location now contains this build; it is **NotSigned**.

## Remaining acceptance

Installed-app visual/focus/DPI acceptance, live-torrent endurance and an isolated installation/upgrade are not performed by these render fixtures. No signing certificate is available. Resource verification checks staged hashes and exact NSIS inclusions; independent installer payload extraction is not performed. Historical open gates in earlier reviews remain open unless superseded by explicit evidence.
