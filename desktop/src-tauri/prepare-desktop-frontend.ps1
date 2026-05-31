$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repoRoot

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\prepare-desktop-frontend.ps1')
exit $LASTEXITCODE
