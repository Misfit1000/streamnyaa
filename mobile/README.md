# StreamNyaa Android

Native Android client for StreamNyaa. It uses a React Native/Expo Material 3 interface and a local Kotlin torrent engine; it does not embed the StreamNyaa website.

The Android client follows the desktop product contract for home, discovery, schedule, catalog, anime and manga details, source search, downloads, watch, library, comparison, history, settings, profile, and authentication. Shared feature metadata, source ranking, account merging, playback preferences, and resource limits live in the repository-level `shared/` directory so desktop and Android behavior cannot silently drift.

## Shared account and data

The app authenticates against the same Supabase project as `www.streamnyaa.xyz` and uses the existing API routes:

- `/api/auth/config` and `/api/auth/me` for the same StreamNyaa identity.
- `/api/account-sync` for the same `user_library` and `user_watch_history` rows. Until that route is deployed, the app falls back to Supabase REST under the project's existing row-level security policies; it does not use another database.
- `/api/nyaa` for the same ranked source results.

Local changes are merged by anime/history key before the unified account payload is saved. A mobile login never creates a separate mobile profile or database namespace.

Playback and resource preferences are also synced through the same `user_profiles` row. Apply `supabase/account-sync.sql` to the existing Supabase project before deploying the updated account endpoint; older deployments continue syncing library and history while the client gracefully ignores the not-yet-added preferences column.

## Development

Requirements:

- Node.js and npm
- JDK 21
- Android Studio with the Android SDK and an emulator or USB device

On Windows, keep the Android SDK/NDK path free of spaces. Native CMake dependencies can fail at link time when an SDK path containing spaces is passed through Ninja.

Install and generate Android sources:

```powershell
npm install
npx expo prebuild --platform android
```

Run a development build:

```powershell
npm run android
```

Expo Go cannot load the local torrent module; use a development build. For a cloud APK/AAB build, configure Expo Application Services and run the `development`, `preview`, or `production` profile from `eas.json`.

For Google sign-in, add `streamnyaa://auth` to the Supabase authentication redirect allow list. Email/password sign-in already uses the same StreamNyaa credentials and user ID as the web and desktop clients.

## Playback architecture

`StreamNyaaTorrent` uses `libtorrent4j` inside the app process, selects the largest supported video file, gives it sequential priority, buffers into private cache storage, and exposes it only to the on-device player through `127.0.0.1`. The local HTTP endpoint is never bound to the LAN.

Playback depends on seeders, tracker availability, codec support, free storage, and Android background limits. The user can clear all torrent cache data in Settings.

Battery saver pauses torrent activity when the app leaves the foreground unless background playback or picture-in-picture is explicitly enabled. It also reduces progress polling and write frequency. Wi-Fi-only mode, a bounded torrent cache, automatic stale-cache cleanup, source retry limits, and free-space checks protect battery, storage, and app stability.

Additional runtime protections include cancellation of stale/background API requests, transient-error-only retries, 15–25 second request timeouts, smaller AniList card payloads, disk-backed image caching, virtualized source and catalog lists, and frozen off-screen navigation routes. Playback progress sync is deduplicated and batched to 30–45 seconds while library and preference changes remain fast; pending progress is flushed when Android backgrounds the app. Wi-Fi-only torrent sessions pause if connectivity changes and resume automatically after Wi-Fi returns, while critically low storage stops the native engine safely.

## Checks

```powershell
npm run typecheck
npm run doctor
npm run export
```

Repository-level parity checks are run from the repository root:

```powershell
npm run verify:shared
```
