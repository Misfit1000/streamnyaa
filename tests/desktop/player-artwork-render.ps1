param([Parameter(Mandatory=$true)][string]$MetadataPath,[Parameter(Mandatory=$true)][string]$OutputDirectory,[string]$Size='1920x1080')
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$meta=Get-Content -Raw -LiteralPath $MetadataPath | ConvertFrom-Json
$output=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$previous=$env:STREAMNYAA_ARTWORK_RENDER_OUTPUT
$env:STREAMNYAA_ARTWORK_RENDER_OUTPUT=$output.Replace('\','/')
$player=$null
try {
  $metadataAbsolute=(Resolve-Path -LiteralPath $MetadataPath).Path.Replace('\','/')
  $scriptPath=(Join-Path $PSScriptRoot 'player-artwork-render.lua')
  $args=@('--no-config','--force-window=yes',"--geometry=$Size",'--border=no','--auto-window-resize=no','--osc=no','--osd-bar=no','--vo=gpu-next','--gpu-api=d3d11','--ao=null','--pause=yes','--image-display-duration=inf',('--script="'+$scriptPath+'"'),('--script-opts=streamnyaa_player-meta_file="'+$metadataAbsolute+'"'),('--log-file="'+$output+'/render.log"'),('"'+$meta.loadingImagePath+'"'))
  $player=Start-Process -FilePath (Join-Path $repo 'desktop/src-tauri/bin/mpv.exe') -ArgumentList $args -WindowStyle Hidden -PassThru
  if(!$player.WaitForExit(20000)){throw 'Native artwork render timed out.'}
  if($player.ExitCode -ne 0){throw 'Native artwork render failed.'}
  $log=Get-Content -Raw -LiteralPath (Join-Path $output 'render.log')
  if($log -match 'Lua error:|cover overlay update failed|loading UI fallback was used|Error parsing command'){throw "Native artwork render failed: $output/render.log"}
  foreach($name in @('loading','buffering','settings','complete','long-title','playing')){
    $file=Join-Path $output "$name.png"
    if(!(Test-Path -LiteralPath $file) -or (Get-Item -LiteralPath $file).Length -lt 1000){throw "Missing render: $name"}
  }
  Write-Host "Native artwork GPU render passed: $output"
}finally{
  $env:STREAMNYAA_ARTWORK_RENDER_OUTPUT=$previous
  if($player -and !$player.HasExited){Stop-Process -Id $player.Id -ErrorAction SilentlyContinue}
}
