$ErrorActionPreference = 'Stop'

$proxyKeys = @(
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy'
)

foreach ($key in $proxyKeys) {
  if (Test-Path "Env:$key") {
    Remove-Item "Env:$key" -ErrorAction SilentlyContinue
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

npm.cmd run verify:desktop-release
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

npm.cmd run desktop:build
if ($LASTEXITCODE -ne 0) {
  $distIndex = Join-Path $repoRoot 'dist\index.html'
  if (-not (Test-Path $distIndex)) {
    exit $LASTEXITCODE
  }

  Write-Host 'Normal desktop frontend build failed. Rebuilding the desktop frontend with the direct fallback builder.'

  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\build-desktop-fallback.ps1')
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  $fallbackConfigPath = Join-Path $repoRoot 'desktop\src-tauri\tauri.fallback-build.json'
  $fallbackConfig = @'
{
  "build": {
    "beforeBuildCommand": "npm.cmd run prepare:desktop-binaries",
    "frontendDist": "../../dist"
  }
}
'@
  Set-Content -LiteralPath $fallbackConfigPath -Value $fallbackConfig -Encoding UTF8

  try {
    Push-Location (Join-Path $repoRoot 'desktop\src-tauri')
    cargo tauri build --config $fallbackConfigPath
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
  finally {
    Pop-Location
    Remove-Item -LiteralPath $fallbackConfigPath -ErrorAction SilentlyContinue
  }
}

npm.cmd run prepare:desktop-release
exit $LASTEXITCODE
