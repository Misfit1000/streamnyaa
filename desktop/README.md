# StreamNyaa Desktop

The desktop app shares the StreamNyaa React UI with the web app and adds desktop-only local playback controls.

## Commands

```bash
npm run desktop:dev
npm run desktop:build
```

## Current Playback Bridge

The Tauri command layer accepts a selected source from the React UI and reports whether local playback is ready. The web version stays download-only and does not load a web streaming provider.

The next native step is bundling or configuring:

- a local torrent engine
- an MPV playback layer
- a local cache/stream handoff between the two

For development, the desktop bridge checks these optional environment variables:

```bash
STREAMNYAA_TORRENT_ENGINE_PATH=
STREAMNYAA_MPV_PATH=
```

When both are configured, the bridge can be extended to launch the engine and hand the local stream/file path to MPV.
