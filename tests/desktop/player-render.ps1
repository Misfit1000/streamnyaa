param([switch]$KeepArtifacts)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$mpv = Join-Path $repo 'desktop\src-tauri\bin\mpv.exe'
$skin = Join-Path $PSScriptRoot 'player-render.lua'
$output = Join-Path ([IO.Path]::GetTempPath()) ('streamnyaa-player-render-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $output | Out-Null
$previousOutput = $env:STREAMNYAA_RENDER_OUTPUT
$player = $null
$passed = $false
try {
  $env:STREAMNYAA_RENDER_OUTPUT = $output
  $arguments = @(
    '--no-config', '--force-window=yes', '--geometry=1280x720', '--border=no',
    '--vo=gpu-next', '--gpu-api=d3d11', '--ao=null', '--pause=yes',
    ('--script="' + $skin + '"'), ('--log-file="' + $output + '\render.log"'),
    'av://lavfi:color=c=0x14171c:size=1280x720:rate=24:duration=10'
  )
  $player = Start-Process -FilePath $mpv -ArgumentList $arguments -WindowStyle Hidden -PassThru
  if (-not $player.WaitForExit(15000)) { throw 'Native player render timed out.' }
  if ($player.ExitCode -ne 0) { throw "Native player render failed: $($player.ExitCode)" }
  $log = Get-Content -LiteralPath (Join-Path $output 'render.log') -Raw
  if ($log -match 'Lua error:|cover overlay update failed|failed to create overlay|Error parsing command') {
    throw "Native player render failed. Inspect $output\render.log"
  }
  foreach ($name in @('artwork.png', 'buffering.png', 'controls-dark.png', 'controls-bright.png', 'complete.png', 'settings-buffering.png', 'settings-scroll.png')) {
    $path = Join-Path $output $name
    if (-not (Test-Path -LiteralPath $path) -or (Get-Item -LiteralPath $path).Length -lt 1000) {
      throw "Native player did not capture $name"
    }
  }
  $passed = $true
  Write-Host "Native GPU render passed. Inspect screenshots in $output"
}
finally {
  $env:STREAMNYAA_RENDER_OUTPUT = $previousOutput
  if ($player -and -not $player.HasExited) { Stop-Process -Id $player.Id -ErrorAction SilentlyContinue }
  $resolvedOutput = [IO.Path]::GetFullPath($output)
  $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $safeTemporaryOutput = $resolvedOutput.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedOutput -Leaf).StartsWith('streamnyaa-player-render-')
  if ($passed -and -not $KeepArtifacts -and $safeTemporaryOutput) {
    Remove-Item -LiteralPath $resolvedOutput -Recurse -Force
  }
}
