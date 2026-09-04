$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$mpv = Join-Path $repo 'desktop\src-tauri\bin\mpv.com'
$test = Join-Path $PSScriptRoot 'player-state-regression.lua'
Push-Location $repo
try {
  $output = & $mpv --no-config --idle=no --vo=null --ao=null "--script=$test" --length=3 --term-status-msg= 'av://lavfi:testsrc=duration=4:size=320x180:rate=24' 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -or $output -notmatch 'player-state regression passed: 54 assertions' -or $output -match 'Lua error:|regression FAILED:') {
    Write-Host $output
    throw 'Native player-state regression failed.'
  }
  Write-Host 'Native player-state regression passed (54 behavioral assertions).'
}
finally {
  Pop-Location
}
