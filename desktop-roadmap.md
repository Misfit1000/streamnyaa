# StreamNyaa Desktop Roadmap

This desktop build shares the same React UI as the web app and adds desktop-only local playback.

## Current foundation

- Web app remains download/source-search focused.
- Desktop mode is detected with Tauri globals or `?desktop=1`.
- Desktop-only `Play locally` actions appear on source result cards.
- `/local-player` uses the old dark player layout, without Webtor or third-party web embeds.
- The Tauri scaffold lives in `desktop/src-tauri` and has a `play_local_torrent` command target for the local engine.
- The desktop app reports local runtime readiness before trying playback.
- Local playback starts a local rqbit server, adds the selected magnet source, and opens rqbit's playlist URL in MPV when `rqbit` and `mpv` are configured.
- The player screen polls rqbit for local playback progress, peers, speed, and cache status after playback starts.

## Local desktop commands

- `npm run desktop:dev` starts the Tauri desktop shell.
- `npm run desktop:build` builds the Tauri desktop app.
- The desktop dev shell starts the shared Vite UI with `?desktop=1`.

## Next implementation step

Bundle the local playback sidecar:

1. Package rqbit as a sidecar so users do not need to install it manually.
2. Bundle MPV or guide users to install it.
3. Add a signed app installer.
4. Add file selection for multi-file torrents before launching MPV.

The web app should not run torrent playback code.
