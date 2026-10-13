param(
  [string]$ReleaseTree,
  [string]$ValidationRecord = '.validation/0.1.10-results.json',
  [string]$BuildInputs = '.validation/0.1.10-build-inputs.json',
  [string]$ValidationNotes = 'desktop/reviews/2026-10-12-playback-home.md',
  [string]$EvidenceManifest = 'desktop/reviews/2026-10-12-playback-home-installer.json',
  [string]$ReleaseRevision = 'playback-home-reliability'
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (!$ReleaseTree) {
  $usualDesktop = Join-Path (Split-Path $repoRoot -Parent) 'StreamNyaa-desktop\desktop'
  if (Test-Path -LiteralPath $usualDesktop) { $ReleaseTree = Join-Path $usualDesktop 'releases' }
  else { $ReleaseTree = Join-Path $repoRoot 'desktop\releases' }
}
$config = Get-Content -Raw (Join-Path $repoRoot 'desktop/src-tauri/tauri.conf.json') | ConvertFrom-Json
$version = [string]$config.version
if ($config.identifier -ne 'xyz.streamnyaa.desktop' -or !$version) { throw 'Unexpected desktop identity/version.' }
$target = Join-Path $repoRoot 'desktop/src-tauri/target/release'
$installer = Get-Item -LiteralPath (Join-Path $target "bundle/nsis/StreamNyaa_${version}_x64-setup.exe")
$exe = Get-Item -LiteralPath (Join-Path $target 'streamnyaa_desktop.exe')
if ($exe.VersionInfo.ProductVersion -notlike "$version*") { throw 'Executable version mismatch.' }
$nsi = Get-Content -Raw (Join-Path $target 'nsis/x64/installer.nsi')
if (!$nsi.Contains("!define VERSION `"$version`"")) { throw 'NSIS version mismatch.' }
if ($installer.Length -lt 30MB -or $installer.Length -gt 50MB) { throw 'Unexpected installer size.' }
$checksPath = Join-Path $repoRoot $ValidationRecord
$checks = Get-Content -Raw $checksPath | ConvertFrom-Json
if (!$checks.automatedPassed) { throw 'Final checks have not passed.' }
$inputs = Get-Content -Raw (Join-Path $repoRoot $BuildInputs) | ConvertFrom-Json
foreach ($inputFile in $inputs) { if ((Get-FileHash -LiteralPath $inputFile.path -Algorithm SHA256).Hash -ne $inputFile.sha256) { throw "Validated source changed: $($inputFile.path)" } }
$resources = foreach ($resource in Get-ChildItem -LiteralPath (Join-Path $repoRoot 'desktop/src-tauri/bin') -File) {
  $hash = (Get-FileHash -LiteralPath $resource.FullName -Algorithm SHA256).Hash
  $stage = Join-Path $target "bin/$($resource.Name)"
  if ($hash -ne (Get-FileHash -LiteralPath $stage -Algorithm SHA256).Hash -or !$nsi.Contains($resource.FullName)) { throw "Resource mismatch: $($resource.Name)" }
  [ordered]@{ name=$resource.Name; bytes=$resource.Length; sha256=$hash; stagedMatches=$true; nsisInclusionVerified=$true }
}
$rollback = Join-Path $ReleaseTree 'v0.1.9/StreamNyaa_0.1.9_x64-setup.exe'
$rollbackHash = (Get-FileHash -LiteralPath $rollback -Algorithm SHA256).Hash
if ($installer.Length -gt ((Get-Item -LiteralPath $rollback).Length + 2MB)) { throw 'Installer exceeded the two MiB growth budget over the rollback release.' }
$rollbackManifest = Get-Content -Raw (Join-Path $ReleaseTree 'v0.1.9/release-manifest.json') | ConvertFrom-Json
if ($rollbackHash -ne $rollbackManifest.sha256) { throw 'Previous installer checksum mismatch.' }
$release = Join-Path $ReleaseTree "v$version"
New-Item -ItemType Directory -Path $release -Force | Out-Null
$destination = Join-Path $release $installer.Name
$hash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
if (Test-Path -LiteralPath $destination) {
  $archive = Join-Path $ReleaseTree ('archive/v'+$version+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Path $archive -Force | Out-Null
  foreach ($name in @($installer.Name,'release-manifest.json','SHA256SUMS.txt','validation-notes.md')) { $old=Join-Path $release $name; if (Test-Path -LiteralPath $old) { Copy-Item -LiteralPath $old -Destination (Join-Path $archive $name) } }
}
Copy-Item -LiteralPath $installer.FullName -Destination $destination -Force
if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $hash) { throw 'Release copy mismatch.' }
$manifest = [ordered]@{
  product='StreamNyaa Desktop'; version=$version; identifier=$config.identifier; releaseRevision=$ReleaseRevision; builtAt=(Get-Date).ToString('o'); sourceCommit=(git -C $repoRoot rev-parse HEAD);
  installer=$destination; bytes=$installer.Length; sha256=$hash; signature=(Get-AuthenticodeSignature -LiteralPath $destination).Status.ToString();
  rollback=@{installer=$rollback;sha256=$rollbackHash}; resources=$resources; sourceFiles=$inputs;
  executableVersion=$exe.VersionInfo.ProductVersion; executableSha256=(Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA256).Hash;
  validation=$checks; payloadVerification='Staged resource hashes and exact NSIS inclusions; independent installer extraction not performed'
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $release 'release-manifest.json') -Encoding UTF8
"$hash  $($installer.Name)" | Set-Content -LiteralPath (Join-Path $release 'SHA256SUMS.txt') -Encoding ASCII
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $repoRoot $EvidenceManifest) -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $repoRoot $ValidationNotes) -Destination (Join-Path $release 'validation-notes.md') -Force
[ordered]@{installer=$manifest.installer;bytes=$manifest.bytes;sha256=$manifest.sha256;signature=$manifest.signature;sourceCommit=$manifest.sourceCommit} | ConvertTo-Json
