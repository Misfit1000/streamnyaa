# StreamNyaa Desktop Release Checklist

## Build and verify

1. `npm run verify:desktop-release`
2. `npm run desktop:build`
3. `npm run prepare:desktop-release`

## Manual acceptance gates

1. Install the generated `*-setup.exe` on a clean Windows machine or VM.
2. Confirm the app opens without setup prompts.
3. Open one anime and confirm the watch flow reaches the desktop source page.
4. Start playback and confirm:
   - only one player window opens
   - switching episodes reuses the same player window
   - source fallback works when the first source fails
5. Close the app and confirm `%TEMP%\StreamNyaa` is cleaned back down.
6. Open Desktop Settings and confirm:
   - runtime shows Ready
   - cache usage is visible
   - copy diagnostics works
   - logs path is visible
7. Inspect `%LOCALAPPDATA%\StreamNyaa\logs` and confirm recent runtime entries are readable.

## Publishing

1. Code-sign the installer.
2. Publish:
   - installer
   - `release-manifest.json`
   - `SHA256SUMS.txt`
   - changelog notes
3. Keep the previous stable installer and manifest for rollback.

## Do not ship if any of these are true

- Bundled binaries are missing from the installer build.
- Watch flow opens multiple player windows.
- Playback depends on machine-specific overrides.
- Cache persists indefinitely after app close.
- Diagnostics or logs are unreadable.
