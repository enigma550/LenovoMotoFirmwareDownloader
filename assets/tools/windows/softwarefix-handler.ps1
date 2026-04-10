param(
  [string]$LauncherPath,
  [string]$CallbackDropPath,
  [string]$InstancePidPath,
  [string]$CallbackUrl
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($CallbackUrl)) {
  exit 0
}

$normalizedCallback = $CallbackUrl.Trim()
$callbackDir = Split-Path -Parent $CallbackDropPath
if (-not [string]::IsNullOrWhiteSpace($callbackDir)) {
  New-Item -ItemType Directory -Path $callbackDir -Force | Out-Null
}

Set-Content -LiteralPath $CallbackDropPath -Value $normalizedCallback -Encoding Ascii

$shouldLaunch = $true
if (-not [string]::IsNullOrWhiteSpace($InstancePidPath) -and (Test-Path -LiteralPath $InstancePidPath)) {
  try {
    $pidText = (Get-Content -LiteralPath $InstancePidPath -Raw).Trim()
    if ($pidText -match '^[0-9]+$') {
      Get-Process -Id ([int]$pidText) -ErrorAction Stop | Out-Null
      $shouldLaunch = $false
    }
  } catch {
    $shouldLaunch = $true
  }
}

if (-not $shouldLaunch) {
  exit 0
}

if ([string]::IsNullOrWhiteSpace($LauncherPath) -or -not (Test-Path -LiteralPath $LauncherPath)) {
  exit 0
}

Start-Process -FilePath $LauncherPath -ArgumentList @($normalizedCallback) | Out-Null
