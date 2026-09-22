param(
  [int]$ConnectTimeoutMs = 5000,
  [int]$SoakCycles = 20
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$mpv = Join-Path $repo 'desktop\src-tauri\bin\mpv.exe'
$skin = Join-Path $repo 'desktop\src-tauri\bin\streamnyaa-player.lua'
if (-not (Test-Path $mpv) -or -not (Test-Path $skin)) {
  throw 'Bundled MPV and the StreamNyaa player skin are required for the player-controls test.'
}

$pipeName = "streamnyaa-controls-$([guid]::NewGuid().ToString('N'))"
$pipePath = "\\.\pipe\$pipeName"
$player = $null
$pipe = $null

try {
  $arguments = @(
    '--no-config',
    '--force-window=no',
    '--vo=null',
    '--ao=null',
    '--pause=yes',
    "--input-ipc-server=$pipePath",
    "--script=`"$skin`"",
    'av://lavfi:testsrc=duration=600:size=320x180:rate=24'
  )
  $player = Start-Process -FilePath $mpv -ArgumentList $arguments -WindowStyle Hidden -PassThru
  $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(
    '.',
    $pipeName,
    [System.IO.Pipes.PipeDirection]::InOut,
    [System.IO.Pipes.PipeOptions]::None
  )
  $pipe.Connect($ConnectTimeoutMs)
  $reader = New-Object System.IO.StreamReader($pipe)
  $writer = New-Object System.IO.StreamWriter($pipe)
  $writer.AutoFlush = $true
  $requestId = 0

  function Invoke-MpvCommand([object[]]$Command, [switch]$AllowUnavailable) {
    $script:requestId += 1
    $writer.WriteLine((@{ command = $Command; request_id = $script:requestId } | ConvertTo-Json -Compress))
    do {
      $line = $reader.ReadLine()
      if ($null -eq $line) { throw 'MPV IPC closed before returning a response.' }
      $response = $line | ConvertFrom-Json
    } while ($response.request_id -ne $script:requestId)
    if ($AllowUnavailable -and $response.error -eq 'property unavailable') { return $null }
    if ($response.error -ne 'success') { throw "MPV command '$($Command -join ' ')' failed: $($response.error)" }
    return $response.data
  }

  function Wait-MpvProperty([string]$Property, [scriptblock]$Matches, [string]$Failure) {
    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
      $value = Invoke-MpvCommand -Command @('get_property', $Property) -AllowUnavailable
      if (& $Matches $value) { return }
      Start-Sleep -Milliseconds 30
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "$Failure Last observed value: $value"
  }

  # A playable duration can arrive before Lua has registered its key bindings.
  Wait-MpvProperty 'input-bindings' { param($bindings)
    @($bindings | Where-Object { $_.key -eq 'k' -and $_.cmd -like '*streamnyaa*' }).Count -gt 0
  } 'StreamNyaa keyboard bindings did not initialize.'

  $duration = $null
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    $duration = Invoke-MpvCommand -Command @('get_property', 'duration') -AllowUnavailable
    if ([double]$duration -gt 0) { break }
    Start-Sleep -Milliseconds 100
  }
  if ([double]$duration -le 0) { throw 'MPV did not expose a playable duration within the startup deadline.' }

  if ((Invoke-MpvCommand @('get_property', 'pause')) -ne $true) {
    throw 'The control test must start with playback paused.'
  }
  Invoke-MpvCommand @('keypress', 'k') | Out-Null
  Wait-MpvProperty 'pause' { param($value) $null -ne $value -and $value -eq $false } 'K did not resume playback.'

  Invoke-MpvCommand @('keypress', 'm') | Out-Null
  Wait-MpvProperty 'mute' { param($value) $null -ne $value -and $value -eq $true } 'M did not mute playback.'

  Invoke-MpvCommand @('keypress', ']') | Out-Null
  Wait-MpvProperty 'speed' { param($value) [double]$value -gt 1 } '] did not increase playback speed.'

  Invoke-MpvCommand @('keypress', '5') | Out-Null
  Wait-MpvProperty 'user-data/streamnyaa/last_shortcut' { param($value) $value -eq 'key-percent-5' } 'The number-row percentage shortcut did not reach the StreamNyaa player handler.'

  Invoke-MpvCommand @('keypress', 'f') | Out-Null
  Wait-MpvProperty 'fullscreen' { param($value) $null -ne $value -and $value -eq $true } 'F did not enter fullscreen.'
  Invoke-MpvCommand @('keypress', 'ESC') | Out-Null
  Wait-MpvProperty 'fullscreen' { param($value) $null -ne $value -and $value -eq $false } 'Escape did not exit fullscreen.'

  for ($cycle = 0; $cycle -lt $SoakCycles; $cycle += 1) {
    Invoke-MpvCommand @('seek', 0.1, 'relative+exact') | Out-Null
    Invoke-MpvCommand @('cycle', 'pause') | Out-Null
    Invoke-MpvCommand @('cycle', 'pause') | Out-Null
    Invoke-MpvCommand @('set_property', 'speed', $(if (($cycle % 2) -eq 0) { 1.0 } else { 1.05 })) | Out-Null
    Invoke-MpvCommand @('set_property', 'volume', (70 + ($cycle % 20))) | Out-Null
  }
  if ($player.HasExited) {
    throw 'The native player exited during the repeated-control reliability soak.'
  }

  # Reproduce pause inheritance when reusing MPV for a subsequent episode.
  Invoke-MpvCommand @('set_property', 'pause', $true) | Out-Null
  Invoke-MpvCommand @('loadfile', 'av://lavfi:testsrc=duration=601:size=320x180:rate=24', 'replace') | Out-Null
  Wait-MpvProperty 'path' { param($value) $value -eq 'av://lavfi:testsrc=duration=601:size=320x180:rate=24' } 'Next file did not load.'
  if ((Invoke-MpvCommand @('get_property', 'pause')) -ne $true) { throw 'Pause inheritance reproduction changed.' }
  Invoke-MpvCommand @('set_property', 'pause', $false) | Out-Null
  Wait-MpvProperty 'time-pos' { param($value) [double]$value -gt 0.2 } 'Next episode did not advance after explicit playback handoff.'

  Invoke-MpvCommand @('script-message', 'streamnyaa-progress-session', 'native-regression') | Out-Null
  Start-Sleep -Milliseconds 1600
  Invoke-MpvCommand @('script-message', 'streamnyaa-progress-flush') | Out-Null
  Wait-MpvProperty 'user-data/streamnyaa/progress-checkpoint' { param($value)
    if (!$value) { return $false }
    $checkpoint=$value | ConvertFrom-Json
    return $checkpoint.sessionId -eq 'native-regression' -and $checkpoint.coverage.intervals.Count -gt 0
  } 'Native checkpoint did not capture advancing playback.'
  Invoke-MpvCommand @('set_property', 'pause', $true) | Out-Null
  Invoke-MpvCommand @('script-message', 'streamnyaa-progress-flush') | Out-Null
  Start-Sleep -Milliseconds 100
  $beforeSeek=(Invoke-MpvCommand @('get_property','user-data/streamnyaa/progress-checkpoint') | ConvertFrom-Json).coverage.furthest
  Invoke-MpvCommand @('seek', 80, 'absolute+exact') | Out-Null
  Start-Sleep -Milliseconds 600
  Invoke-MpvCommand @('script-message', 'streamnyaa-progress-flush') | Out-Null
  Start-Sleep -Milliseconds 100
  $afterSeek=(Invoke-MpvCommand @('get_property','user-data/streamnyaa/progress-checkpoint') | ConvertFrom-Json).coverage.furthest
  if ([Math]::Abs($beforeSeek-$afterSeek) -gt 0.05) { throw 'Paused seek incorrectly advanced watched coverage.' }

  Write-Host "Desktop native player-controls integration test passed ($SoakCycles soak cycles)."
}
finally {
  if ($pipe) { $pipe.Dispose() }
  if ($player -and -not $player.HasExited) {
    Stop-Process -Id $player.Id -Force -ErrorAction SilentlyContinue
  }
}
