# StreamNyaa Desktop

The desktop app shares the StreamNyaa React UI with the web app and adds desktop-only local playback controls.

## Commands

```bash
npm run desktop:dev
npm run desktop:build
```

## Current Playback Bridge

The Tauri command layer accepts a selected source from the React UI, checks the local WebTorrent CLI and MPV commands, then starts WebTorrent in MPV mode. The web version stays download-only and does not load a web streaming provider.

Install or configure these local tools:

- WebTorrent CLI: `webtorrent`
- MPV player: `mpv`

The desktop player screen lets users save command names or full executable paths. For development, the native bridge also reads these optional environment variables:

```bash
STREAMNYAA_TORRENT_ENGINE_PATH=
STREAMNYAA_MPV_PATH=
STREAMNYAA_CACHE_DIR=
```

When both commands are available, clicking `Play locally` starts WebTorrent with MPV playback and stores data in the configured cache folder.
