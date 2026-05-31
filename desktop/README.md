# StreamNyaa Desktop

StreamNyaa Desktop shares the React UI with the web app and adds a desktop shell for anime discovery, source browsing, and local torrent playback.

## Current Desktop Behavior

- One persistent player process is reused for stream switching.
- Each source starts an isolated session under the OS Temp folder.
- Old and abandoned session folders are cleared on startup, source switch, app exit, and from Settings.
- Cache is guarded with a 3 GB per-session target and 6 GB global limit.
- Playback expects bundled `rqbit.exe` for the local torrent engine and bundled `mpv.exe` for the player.
- Runtime failures are written to `%LOCALAPPDATA%\StreamNyaa\logs`.

The desktop app never stores temporary torrent pieces beside application files. Runtime playback cache belongs under `%TEMP%\StreamNyaa` by default and old AppData cache folders are treated as legacy cleanup targets.

## Runtime Requirements

Bundle or stage these binaries before a release build:

```bash
npm run prepare:desktop-binaries
```

That script prefers known local install locations and places the binaries under `desktop/src-tauri/bin` so the Tauri bundle can ship them as resources. Manual override paths remain available in Desktop Settings for advanced debugging only.

StreamNyaa starts the torrent engine only when preparing or opening a stream. It stops the previous active session before switching sources and keeps the same player window alive for smoother binge-watching.

## Development

From the repository root:

```bash
npm run desktop:dev
```

This expects `cargo tauri` to be installed locally.

For a production desktop build:

```bash
npm run desktop:build
npm run prepare:desktop-release
```

For the full local release flow with proxy cleanup included:

```bash
npm run release:desktop
```

For the desktop verification suite:

```bash
npm run verify:desktop
```

Release and rollback runbooks:

- [desktop/RELEASE_CHECKLIST.md](</C:/Users/HP/Documents/New project 2/StreamNyaa-desktop/desktop/RELEASE_CHECKLIST.md>)
- [desktop/ROLLBACK.md](</C:/Users/HP/Documents/New project 2/StreamNyaa-desktop/desktop/ROLLBACK.md>)

The desktop app still uses the StreamNyaa production source API for source search results through the Tauri bridge. It does not run Vercel serverless routes locally.
