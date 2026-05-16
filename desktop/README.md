# StreamNyaa Desktop

The desktop app shares the StreamNyaa React UI with the web app and adds desktop-only local playback controls.

## Commands

```bash
npm run desktop:dev
npm run desktop:build
```

## Current Playback Bridge

The Tauri command layer accepts a selected source from the React UI, checks the local rqbit and MPV commands, starts a local rqbit server, adds the selected magnet, then opens rqbit's local playlist URL in MPV. The web version stays download-only and does not load a web streaming provider.

Install or configure these local tools:

- rqbit: `rqbit`
- MPV player: `mpv`

With Rust installed, rqbit can be installed with:

```bash
cargo install rqbit
```

The desktop player screen lets users save command names or full executable paths. For development, the native bridge also reads these optional environment variables:

```bash
STREAMNYAA_TORRENT_ENGINE_PATH=
STREAMNYAA_MPV_PATH=
STREAMNYAA_CACHE_DIR=
```

When both commands are available, clicking `Play locally` starts local rqbit playback with MPV and stores data in the configured cache folder.
