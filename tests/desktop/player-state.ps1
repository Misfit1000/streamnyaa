$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$mpv = Join-Path $repo 'desktop\src-tauri\bin\mpv.com'
$test = Join-Path $PSScriptRoot 'player-state-regression.lua'
Push-Location $repo
try {
  $output = & $mpv --no-config --idle=no --vo=null --ao=null "--script=$test" --length=3 --term-status-msg= 'av://lavfi:testsrc=duration=4:size=320x180:rate=24' 2>&1 | Out-String
  $passed = [regex]::Match($output, 'player-state regression passed: (\d+) assertions')
  if ($LASTEXITCODE -ne 0 -or -not $passed.Success -or [int]$passed.Groups[1].Value -lt 298 -or $output -match 'Lua error:|regression FAILED:') {
    Write-Host $output
    throw 'Native player-state regression failed.'
  }
  Write-Host "Native player-state regression passed ($($passed.Groups[1].Value) behavioral assertions)."
}
finally {
  Pop-Location
}
