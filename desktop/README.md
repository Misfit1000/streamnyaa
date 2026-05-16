# StreamNyaa Desktop

The desktop app shares the StreamNyaa React UI with the web app and adds desktop-only local playback controls.

## Commands

```bash
npm run desktop:dev
npm run desktop:build
```

The desktop build uses `VITE_STREAMNYAA_APP_TARGET=desktop`, skips sitemap generation, and avoids web-only SEO, analytics, and ad scripts inside the Tauri shell.

For Windows development, the project root also includes `desktop-dev.cmd` and `desktop-dev.ps1` launchers. Run either one from the StreamNyaa project folder to start the desktop app without typing the full npm command.

## Platform target

This desktop package is optimized for Windows. The current local playback design expects Windows desktop tools such as rqbit and MPV, then launches MPV from the Tauri app.

It is not compatible with mobile as-is. The shared web UI is responsive on phones, but the desktop local playback layer depends on desktop executables and local torrent streaming, which Android and iOS do not allow in the same way.

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
