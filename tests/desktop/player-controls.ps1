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
  Start-Sleep -Milliseconds 120
  if ((Invoke-MpvCommand @('get_property', 'pause')) -ne $false) {
    throw 'K did not resume playback.'
  }

  Invoke-MpvCommand @('keypress', 'm') | Out-Null
  Start-Sleep -Milliseconds 80
  if ((Invoke-MpvCommand @('get_property', 'mute')) -ne $true) {
    throw 'M did not mute playback.'
  }

  Invoke-MpvCommand @('keypress', ']') | Out-Null
  Start-Sleep -Milliseconds 80
  if ([double](Invoke-MpvCommand @('get_property', 'speed')) -le 1) {
    throw '] did not increase playback speed.'
  }

  Invoke-MpvCommand @('keypress', '5') | Out-Null
  Start-Sleep -Milliseconds 80
  $lastShortcut = Invoke-MpvCommand @('get_property', 'user-data/streamnyaa/last_shortcut')
  if ($lastShortcut -ne 'key-percent-5') {
    throw 'The number-row percentage shortcut did not reach the StreamNyaa player handler.'
  }

  Invoke-MpvCommand @('keypress', 'f') | Out-Null
  Start-Sleep -Milliseconds 100
  if ((Invoke-MpvCommand @('get_property', 'fullscreen')) -ne $true) {
    throw 'F did not enter fullscreen.'
  }
  Invoke-MpvCommand @('keypress', 'ESC') | Out-Null
  Start-Sleep -Milliseconds 100
  if ((Invoke-MpvCommand @('get_property', 'fullscreen')) -ne $false) {
    throw 'Escape did not exit fullscreen.'
  }

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

  Write-Host "Desktop native player-controls integration test passed ($SoakCycles soak cycles)."
}
finally {
  if ($pipe) { $pipe.Dispose() }
  if ($player -and -not $player.HasExited) {
    Stop-Process -Id $player.Id -Force -ErrorAction SilentlyContinue
  }
}
