$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent $root

function Assert-Match {
  param(
    [string]$Value,
    [string]$Pattern,
    [string]$Message
  )

  if ($Value -notmatch $Pattern) {
    throw $Message
  }
}

function Assert-NotMatch {
  param(
    [string]$Value,
    [string]$Pattern,
    [string]$Message
  )

  if ($Value -match $Pattern) {
    throw $Message
  }
}

$desktopBridge = Get-Content -Raw (Join-Path $repo 'src\lib\desktop.ts')
$watchPage = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopWatch.tsx')
$appDesktop = Get-Content -Raw (Join-Path $repo 'src\AppDesktop.tsx')
$desktopShell = Get-Content -Raw (Join-Path $repo 'src\components\DesktopShell.tsx')
$mainDesktop = Get-Content -Raw (Join-Path $repo 'src\main.desktop.tsx')
$animeCard = Get-Content -Raw (Join-Path $repo 'src\components\AnimeCard.tsx')
$jikanApi = Get-Content -Raw (Join-Path $repo 'src\api\jikan.ts')
$desktopHome = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopHome.tsx')
$desktopExplore = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopExplore.tsx')
$desktopLibrary = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopLibrary.tsx')
$desktopSources = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopSources.tsx')
$desktopSettings = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopSettings.tsx')
$desktopSchedule = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopSchedule.tsx')
$desktopHistory = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopHistory.tsx')
$desktopReminders = Get-Content -Raw (Join-Path $repo 'src\lib\desktopReminders.ts')
$desktopShell = Get-Content -Raw (Join-Path $repo 'src\components\DesktopShell.tsx')
$desktopCss = Get-Content -Raw (Join-Path $repo 'src\index.css')
$loginPage = Get-Content -Raw (Join-Path $repo 'src\pages\Login.tsx')
$supabaseAuth = Get-Content -Raw (Join-Path $repo 'src\lib\supabaseAuth.ts')
$nyaaApi = Get-Content -Raw (Join-Path $repo 'src\api\nyaa.ts')
$metadataApi = Get-Content -Raw (Join-Path $repo 'src\api\jikan.ts')
$streamSourcesApi = Get-Content -Raw (Join-Path $repo 'api\stream-sources.ts')
$tauriMain = Get-Content -Raw (Join-Path $repo 'desktop\src-tauri\src\main.rs')
$workflow = Get-Content -Raw (Join-Path $repo '.github\workflows\desktop-release.yml')
$packageJson = Get-Content -Raw (Join-Path $repo 'package.json')
$desktopHtmlWriter = Get-Content -Raw (Join-Path $repo 'scripts\write-desktop-html.mjs')
$desktopFallbackBuilder = Get-Content -Raw (Join-Path $repo 'scripts\build-desktop-fallback.ps1')
$playerSkin = Get-Content -Raw (Join-Path $repo 'desktop\src-tauri\bin\streamnyaa-player.lua')
$tauriConfig = Get-Content -Raw (Join-Path $repo 'desktop\src-tauri\tauri.conf.json')
$tauriCapability = Get-Content -Raw (Join-Path $repo 'desktop\src-tauri\capabilities\main.json')

