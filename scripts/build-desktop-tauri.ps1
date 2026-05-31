$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\prepare-desktop-frontend.ps1')
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$overrideConfigPath = Join-Path $repoRoot 'desktop\src-tauri\tauri.build-command.json'
$overrideConfig = @'
{
  "build": {
    "beforeBuildCommand": "npm.cmd run prepare:desktop-binaries",
    "frontendDist": "../../dist"
  }
}
'@
Set-Content -LiteralPath $overrideConfigPath -Value $overrideConfig -Encoding UTF8

try {
  Push-Location (Join-Path $repoRoot 'desktop\src-tauri')
  cargo tauri build --config $overrideConfigPath
  exit $LASTEXITCODE
}
finally {
  Pop-Location
  Remove-Item -LiteralPath $overrideConfigPath -ErrorAction SilentlyContinue
}
