$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$distDir = Join-Path $repoRoot 'dist'
$assetsDir = Join-Path $distDir 'assets'
$entryFile = Join-Path $repoRoot 'src\main.desktop.tsx'
$esbuildPath = Join-Path $repoRoot 'node_modules\@esbuild\win32-x64\esbuild.exe'

if (-not (Test-Path $esbuildPath)) {
  throw "esbuild binary not found: $esbuildPath"
}

if (Test-Path $distDir) {
  Remove-Item -LiteralPath $distDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

$args = @(
  $entryFile,
  '--bundle',
  '--splitting',
  '--format=esm',
  '--platform=browser',
  '--target=es2022',
  '--conditions=style',
  "--outdir=$assetsDir",
  '--entry-names=desktop-entry-[hash]',
  '--chunk-names=desktop-chunk-[name]-[hash]',
  '--asset-names=desktop-asset-[name]-[hash]',
  '--public-path=/assets',
  '--loader:.png=file',
  '--loader:.svg=file',
  '--loader:.jpg=file',
  '--loader:.jpeg=file',
  '--loader:.webp=file',
  '--loader:.gif=file',
  '--loader:.woff=file',
  '--loader:.woff2=file',
  '--define:import.meta.env.VITE_STREAMNYAA_APP_TARGET="desktop"'
)

& $esbuildPath @args
if ($LASTEXITCODE -ne 0) {
  throw "Desktop fallback frontend build failed with exit code $LASTEXITCODE"
}

node (Join-Path $repoRoot 'scripts\build-desktop-css.mjs')
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$entryBundle = Get-ChildItem -Path $assetsDir -Filter 'desktop-entry-*.js' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $entryBundle) {
  throw 'Desktop fallback frontend build did not produce an entry bundle.'
}

node (Join-Path $repoRoot 'scripts\write-desktop-html.mjs')
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Prepared desktop fallback frontend bundle:"
Write-Host "  Entry JS: $($entryBundle.FullName)"
Write-Host "  Index   : $(Join-Path $distDir 'index.html')"
