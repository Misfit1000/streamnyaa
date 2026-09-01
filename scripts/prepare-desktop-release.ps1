$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$bundleDir = Join-Path $repoRoot 'desktop\src-tauri\target\release\bundle\nsis'
$manifestSource = Join-Path $repoRoot 'desktop\src-tauri\tauri.conf.json'

if (-not (Test-Path $bundleDir)) {
  throw "Installer bundle folder not found: $bundleDir"
}

$installer = Get-ChildItem $bundleDir -Filter '*-setup.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $installer) {
  throw "No NSIS setup executable found in $bundleDir"
}

$tauriConfig = Get-Content -Raw $manifestSource | ConvertFrom-Json
$version = [string]$tauriConfig.version
if (-not $version) {
  throw 'Could not read desktop version from tauri.conf.json'
}

$releaseRoot = Join-Path $repoRoot ("desktop\releases\v{0}" -f $version)
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

if ($version -eq '0.1.3') {
  $validationMarker = Join-Path $releaseRoot 'auth-recovery-live-validation.json'
  if (-not (Test-Path $validationMarker)) {
    throw 'The 0.1.3 recovery installer cannot be replaced before live desktop validation.'
  }
  $validation = Get-Content -Raw $validationMarker | ConvertFrom-Json
  if (-not $validation.validated -or [string]$validation.releaseRevision -ne 'auth-recovery-hotfix-2') {
    throw 'The live validation marker does not authorize auth-recovery-hotfix-2 packaging.'
  }
}

$rollbackInstaller = Get-ChildItem (Join-Path $repoRoot 'desktop\releases\v0.1.4') -Filter '*-setup.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($rollbackInstaller -and $installer.Length -gt ($rollbackInstaller.Length + 2MB)) {
  throw ("Installer size grew by more than 2 MiB over 0.1.4 ({0} -> {1} bytes)." -f $rollbackInstaller.Length, $installer.Length)
}

$copiedInstaller = Join-Path $releaseRoot $installer.Name
Copy-Item -LiteralPath $installer.FullName -Destination $copiedInstaller -Force

$sha256 = [Security.Cryptography.SHA256]::Create()
$installerStream = [IO.File]::OpenRead($copiedInstaller)
try {
  $hash = ([BitConverter]::ToString($sha256.ComputeHash($installerStream))).Replace('-', '')
}
finally {
  $installerStream.Dispose()
  $sha256.Dispose()
}
$sizeBytes = (Get-Item $copiedInstaller).Length
$manifest = [ordered]@{
  product = 'StreamNyaa Desktop'
  version = $version
  releaseRevision = 'desktop-loading-recovery-7'
  generatedAt = (Get-Date).ToString('o')
  installer = @{
    fileName = [IO.Path]::GetFileName($copiedInstaller)
    path = $copiedInstaller
    sizeBytes = $sizeBytes
    sha256 = $hash
  }
  notes = @(
    'Adds adaptive click-ahead route, episode, artwork, and playback preparation without downloading video early.',
    'Rebuilds Explore with persistent controls, saved results, and uninterrupted background refresh.',
    'Shows verified aired and total episode counts, and hides unaired episodes from Watch selection.',
    'Moves catalog, playback-option, and query snapshot persistence away from interaction frames.',
    'Adds a resolution-aware launch sequence and complete neutral landscape artwork with real anime titles and native loading stages.',
    'Shows live playable-buffer percentage and seconds, including while stalled and recovering.',
    'Adds bounded recovery for streams that never expose a playable timeline: current-stream reload, automatic alternate playback, then manual actions.',
    'Adds credential-free schedule revision tracking that labels changed AniList episode slots as rescheduled without guessing cancellations.',
    'Adds a compact notification center for confirmed delays and cancellations, personal/global feed controls, and categorized desktop settings navigation.',
    'Makes Explore resilient through saved catalogs and hedged refreshes, activates global search, adds upcoming-airing notifications, and surfaces player keybinds in simplified settings.',
    'Closes the pre-playback freeze gap, renders live buffer percentage inside the native player, and upgrades loading art to a cinematic full-bleed composition.',
    'Keeps the exact saved schedule visible during connection failures and distinguishes verified empty days from refresh errors.',
    'Refines the native player with compact live buffering feedback, raised skip controls, and a cleaner next-episode panel.',
    'Uses genuine landscape artwork for player startup, removes poster-card composition, and applies a smooth neutral readability gradient.',
    'Run the manual desktop release checklist before publishing this installer.',
    'Code-sign the installer before distribution.',
    'Keep the previous stable installer for rollback.'
  )
}

$manifestPath = Join-Path $releaseRoot 'release-manifest.json'
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $manifestPath -Encoding UTF8

$checksumPath = Join-Path $releaseRoot 'SHA256SUMS.txt'
"{0}  {1}" -f $hash, [IO.Path]::GetFileName($copiedInstaller) | Set-Content -Path $checksumPath -Encoding ASCII

Write-Host "Prepared desktop release artifacts:"
Write-Host "  Installer : $copiedInstaller"
Write-Host "  Manifest  : $manifestPath"
Write-Host "  Checksums : $checksumPath"
