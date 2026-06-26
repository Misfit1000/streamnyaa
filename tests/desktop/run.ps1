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

$desktopBridge = Get-Content -Raw (Join-Path $repo 'src\lib\desktop.ts')
$watchPage = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopWatch.tsx')
$appDesktop = Get-Content -Raw (Join-Path $repo 'src\AppDesktop.tsx')
$desktopShell = Get-Content -Raw (Join-Path $repo 'src\components\DesktopShell.tsx')
$mainDesktop = Get-Content -Raw (Join-Path $repo 'src\main.desktop.tsx')
$animeCard = Get-Content -Raw (Join-Path $repo 'src\components\AnimeCard.tsx')
$jikanApi = Get-Content -Raw (Join-Path $repo 'src\api\jikan.ts')
$desktopHome = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopHome.tsx')
$desktopExplore = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopExplore.tsx')
$desktopSources = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopSources.tsx')
$desktopSettings = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopSettings.tsx')
$desktopSchedule = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopSchedule.tsx')
$nyaaApi = Get-Content -Raw (Join-Path $repo 'src\api\nyaa.ts')
$metadataApi = Get-Content -Raw (Join-Path $repo 'src\api\jikan.ts')
$streamSourcesApi = Get-Content -Raw (Join-Path $repo 'api\stream-sources.ts')
$tauriMain = Get-Content -Raw (Join-Path $repo 'desktop\src-tauri\src\main.rs')
$workflow = Get-Content -Raw (Join-Path $repo '.github\workflows\desktop-release.yml')
$packageJson = Get-Content -Raw (Join-Path $repo 'package.json')
$desktopHtmlWriter = Get-Content -Raw (Join-Path $repo 'scripts\write-desktop-html.mjs')
$desktopFallbackBuilder = Get-Content -Raw (Join-Path $repo 'scripts\build-desktop-fallback.ps1')
$playerSkin = Get-Content -Raw (Join-Path $repo 'desktop\src-tauri\bin\streamnyaa-player.lua')

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
Assert-Match $appDesktop 'path="watch/:id"' 'Desktop route tree should own the watch route.'
Assert-Match $appDesktop 'path="anime/:id"\s+element=\{<AnimeToDesktopWatch\s*/>\}' 'Desktop anime routes must redirect to the desktop watch page.'
Assert-Match $desktopShell 'SIDEBAR_STORAGE_KEY' 'Desktop shell should persist sidebar collapse state.'
Assert-Match $desktopShell 'setSidebarCollapsed' 'Desktop shell menu button should toggle the sidebar.'
Assert-Match $appDesktop "path=`"search`" element=\{<DesktopExplore />\}" 'Desktop Explore must use the desktop-native page.'
Assert-Match $appDesktop "path=`"nyaa`" element=\{<DesktopSources />\}" 'Desktop Sources must use the desktop-native page.'
Assert-Match $appDesktop "path=`"schedule`" element=\{<DesktopSchedule />\}" 'Desktop Schedule must use the desktop-native page.'
if ($appDesktop -match "import\\('./pages/AnimeDetails'\\)") {
  throw 'Desktop app must not mount the web anime details page.'
}
Assert-Match $animeCard 'desktopWatchOrBrowsePath\(anime\)' 'Desktop anime cards must use the desktop-specific watch routing helper.'
Assert-Match $desktopHome 'desktopWatchPath\(anime' 'Desktop home should build watch links through the desktop-specific route helper.'
Assert-Match $desktopHome 'loadDesktopAudioPreference' 'Desktop home should respect the pinned audio preference.'
Assert-Match $desktopHome 'watchEpisodeFor' 'Desktop home should open the latest unwatched episode when possible.'
Assert-Match $watchPage 'Available Sources' 'Desktop watch page source section is missing.'
Assert-Match $watchPage '(Open Source|Play Episode)' 'Desktop watch page primary open action is missing.'
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
Assert-Match $watchPage 'sourcesBusy\s*=\s*sourcesLoading\s*\|\|\s*\(sourcesFetching\s*&&\s*!sources\?\.length\)' 'Desktop autoplay should wait for uncached source queries while keeping cached current-episode sources usable.'
Assert-Match $watchPage 'activeSourceId\s*\|\|\s*playActionLockRef\.current\) return' 'Desktop autoplay should wait for active player handoff before opening the next source.'
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
Assert-Match $desktopExplore 'fetchAnimeSeason' 'Desktop Explore should load the current anime season.'
Assert-Match $desktopSources 'Batch sources hidden' 'Desktop Sources should hide batch files.'
Assert-Match $desktopSources 'loadDesktopAudioPreference' 'Desktop Sources should start from the pinned audio preference.'
Assert-Match $desktopSettings 'Auto-open best source' 'Desktop Settings should expose the episode click behavior preference.'
Assert-Match $desktopSchedule 'fetchSchedule' 'Desktop Schedule should load live airing data.'
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
Assert-Match $tauriMain 'loading_frame' 'Desktop player should use a branded supported loading frame.'
Assert-Match $tauriMain 'image-display-duration=inf' 'Desktop player should hold the branded loading frame while buffering.'
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
