# StreamNyaa Desktop Production Notes

## Default shipping model

- Bundle `rqbit.exe` and the MPV payload under `desktop/src-tauri/bin`
- Keep transient playback cache under `%TEMP%\StreamNyaa`
- Keep runtime logs under `%LOCALAPPDATA%\StreamNyaa\logs`
- Reuse a single player window and a single active torrent session

## Release flow

1. Install release prerequisites on the build machine
2. Run `npm run release:desktop`
6. Sign the NSIS installer
7. Publish the installer, manifest, checksum file, and changelog together

`npm run release:desktop` clears common proxy environment variables first, then runs:

- `npm run verify:desktop-release`
- `npm run desktop:build`
- `npm run prepare:desktop-release`

## Manual release gates

- Clean-machine installer boot test on Windows
- Start playback from a fresh install
- Confirm only one player window is used
- Confirm cache clears after app close
- Confirm `%LOCALAPPDATA%\StreamNyaa\logs` contains readable runtime logs
- Confirm Settings > Copy diagnostics reports active session and cache state

## Remaining manual production items

- Code signing certificate wiring
- Auto-update channel selection
- Final binary provenance policy for `rqbit` and MPV

See:

- [desktop/RELEASE_CHECKLIST.md](</C:/Users/HP/Documents/New project 2/StreamNyaa-desktop/desktop/RELEASE_CHECKLIST.md>)
- [desktop/ROLLBACK.md](</C:/Users/HP/Documents/New project 2/StreamNyaa-desktop/desktop/ROLLBACK.md>)
