# StreamNyaa Android

Native Android client for StreamNyaa. It uses a React Native/Expo Material 3 interface and a local Kotlin torrent engine; it does not embed the StreamNyaa website.

## Shared account and data

The app authenticates against the same Supabase project as `www.streamnyaa.xyz` and uses the existing API routes:

- `/api/auth/config` and `/api/auth/me` for the same StreamNyaa identity.
- `/api/account-sync` for the same `user_library` and `user_watch_history` rows. Until that route is deployed, the app falls back to Supabase REST under the project's existing row-level security policies; it does not use another database.
- `/api/nyaa` for the same ranked source results.

Local changes are merged by anime/history key before the unified account payload is saved. A mobile login never creates a separate mobile profile or database namespace.

## Development

Requirements:

- Node.js and npm
- JDK 21
- Android Studio with the Android SDK and an emulator or USB device

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

## Checks

```powershell
npm run typecheck
npm run doctor
npm run export
```
