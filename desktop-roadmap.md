# StreamNyaa Desktop Roadmap

This desktop build shares the same React UI as the web app and adds desktop-only local playback.

## Current foundation

- Web app remains download/source-search focused.
- Desktop mode is detected with Tauri globals or `?desktop=1`.
- Desktop-only `Play locally` actions appear on source result cards.
- `/local-player` uses the old dark player layout, without Webtor or third-party web embeds.
- The Tauri scaffold lives in `desktop/src-tauri` and has a `play_local_torrent` command target ready for the local engine.

## Next implementation step

Bundle a local playback sidecar:

1. Local torrent engine receives the magnet link.
2. It starts downloading/streaming pieces to a local cache.
3. MPV opens the local stream/file path.
4. Tauri reports status back to the React player screen.

The web app should not run torrent playback code.