Assert-Match $desktopBridge "DEFAULT_DESKTOP_SETTINGS:\s*DesktopPlaybackSettings\s*=\s*\{\s*torrent_engine_path:\s*''" 'Desktop settings should default to bundled engine lookup.'
Assert-Match $desktopBridge '__STREAMNYAA_DESKTOP__' 'Desktop detection should use the explicit desktop runtime flag.'
if ($desktopBridge -match 'VITE_STREAMNYAA_APP_TARGET') {
  throw 'Desktop runtime detection must not depend on build-time env replacement.'
}
Assert-Match $mainDesktop 'window\.__STREAMNYAA_DESKTOP__\s*=\s*true' 'Desktop entry must set the explicit desktop runtime flag.'
Assert-Match $desktopBridge 'buildDesktopDiagnosticsReport' 'Desktop diagnostics report helper is missing.'
Assert-Match $desktopBridge 'loadDesktopAudioPreference' 'Desktop audio preference loader is missing.'
Assert-Match $desktopBridge 'loadDesktopAutoOpenBestSource' 'Desktop auto-open source preference loader is missing.'
Assert-Match $desktopBridge 'latestUnwatchedEpisodeForAnime' 'Desktop latest-unwatched helper is missing.'
Assert-Match $desktopBridge 'streamnyaa\.desktop\.watchProgress\.v1' 'Desktop watch progress storage key is missing.'
Assert-Match $desktopBridge 'DesktopWatchProgressRecord' 'Desktop watch progress record type is missing.'
Assert-Match $desktopBridge 'exportDesktopSettingsBackup' 'Desktop settings export helper is missing.'
Assert-Match $desktopBridge 'importDesktopSettingsBackup' 'Desktop settings import helper is missing.'
Assert-Match $appDesktop 'path="watch/:id"' 'Desktop route tree should own the watch route.'
Assert-Match $appDesktop 'path="anime/:id"\s+element=\{<AnimeToDesktopWatch\s*/>\}' 'Desktop anime routes must redirect to the desktop watch page.'
Assert-Match $desktopShell 'SIDEBAR_STORAGE_KEY' 'Desktop shell should persist sidebar collapse state.'
Assert-Match $desktopShell 'setSidebarCollapsed' 'Desktop shell menu button should toggle the sidebar.'
Assert-Match $desktopShell 'ShortcutHelpOverlay' 'Desktop shell shortcut overlay is missing.'
Assert-Match $desktopShell 'isTypingTarget' 'Desktop shortcut overlay should ignore text entry targets.'
Assert-Match $desktopShell "event\.key === '\?'" 'Desktop shortcut overlay should open with the ? key.'
Assert-Match $appDesktop "path=`"search`" element=\{<DesktopExplore />\}" 'Desktop Explore must use the desktop-native page.'
Assert-Match $appDesktop "path=`"nyaa`" element=\{<DesktopSources />\}" 'Desktop Sources must use the desktop-native page.'
Assert-Match $appDesktop "path=`"schedule`" element=\{<DesktopSchedule />\}" 'Desktop Schedule must use the desktop-native page.'
Assert-Match $appDesktop "path=`"profile`" element=\{<DesktopProfile />\}" 'Desktop Profile must use the desktop-native profile page.'
Assert-Match $appDesktop "path=`"login`" element=\{<Login />\}" 'Desktop Login route should stay inside AppDesktop and DesktopShell.'
if ($appDesktop -match "import\\('./pages/AnimeDetails'\\)") {
  throw 'Desktop app must not mount the web anime details page.'
}
Assert-Match $loginPage "isDesktopRuntime\(\) \? '/profile' : '/dashboard'" 'Desktop login should default successful auth to the native profile route.'
Assert-Match $supabaseAuth 'if \(isDesktopRuntime\(\)\)' 'Supabase auth redirects must branch for the desktop runtime before using hosted web origins.'
Assert-Match $supabaseAuth 'currentRuntimeOrigin\(\)' 'Desktop OAuth redirects should use the current Tauri/WebView origin instead of the public web app.'
Assert-Match $supabaseAuth 'safeAuthRedirectPath' 'Auth redirects should sanitize callback paths before building redirect URLs.'
Assert-Match $animeCard 'desktopWatchOrBrowsePath\(anime\)' 'Desktop anime cards must use the desktop-specific watch routing helper.'
Assert-Match $desktopHome 'desktopWatchPath\(anime' 'Desktop home should build watch links through the desktop-specific route helper.'
Assert-Match $desktopHome 'loadDesktopAudioPreference' 'Desktop home should respect the pinned audio preference.'
Assert-Match $desktopHome 'watchEpisodeFor' 'Desktop home should open the latest unwatched episode when possible.'
Assert-Match $watchPage 'Source List' 'Desktop watch page source section is missing.'
Assert-Match $watchPage 'Play Best Source' 'Desktop watch page primary open action is missing.'
Assert-NotMatch $watchPage 'Source Links' 'Desktop watch page must not render the old Source Links label.'
Assert-NotMatch $watchPage 'Smart Source Selector|Smart source selector' 'Desktop watch page must not render the old smart source selector label.'
Assert-NotMatch $watchPage 'Available Sources' 'Desktop watch page must not render the old Available Sources label.'
Assert-NotMatch $watchPage '>[\s\r\n]*Play Episode[\s\r\n]*<' 'Desktop watch page must not render the old Play Episode action.'
Assert-Match $watchPage 'saveDesktopAudioPreference' 'Desktop watch page should persist audio preference changes.'
Assert-Match $watchPage 'saveDesktopAutoOpenBestSource' 'Desktop watch page should persist episode click behavior changes.'
Assert-Match $watchPage 'sourceQualityReasons' 'Desktop watch page should explain why source matches are ranked.'
Assert-Match $watchPage 'fallbackAnimeFromRoute' 'Desktop watch page must fall back to a route title when metadata lookup fails.'
Assert-Match $watchPage 'SafeImage' 'Desktop watch page must render fallback-safe images.'
Assert-Match $watchPage 'episodeNumberFromTitle' 'Desktop watch page should avoid mismatching episode thumbnails and titles.'
Assert-Match $watchPage 'selectedEpisode - Math\.floor\(maxVisible / 2\)' 'Desktop watch page should keep the selected long-running episode in the visible strip.'
Assert-Match $watchPage 'sourceSearchTitleVariants' 'Desktop watch page should widen source title matching for alternate season naming.'
Assert-Match $watchPage 'sourceMatchesInstallment' 'Desktop watch page should filter torrent sources by the selected installment.'
Assert-Match $watchPage 'TIMELINE_RELATIONS' 'Desktop watch page should build a complete related-series timeline instead of only direct sequel pills.'
Assert-Match $watchPage "'SIDE_STORY'" 'Desktop watch page should allow OVA/special timeline entries while still filtering non-anime media.'
Assert-Match $watchPage 'Promise\.allSettled' 'Desktop watch page should expand related installments in batches so the timeline appears complete.'
Assert-Match $watchPage 'sameSeriesFamily' 'Desktop watch page should keep season traversal inside the same title family.'
Assert-Match $watchPage 'hasSeasonTitleSignal' 'Desktop watch page should avoid fake season labels for unlabeled TV relations.'
Assert-Match $watchPage 'sourceSeasonNumber' 'Desktop watch page should keep hidden season ordinals for torrent source matching without fake season labels.'
Assert-Match $watchPage 'installment\?\.sourceSeasonNumber' 'Desktop source search should use hidden season ordinals when visible labels stay title-based.'
Assert-Match $watchPage 'status === ''NOT_YET_RELEASED''' 'Desktop watch page should not include unreleased relation entries in aired installment rails.'
Assert-Match $watchPage 'isAncillarySource' 'Desktop watch page should reject OP/ED and other ancillary torrent files.'
Assert-Match $watchPage 'classifySource' 'Desktop watch page should classify sources before playback.'
Assert-Match $watchPage 'parseSourceAnimeTitle' 'Desktop watch page should parse torrent titles before comparing anime titles.'
Assert-Match $watchPage 'sourceTitleCompatibility' 'Desktop watch page should globally gate torrent sources by compatible anime titles.'
Assert-Match $watchPage 'rejected:single-token-overlap' 'Desktop watch page should reject one-token overlaps such as Vampire Hunter D for Hunter x Hunter.'
Assert-Match $watchPage 'rejected:title-mismatch' 'Desktop watch page should reject unrelated anime titles before source bucketing.'
Assert-Match $watchPage 'isSafeSourceQueryTitle' 'Desktop watch page should avoid unsafe one-word source queries from multi-word anime titles.'
Assert-Match $watchPage 'matchTier\s*=\s*''exact''' 'Desktop watch page should keep exact same-episode sources separate from loose matches.'
Assert-Match $watchPage "useState<SourceFilterMode>\('balanced'\)" 'Desktop watch page should default to Balanced sources so usable non-exact sources are visible.'
Assert-Match $watchPage 'Wide match' 'Desktop watch page should allow wider seeded source candidates instead of hiding every non-exact torrent.'
Assert-Match $watchPage 'FAILED_SOURCE_MEMORY_KEY' 'Desktop watch page should remember recently failed sources.'
Assert-Match $watchPage 'rememberSourceFailure' 'Desktop watch page should record failed source handoffs.'
Assert-Match $watchPage 'Try next playable source' 'Desktop watch page should expose a same-episode recovery action.'
Assert-Match $watchPage "source\.matchTier === 'broad'" 'Desktop playback retry should allow broad backups when broad is the selected playable pool.'
Assert-Match $watchPage 'isFetching:\s*sourcesFetching' 'Desktop watch page should track source refetching during episode switches.'
Assert-Match $watchPage 'sourcesBusy\s*=\s*sourcesLoading\s*\|\|\s*sourcesFetching' 'Desktop autoplay should wait until the selected episode source query is fully settled.'
Assert-Match $watchPage 'playableSourcesEpisodeRef\.current\s*!==\s*selectedEpisode' 'Desktop autoplay should reject stale sources from the previous episode.'
Assert-Match $watchPage 'activeSourceId\s*\|\|\s*playActionLockRef\.current\) return' 'Desktop autoplay should wait for active player handoff before opening the next source.'
Assert-Match $watchPage 'EPISODE_RAIL_DRAG_THRESHOLD\s*=\s*8' 'Desktop episode rail should use the approved drag threshold.'
Assert-Match $watchPage 'watchEpisodeFromCard' 'Desktop episode cards should use a click-to-watch helper instead of select-only behavior.'
Assert-Match $watchPage 'watchEpisodeFromCard\(episode\.number\)' 'Desktop episode cards should open playback for the clicked episode.'
Assert-Match $watchPage 'Math\.hypot\(deltaX,\s*deltaY\)\s*<=\s*EPISODE_RAIL_DRAG_THRESHOLD' 'Desktop episode rail drag suppression should only start after real pointer movement.'
Assert-Match $watchPage 'desktopWatchPath\(' 'Desktop watch page season switches should preserve the resolved desktop route identity.'
if ($watchPage -match 'Anime not found') {
  throw 'Desktop watch page must not dead-end on "Anime not found".'
}
if ($jikanApi -match '(?m)^\s*rank\s*$') {
  throw 'AniList queries must not request unsupported rank fields.'
}
Assert-Match $jikanApi 'animeDetailsCandidateScore' 'Desktop metadata resolution should score AniList detail candidates instead of trusting one fallback path.'
Assert-Match $jikanApi 'preferredAniListId' 'Desktop metadata resolution should preserve explicit AniList ids through watch-page routes.'
Assert-Match $jikanApi 'startDate \{ year month day \}' 'AniList relation metadata should include start dates for chronological installment sorting.'
Assert-Match $jikanApi 'status: edge\.node\.status' 'AniList relation metadata should include release status for aired installment filtering.'
if ($desktopHome -match 'bx145064-YspYpO4wXHNP') {
  throw 'Desktop fallback data still contains the broken Jujutsu Kaisen image URL.'
}
if ($desktopHome -match 'return live\.length \? live : FALLBACK_DESKTOP_ANIME') {
  throw 'Desktop home must not fill live rows with repeated fallback anime.'
}
Assert-Match $desktopHome 'fetchAnimeSeason' 'Desktop home should load the current anime season instead of repeating generic airing data.'
Assert-Match $desktopHome 'searchAnime\(' 'Desktop home should use a dedicated trending feed instead of reusing seasonal rows.'
Assert-Match $desktopHome 'Details' 'Desktop Continue Watching cards should expose a details action.'
Assert-Match $desktopHome 'sourceUpdatedLabel' 'Desktop Continue Watching cards should show last watched context.'
Assert-Match $desktopExplore 'fetchAnimeSeason' 'Desktop Explore should load the current anime season.'
Assert-Match $desktopLibrary 'Watching' 'Desktop Library should expose a Watching category.'
Assert-Match $desktopLibrary 'Completed' 'Desktop Library should expose a Completed category.'
Assert-Match $desktopLibrary 'Plan to Watch' 'Desktop Library should expose a Plan to Watch category.'
Assert-Match $desktopLibrary 'Favorites' 'Desktop Library should expose a Favorites category.'
Assert-Match $desktopLibrary 'History' 'Desktop Library should expose a History category.'
Assert-Match $desktopSources 'Batch sources hidden' 'Desktop Sources should hide batch files.'
Assert-Match $desktopSources 'loadDesktopAudioPreference' 'Desktop Sources should start from the pinned audio preference.'
Assert-Match $desktopSettings 'Auto-open best source' 'Desktop Settings should expose the episode click behavior preference.'
Assert-Match $desktopSettings 'Export desktop settings' 'Desktop Settings should expose safe settings export.'
Assert-Match $desktopSettings 'Import desktop settings' 'Desktop Settings should expose safe settings import.'
Assert-NotMatch $desktopSettings 'getSession\(\)|supabase\.auth|localStorage\.clear\(\)' 'Desktop Settings backup UI must not export session data or clear all storage.'
Assert-Match $desktopSchedule 'fetchSchedule' 'Desktop Schedule should load live airing data.'
Assert-Match $desktopReminders 'streamnyaa\.desktop\.scheduleReminders\.v1' 'Desktop Schedule should persist airing reminders with the expected storage key.'
Assert-Match $desktopSchedule 'getScheduleNotificationPermission' 'Desktop Schedule should use an explicit notification permission helper.'
Assert-Match $desktopReminders "delivery:\s*'system'" 'Desktop Schedule reminders should store native system delivery.'
Assert-Match $desktopSchedule 'Test notification' 'Desktop Schedule should expose a test notification action.'
Assert-Match $desktopSchedule 'Enable StreamNyaa in Windows notification settings' 'Desktop Schedule should explain how to unblock native notifications.'
Assert-Match $desktopSchedule 'Windows notifications enabled' 'Desktop Schedule should show native notification status.'
Assert-Match $desktopSchedule 'Native notifications unavailable' 'Desktop Schedule should report unsupported native notification delivery.'
Assert-Match $nyaaApi 'inMemorySearchCache' 'Desktop source fetch cache is missing.'
Assert-Match $metadataApi 'inFlightMetadataRequests' 'Desktop metadata requests should be coalesced to prevent provider rate-limit bursts.'
Assert-Match $metadataApi 'providerCooldowns' 'Desktop metadata layer should cool down providers after rate-limit/server errors.'
Assert-Match $metadataApi 'LOCAL_METADATA_MAX_STALE_MS' 'Desktop metadata layer should keep bounded stale fallback data.'
Assert-Match $metadataApi 'type MetadataProvider' 'Desktop metadata layer should use one provider type for all metadata integrations.'
Assert-Match $metadataApi 'fetchMetadataProviderPath' 'Desktop metadata layer should expose cached optional provider path requests.'
Assert-Match $metadataApi 'fetchAniDbAnimeMetadata' 'Desktop metadata layer should expose cached AniDB anime metadata requests.'
Assert-Match $streamSourcesApi 'inFlightMetadataCache' 'Metadata gateway should coalesce duplicate upstream calls.'
Assert-Match $streamSourcesApi 'STALE_TTL_MS' 'Metadata gateway should serve bounded stale data when providers fail.'
Assert-Match $streamSourcesApi 'fetchTmdb' 'Metadata gateway should support cached TMDB enrichment.'
Assert-Match $streamSourcesApi 'fetchAnimeSchedule' 'Metadata gateway should support cached AnimeSchedule enrichment.'
Assert-Match $streamSourcesApi 'fetchAniDb' 'Metadata gateway should support cached AniDB enrichment.'
Assert-Match $streamSourcesApi 'PROVIDER_DISABLED_TTL_SECONDS' 'Metadata gateway should fail closed for unconfigured optional providers.'
Assert-Match $desktopBridge "'anilist' \| 'jikan' \| 'anidb' \| 'animeschedule' \| 'tmdb'" 'Desktop metadata bridge type should include every supported metadata provider.'
Assert-Match $desktopBridge 'controlLocalPlayer' 'Desktop bridge should expose player control commands.'
Assert-Match $watchPage 'runPlayerControl' 'Desktop watch page should wire the player control UI.'
Assert-Match $watchPage 'Pause' 'Desktop watch page should expose a pause control.'
Assert-Match $tauriMain 'fn get_desktop_diagnostics' 'Desktop diagnostics command is missing.'
Assert-Match $tauriMain 'logs_root\(\)' 'Desktop log directory helper is missing.'
Assert-Match $tauriMain 'cleanup_abandoned_sessions' 'Desktop cache cleanup path is missing.'
Assert-Match $tauriMain 'play_local_torrent' 'Desktop local playback command is missing.'
Assert-Match $tauriMain 'PlayerControlRequest' 'Desktop player control request type is missing.'
Assert-Match $tauriMain 'control_local_player' 'Desktop player control command is missing.'
Assert-Match $tauriMain 'get_player_property_bool' 'Desktop player progress should expose boolean player state.'
Assert-Match $tauriMain 'streamnyaa-player\.lua' 'Desktop player should load the StreamNyaa MPV control skin.'
Assert-Match $tauriMain '--osc=no' 'Desktop player should disable the default MPV OSC when the StreamNyaa skin is used.'
Assert-Match $playerSkin 'cycle_speed' 'StreamNyaa MPV skin should expose playback speed cycling.'
Assert-Match $playerSkin 'streamnyaa-mute' 'StreamNyaa MPV skin should expose mute controls.'
Assert-Match $playerSkin 'MBTN_LEFT_DBL' 'StreamNyaa MPV skin should support double-click fullscreen.'
Assert-Match $playerSkin 'seek_hot' 'StreamNyaa MPV skin should expose seek preview hover state.'
Assert-Match $playerSkin 'function position_inside_skip_range' 'StreamNyaa MPV skin should gate skip actions to the active OP/ED range.'
Assert-Match $playerSkin '(?s)function manual_strict_skip_range\(kind, pos\).*skip_range_for_position\(kind, pos, false\)' 'Manual skip buttons must not use nearby/pre-roll skip windows.'
Assert-Match $playerSkin 'if not position_inside_skip_range\(range, pos\) then return false end' 'Auto skip should only run while the playhead is inside the skip range.'
Assert-Match $playerSkin 'range\.kind == "outro" and range\.source ~= "chapter"' 'Auto Skip Outro should only trust explicit ending/outro chapter markers.'
Assert-Match $tauriMain 'loading_frame' 'Desktop player should use a branded supported loading frame.'
Assert-Match $tauriMain 'image-display-duration=inf' 'Desktop player should hold the branded loading frame while buffering.'
Assert-Match $tauriMain 'PLAYER_COVER_PRELOAD_TIMEOUT_MS' 'Desktop player cover preparation should stay bounded before MPV opens.'
Assert-Match $tauriMain 'loading-cover\.jpg' 'Desktop player should prepare a cover-based loading image for MPV.'
Assert-Match $playerSkin 'function is_cover_loading_media' 'StreamNyaa MPV skin should recognize cover loading images as loading media.'
Assert-Match $playerSkin 'loading%-cover%.jpg' 'StreamNyaa MPV skin should not treat loading-cover.jpg as normal playable media.'
Assert-Match $watchPage 'banner:\s*wideImageFor\(anime\)' 'Desktop watch playback payload should send wide artwork for player loading backgrounds.'
Assert-Match $watchPage 'coverImage\?\.extraLarge' 'Desktop watch poster candidates should include AniList cover art for player loading fallback.'
Assert-Match $watchPage 'function youtubeVideoIdFor' 'Desktop trailers should validate and canonicalize YouTube URLs before opening them.'
Assert-Match $watchPage "url\.protocol !== 'https:'" 'Desktop trailer links must require HTTPS.'
Assert-Match $tauriMain 'validated_command_candidate' 'Desktop command overrides must pass the executable-name allowlist before launch.'
Assert-Match $tauriMain 'allowed_command\(value, allowed_names\)' 'Desktop command validation must reject arbitrary executable names.'
Assert-NotMatch $tauriConfig 'ws://localhost' 'Packaged desktop CSP must not permit unused WebSocket connections.'
Assert-Match $desktopHistory 'role="alertdialog"' 'Desktop History must confirm destructive cleanup inside the app.'
Assert-Match $desktopHistory "setPendingClear\('all'\)" 'Desktop History Clear all must arm confirmation instead of deleting immediately.'
Assert-Match $desktopBridge 'LOCAL_PLAYBACK_HISTORY_LIMIT\s*=\s*18' 'Desktop playback history must remain bounded.'
Assert-Match $desktopExplore 'EXPLORE_INITIAL_RESULTS' 'Desktop Explore must progressively render large result sets.'
Assert-Match $desktopExplore 'window\.clearTimeout\(handle\)' 'Desktop Explore must cancel stale debounced search updates.'
Assert-Match $desktopReminders 'DESKTOP_REMINDER_POLL_MS\s*=\s*45_000' 'Desktop reminder polling must remain bounded and non-aggressive.'
Assert-Match $desktopReminders 'sendNotification\(' 'Desktop reminders must use native Tauri notifications.'
Assert-Match $desktopShell 'deliverDueDesktopReminders' 'Desktop reminders must remain active outside the Calendar route.'
Assert-NotMatch $desktopSchedule 'new Notification\(' 'Calendar reminders must not fall back to the browser notification API.'
Assert-NotMatch $desktopSchedule 'Save in-app reminder' 'Calendar bells must not silently downgrade to in-app reminders.'
Assert-Match $tauriMain 'tauri_plugin_notification::init\(\)' 'The desktop runtime must initialize the native notification plugin.'
Assert-Match $tauriCapability 'notification:default' 'The main desktop window must be granted native notification permission.'
Assert-Match $desktopShell 'listenDesktopPlayerSettingChanged' 'Player preferences must be persisted by the always-mounted desktop shell.'
Assert-Match $tauriMain 'spawn_next_episode_request_watcher' 'Next-episode requests need a non-blocking file bridge in addition to MPV client messages.'
Assert-Match $playerSkin 'next_episode_request_file' 'The MPV skin must write reliable next-episode requests to the desktop bridge.'
Assert-Match $tauriMain 'spawn_player_setting_request_watcher' 'Player settings need a non-blocking persistence bridge in addition to MPV client messages.'
Assert-Match $playerSkin 'settings_request_file' 'The MPV skin must persist setting changes through the desktop bridge.'
Assert-Match $playerSkin 'return explicit_skip_range' 'Skip buttons and automatic skips must require explicit OP/ED chapter markers.'
Assert-NotMatch $playerSkin 'settings:theater' 'Theater Mode must not remain in the MPV settings menu.'
Assert-NotMatch $playerSkin 'button\(ass, mouse, "theater"' 'Theater Mode must not remain in the MPV control bar.'
Assert-Match $playerSkin 'add_region\("center_toggle"' 'The middle of the MPV viewport must be a play/pause target.'
Assert-Match $playerSkin 'id == "center_toggle"' 'The MPV center target must toggle pause through the existing control path.'
Assert-Match $desktopCss '--sn-accent:\s*#a50f28' 'Desktop pages must use the shared blood-red accent token.'
Assert-Match $tauriMain '"tmdb"' 'Desktop metadata bridge should support TMDB enrichment requests.'
Assert-Match $tauriMain '"animeschedule"' 'Desktop metadata bridge should support AnimeSchedule enrichment requests.'
Assert-Match $tauriMain '"anidb"' 'Desktop metadata bridge should support AniDB enrichment requests.'
Assert-Match $tauriMain 'disabled_provider_value' 'Desktop metadata bridge should safely disable unconfigured optional providers.'
Assert-Match $packageJson 'preflight:desktop' 'Desktop tooling preflight script is missing.'
Assert-Match $packageJson 'verify:desktop-release' 'Desktop release verification script is missing.'
Assert-Match $packageJson 'serve-desktop-dist\.mjs' 'Desktop dev should serve the direct desktop bundle instead of the broken Vite shell.'
Assert-Match $packageJson 'build-desktop-fallback\.ps1' 'Desktop build should use the direct Windows-safe frontend builder.'
Assert-Match $desktopHtmlWriter 'inlineStyles' 'Desktop packaged HTML should inline CSS to avoid unstyled installed builds.'
Assert-Match $desktopHtmlWriter 'src="/assets/\$\{entry\.name\}"' 'Desktop packaged HTML should load the JS bundle from an absolute assets path.'
Assert-Match $desktopFallbackBuilder '--public-path=/assets' 'Desktop fallback assets should resolve from /assets on every route depth.'
Assert-Match $tauriMain '\.clamp\(1, 3\)' 'Desktop direct source fallback should allow a wider page search window.'
Assert-Match $workflow 'STREAMNYAA_REQUIRE_BUNDLED_BINARIES' 'Release workflow must require bundled binaries.'

Write-Host 'Desktop verification passed.'
