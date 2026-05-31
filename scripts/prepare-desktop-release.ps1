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

$copiedInstaller = Join-Path $releaseRoot $installer.Name
Copy-Item -LiteralPath $installer.FullName -Destination $copiedInstaller -Force

$hash = (Get-FileHash -Algorithm SHA256 $copiedInstaller).Hash
$sizeBytes = (Get-Item $copiedInstaller).Length
$manifest = [ordered]@{
  product = 'StreamNyaa Desktop'
  version = $version
  generatedAt = (Get-Date).ToString('o')
  installer = @{
    fileName = [IO.Path]::GetFileName($copiedInstaller)
    path = $copiedInstaller
    sizeBytes = $sizeBytes
    sha256 = $hash
  }
  notes = @(
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
