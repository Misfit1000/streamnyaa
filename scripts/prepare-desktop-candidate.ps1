param([string]$Evidence = 'desktop/reviews/2026-09-09-completion-candidate.md', [string]$UpdateCandidate = '')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$config = Get-Content -LiteralPath (Join-Path $repo 'desktop/src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
$installer = Join-Path $repo "desktop/src-tauri/target/release/bundle/nsis/StreamNyaa_$($config.version)_x64-setup.exe"
if (-not (Test-Path -LiteralPath $installer)) { throw 'Build the candidate installer first.' }
$candidate = Join-Path $repo ("desktop/releases/candidates/{0}-{1}" -f $config.version, (Get-Date -Format 'yyyyMMdd-HHmmss'))
if ($UpdateCandidate) {
  $candidateRoot = (Resolve-Path -LiteralPath (Join-Path $repo 'desktop/releases/candidates')).Path
  $candidate = (Resolve-Path -LiteralPath $UpdateCandidate).Path
  if (-not $candidate.StartsWith($candidateRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Update target must be an existing candidate directory.' }
  $existing = Get-Content -LiteralPath (Join-Path $candidate 'candidate-manifest.json') -Raw | ConvertFrom-Json
  if ($existing.version -ne $config.version -or $existing.accepted) { throw 'Only an unaccepted candidate of the same version may be updated.' }
} else {
  if (Test-Path -LiteralPath $candidate) { throw 'Candidate directory already exists; refusing overwrite.' }
  New-Item -ItemType Directory -Path $candidate | Out-Null
}
$target = Join-Path $candidate ([IO.Path]::GetFileName($installer))
Copy-Item -LiteralPath $installer -Destination $target
$hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
if ($hash -ne (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash) { throw 'Candidate copy verification failed.' }
$resources = @(Get-ChildItem -LiteralPath (Join-Path $repo 'desktop/src-tauri/bin') -File -Recurse | ForEach-Object {
  @{ file = $_.FullName.Substring($repo.Length + 1); bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName).Hash }
})
$manifest = [ordered]@{
  product = $config.productName; version = $config.version; identifier = $config.identifier
  builtFromCommit = (git -C $repo rev-parse HEAD); workingTreeModified = $true
  accepted = $false; status = 'INTERNAL CANDIDATE - acceptance gates remain open'
  createdAt = (Get-Date).ToString('o')
  installer = @{ file = [IO.Path]::GetFileName($target); bytes = (Get-Item -LiteralPath $target).Length; sha256 = $hash; signature = [string](Get-AuthenticodeSignature -LiteralPath $target).Status }
  resourceInputs = $resources
  evidence = $Evidence
  unresolved = @('AniList live access and primary recovery', 'Complete native action, playback and scaling acceptance', 'Download fault and simultaneous-playback matrix', 'Live account-sync round trips', 'Isolated Windows clean install, same-version upgrade and rollback', 'Signing material and distribution signature')
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $candidate 'candidate-manifest.json') -Encoding UTF8
"$hash  $([IO.Path]::GetFileName($target))" | Set-Content -LiteralPath (Join-Path $candidate 'SHA256SUMS.txt') -Encoding ASCII
git -C $repo diff --binary --output="$candidate/working-tree.patch"
$inputs = @(git -C $repo ls-files -c -o --exclude-standard | Sort-Object -Unique | ForEach-Object {
  $inputPath = Join-Path $repo $_
  if (Test-Path -LiteralPath $inputPath -PathType Leaf) { @{ file = $_; sha256 = (Get-FileHash -LiteralPath $inputPath).Hash } }
})
$inputs | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $candidate 'source-checksums.json') -Encoding UTF8
Write-Output $candidate
