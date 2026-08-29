param(
  [int]$TimeoutSeconds = 12
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$mpv = Join-Path $repo 'desktop\src-tauri\bin\mpv.exe'
$skin = Join-Path $repo 'desktop\src-tauri\bin\streamnyaa-player.lua'
if (-not (Test-Path $mpv) -or -not (Test-Path $skin)) {
  throw 'Bundled MPV and the StreamNyaa player skin are required for the stall integration test.'
}

$tempRoot = [IO.Path]::GetTempPath()
$testRoot = Join-Path $tempRoot ("streamnyaa-stall-test-{0}" -f [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$logPath = Join-Path $testRoot 'mpv-stall.log'
$player = $null

try {
  $arguments = @(
    '--no-config',
    '--force-window=no',
    '--vo=null',
    '--ao=null',
    '--cache=yes',
    '--cache-pause=yes',
    "--script=`"$skin`"",
    '--script-opts=streamnyaa_player-stall_test_mode=yes',
    "--log-file=`"$logPath`"",
    'av://lavfi:testsrc=duration=60:size=320x180:rate=24'
  )
  $player = Start-Process -FilePath $mpv -ArgumentList $arguments -WindowStyle Hidden -PassThru

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $sawRetry = $false
  $sawBackup = $false
  $sawPercent = $false
  while ([DateTime]::UtcNow -lt $deadline -and -not $player.HasExited) {
    Start-Sleep -Milliseconds 200
    if (-not (Test-Path $logPath)) { continue }
    $log = Get-Content -Raw $logPath
    $sawRetry = $sawRetry -or $log.Contains('Same-source stream reopen')
    $sawBackup = $sawBackup -or $log.Contains('Backup recovery requested')
    $sawPercent = $sawPercent -or ($log -match 'Buffering started percent=\d+')
    if ($sawRetry -and $sawBackup -and $sawPercent) { break }
  }

  if (-not $sawRetry -or -not $sawBackup -or -not $sawPercent) {
    if (Test-Path $logPath) { Get-Content $logPath -Tail 100 | Write-Host }
  }
  if (-not $sawRetry) {
    throw 'The deterministic stalled stream did not trigger same-source recovery.'
  }
  if (-not $sawBackup) {
    throw 'The deterministic stalled stream did not trigger bounded backup-source recovery.'
  }
  if (-not $sawPercent) {
    throw 'The deterministic stalled stream did not expose a numeric buffering percentage.'
  }
  Write-Host 'Desktop stalled-stream integration test passed.'
}
finally {
  if ($player -and -not $player.HasExited) {
    Stop-Process -Id $player.Id -Force -ErrorAction SilentlyContinue
  }
  $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
  $resolvedTest = [IO.Path]::GetFullPath($testRoot)
  if ($resolvedTest.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedTest -Leaf).StartsWith('streamnyaa-stall-test-')) {
    Remove-Item -LiteralPath $resolvedTest -Recurse -Force -ErrorAction SilentlyContinue
  }
}
