param(
  [string]$PackageName = 'com.misfit1000.streamnyaa'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$androidSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $androidSdk 'platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adb)) { throw "ADB was not found at $adb" }

$devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "\sdevice$" }
if ($devices.Count -ne 1) { throw "Connect exactly one authorized Android device. Found $($devices.Count)." }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputDirectory = Join-Path $repositoryRoot ".tooling\mobile-device\$stamp"
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

function Save-AdbOutput {
  param([string]$Name, [string[]]$Arguments)
  $content = (& $adb @Arguments 2>&1 | Out-String)
  $safe = $content `
    -replace '(?i)magnet:\?\S+', '[magnet redacted]' `
    -replace '(?i)(bearer\s+)[a-z0-9._~-]+', '$1[token redacted]' `
    -replace '(?i)((?:access|refresh)[_-]?token)["''=:\s]+[a-z0-9._~-]+', '$1=[token redacted]' `
    -replace '(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', '[email redacted]'
  Set-Content -LiteralPath (Join-Path $outputDirectory $Name) -Value $safe -Encoding utf8
}

$packageDump = (& $adb shell dumpsys package $PackageName 2>&1 | Out-String)
if ($packageDump -notmatch [regex]::Escape($PackageName)) { throw "$PackageName is not installed on the connected device." }
Set-Content -LiteralPath (Join-Path $outputDirectory 'package.txt') -Value $packageDump -Encoding utf8

$uidMatch = [regex]::Match($packageDump, 'userId=(\d+)')
Save-AdbOutput 'device.txt' @('shell', 'sh', '-c', 'getprop ro.product.manufacturer; getprop ro.product.model; getprop ro.build.version.sdk; getprop ro.product.cpu.abilist; wm size; wm density')
Save-AdbOutput 'exit-info.txt' @('shell', 'dumpsys', 'activity', 'exit-info', $PackageName)
Save-AdbOutput 'memory.txt' @('shell', 'dumpsys', 'meminfo', $PackageName)
Save-AdbOutput 'frames.txt' @('shell', 'dumpsys', 'gfxinfo', $PackageName)
if ($uidMatch.Success) {
  Save-AdbOutput 'app-logcat.txt' @('logcat', '-d', '-v', 'threadtime', "--uid=$($uidMatch.Groups[1].Value)")
} else {
  Set-Content -LiteralPath (Join-Path $outputDirectory 'app-logcat.txt') -Value 'Package UID was unavailable; app-scoped logcat was not collected.' -Encoding utf8
}

$manifest = [ordered]@{
  protocolVersion = 1
  capturedAt = (Get-Date).ToUniversalTime().ToString('o')
  packageName = $PackageName
  appScopedLogcat = $uidMatch.Success
  installedAnything = $false
  outputDirectory = $outputDirectory
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputDirectory 'manifest.json') -Encoding utf8
Write-Output "Saved StreamNyaa-only device diagnostics to $outputDirectory"
