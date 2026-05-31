$ErrorActionPreference = 'Stop'

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw 'Rust cargo is not installed or not on PATH.'
}

$cargoVersion = & cargo --version
if (-not $cargoVersion) {
  throw 'cargo is installed but did not return a version.'
}

& cargo tauri --version | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'cargo tauri is not installed. Run: cargo install tauri-cli --locked'
}

Write-Host 'Desktop tooling preflight passed.'
