# StreamNyaa Android

Native Android client for StreamNyaa. It uses a React Native/Expo Material 3 interface and a local Kotlin torrent engine; it does not embed the StreamNyaa website.

The Android client follows the desktop product contract for home, discovery, schedule, catalog, the integrated anime cinema, manga details, source search, downloads, library, comparison, history, settings, profile, and authentication. Shared feature metadata, source ranking, account merging, playback preferences, and resource limits live in the repository-level `shared/` directory so desktop and Android behavior cannot silently drift.

## Startup, performance, and permissions

The native Android splash and the short JavaScript boot transition use the same StreamNyaa mark and dark Material surface. Navigation, local preference hydration, account restoration, and the first Home request initialize concurrently behind that transition; a startup fallback prevents damaged local state from leaving the app on the logo indefinitely.

The v0.7 interface follows the desktop brand with a vanta-black base, restrained blood-red emphasis, tonal surfaces, consistent 8/12 px geometry, and media-first layouts sized for narrow Android phones. Four visible tabs cover Home, Search, Library, and You; the airing schedule remains one tap away without crowding primary navigation. Opening an anime automatically searches index-friendly romaji and English title aliases, chooses a mobile-compatible source, and replaces the title hero with an edge-to-edge player inside the same app screen. Episodes remain prominent, while source modes, quality, audio, trust filters, sorting, and manual selection stay in a progressive-disclosure sheet.

Desktop parity is tracked by workflow rather than route names. Android includes paginated discovery with a mobile filter sheet, persisted airing reminders, watching/completed/saved/liked library views, direct episode jump, source trust/health filters and sorting, richer release comparison, and on-demand service diagnostics. See [`FEATURE_PARITY.md`](./FEATURE_PARITY.md) for the complete mapping and intentional platform differences.

On first launch, StreamNyaa explains access before Android displays a system prompt. Notifications are optional and used only for airing reminders. Streaming uses private app cache storage, so photo, media, external-storage, and overlay permissions are explicitly blocked from the generated Android manifest. Permission status can be reviewed later in Settings.

Secondary screens use inline/lazy module initialization, inactive native screens are frozen, long lists batch rendering, poster transitions are avoided during scrolling, and search-heavy local collections defer filtering to protect frame pacing. Home feed fields are reduced to data actually rendered by each shelf, queries keep useful data longer without refetching on every app focus, and release builds enable R8/resource shrinking while leaving Hermes and native libraries uncompressed for fast loading.

Metadata is resilient by design: AniList is preferred, the existing StreamNyaa-cached Jikan gateway supplies Home, schedules, and MAL-backed title details during AniList outages, and Kitsu is the final fallback for search and title resolution. AniList, MAL, and Kitsu identifiers are carried separately through navigation so an ID from one provider cannot resolve to an unrelated title on another provider.

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

On Windows, keep the Android SDK/NDK path free of spaces and build from a short repository path. Native CMake dependencies can fail at link time when SDK or generated object paths exceed Windows/Ninja path limits.

Install and generate Android sources:

```powershell
npm install
npx expo prebuild --platform android
```

Run a development build:

```powershell
npm run android
```

Development and `app-debug.apk` builds require Metro and are not standalone phone installers. Expo Go also cannot load the local torrent module; use a native development build while coding.

Build a standalone ARM64 APK from `mobile/android`:

```powershell
$env:NODE_ENV = 'production'
.\gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a' --no-daemon --max-workers=1
```

The standalone output is `android/app/build/outputs/apk/release/app-release.apk`; it embeds `assets/index.android.bundle` and runs without Metro. The StreamNyaa config plugin enables release code/resource shrinking and preserves uncompressed bundle/native loading. Local release builds currently use the Android debug signing key for sideload testing. Configure a private production keystore before Play Store or public distribution. For a cloud APK/AAB build, configure Expo Application Services and run the `preview` or `production` profile from `eas.json`.

For Google sign-in and email confirmation, add `https://www.streamnyaa.xyz/api/auth/mobile-callback` to the Supabase authentication redirect allow list. That callback immediately returns the session to `streamnyaa://auth`; cold-start and already-running links are consumed by the native account provider, so the website is not used as the signed-in mobile interface. Email/password sign-in already uses the same StreamNyaa credentials and user ID as the web and desktop clients.

## Playback architecture

`StreamNyaaTorrent` runs `libtorrent4j` in a dedicated Android worker process, outside the React Native UI process. A native torrent failure therefore reports a playback error without taking down navigation or the rest of the app. The engine selects the requested episode from single-file or batch releases, rejects ambiguous batches instead of silently playing the wrong file, prioritizes the opening pieces and MP4 seek metadata, buffers into private cache storage, and exposes it only to the on-device player through `127.0.0.1`. The local HTTP endpoint is never bound to the LAN. It advertises only completed contiguous torrent ranges, preventing ExoPlayer from reading sparse, incomplete file regions as valid video data.

Playback depends on seeders, tracker availability, codec support, free storage, and Android background limits. The user can clear all torrent cache data in Settings.

Source discovery prefers the romaji title used by release indexes, then falls back through English and native aliases. A source gets 30 seconds to return metadata, 35 seconds without buffer progress, and 60 seconds total to become playable. Stalled sources are remembered and the next ranked release is tried automatically instead of leaving the player buffering forever.

Battery saver pauses torrent activity when the app leaves the foreground unless background playback or picture-in-picture is explicitly enabled. It also reduces progress polling and write frequency. Wi-Fi-only mode, a bounded torrent cache, automatic stale-cache cleanup, source retry limits, and free-space checks protect battery, storage, and app stability.

Additional runtime protections include cancellation of stale/background API requests, generation-isolated torrent sessions and player replacements, safe player detachment before the localhost server stops, automatic backup-source recovery, transient-error-only retries, 15–25 second request timeouts, smaller AniList card payloads, disk-backed image caching, virtualized source and catalog lists, and frozen off-screen navigation routes. Playback progress sync is deduplicated and batched to 30–45 seconds while library and preference changes remain fast; pending progress is flushed when Android backgrounds the app. Wi-Fi-only torrent sessions pause if connectivity changes and resume automatically after Wi-Fi returns, while critically low storage stops the native engine safely.

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
