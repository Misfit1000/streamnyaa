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
$mainDesktop = Get-Content -Raw (Join-Path $repo 'src\main.desktop.tsx')
$animeCard = Get-Content -Raw (Join-Path $repo 'src\components\AnimeCard.tsx')
$jikanApi = Get-Content -Raw (Join-Path $repo 'src\api\jikan.ts')
$desktopHome = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopHome.tsx')
$desktopExplore = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopExplore.tsx')
$desktopSources = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopSources.tsx')
$desktopSchedule = Get-Content -Raw (Join-Path $repo 'src\pages\DesktopSchedule.tsx')
$nyaaApi = Get-Content -Raw (Join-Path $repo 'src\api\nyaa.ts')
$tauriMain = Get-Content -Raw (Join-Path $repo 'desktop\src-tauri\src\main.rs')
$workflow = Get-Content -Raw (Join-Path $repo '.github\workflows\desktop-release.yml')
$packageJson = Get-Content -Raw (Join-Path $repo 'package.json')
$desktopHtmlWriter = Get-Content -Raw (Join-Path $repo 'scripts\write-desktop-html.mjs')
$desktopFallbackBuilder = Get-Content -Raw (Join-Path $repo 'scripts\build-desktop-fallback.ps1')

Assert-Match $desktopBridge "DEFAULT_DESKTOP_SETTINGS:\s*DesktopPlaybackSettings\s*=\s*\{\s*torrent_engine_path:\s*''" 'Desktop settings should default to bundled engine lookup.'
Assert-Match $desktopBridge '__STREAMNYAA_DESKTOP__' 'Desktop detection should use the explicit desktop runtime flag.'
if ($desktopBridge -match 'VITE_STREAMNYAA_APP_TARGET') {
  throw 'Desktop runtime detection must not depend on build-time env replacement.'
}
Assert-Match $mainDesktop 'window\.__STREAMNYAA_DESKTOP__\s*=\s*true' 'Desktop entry must set the explicit desktop runtime flag.'
Assert-Match $desktopBridge 'buildDesktopDiagnosticsReport' 'Desktop diagnostics report helper is missing.'
Assert-Match $appDesktop 'path="watch/:id"' 'Desktop route tree should own the watch route.'
Assert-Match $appDesktop 'path="anime/:id"\s+element=\{<AnimeToDesktopWatch\s*/>\}' 'Desktop anime routes must redirect to the desktop watch page.'
Assert-Match $appDesktop "path=`"search`" element=\{<DesktopExplore />\}" 'Desktop Explore must use the desktop-native page.'
Assert-Match $appDesktop "path=`"nyaa`" element=\{<DesktopSources />\}" 'Desktop Sources must use the desktop-native page.'
Assert-Match $appDesktop "path=`"schedule`" element=\{<DesktopSchedule />\}" 'Desktop Schedule must use the desktop-native page.'
if ($appDesktop -match "import\\('./pages/AnimeDetails'\\)") {
  throw 'Desktop app must not mount the web anime details page.'
}
Assert-Match $animeCard 'isUpcomingAnime\(anime\)' 'Desktop anime cards must detect upcoming anime before routing.'
Assert-Match $animeCard 'desktopUpcomingPath\(anime\)' 'Desktop upcoming anime cards must route into the desktop explore page.'
Assert-Match $watchPage 'Available Sources' 'Desktop watch page source section is missing.'
Assert-Match $watchPage 'Open Source' 'Desktop watch page primary open action is missing.'
Assert-Match $watchPage 'fallbackAnimeFromRoute' 'Desktop watch page must fall back to a route title when metadata lookup fails.'
Assert-Match $watchPage 'SafeImage' 'Desktop watch page must render fallback-safe images.'
Assert-Match $watchPage 'episodeNumberFromTitle' 'Desktop watch page should avoid mismatching episode thumbnails and titles.'
Assert-Match $watchPage 'selectedEpisode - Math\.floor\(maxVisible / 2\)' 'Desktop watch page should keep the selected long-running episode in the visible strip.'
Assert-Match $watchPage 'sourceSearchTitleVariants' 'Desktop watch page should widen source title matching for alternate season naming.'
Assert-Match $watchPage 'selectedEpisode > 0 && !episodeMatches\.length' 'Desktop watch page should reject wrong-episode torrent sources.'
if ($watchPage -match 'Anime not found') {
  throw 'Desktop watch page must not dead-end on "Anime not found".'
}
if ($jikanApi -match '(?m)^\s*rank\s*$') {
  throw 'AniList queries must not request unsupported rank fields.'
}
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
Assert-Match $desktopSchedule 'fetchSchedule' 'Desktop Schedule should load live airing data.'
Assert-Match $nyaaApi 'inMemorySearchCache' 'Desktop source fetch cache is missing.'
Assert-Match $tauriMain 'fn get_desktop_diagnostics' 'Desktop diagnostics command is missing.'
Assert-Match $tauriMain 'logs_root\(\)' 'Desktop log directory helper is missing.'
Assert-Match $tauriMain 'cleanup_abandoned_sessions' 'Desktop cache cleanup path is missing.'
Assert-Match $tauriMain 'play_local_torrent' 'Desktop local playback command is missing.'
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
