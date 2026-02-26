param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [Parameter(Mandatory = $true)]
  [string]$WorkDir,

  [ValidateSet('x64', 'arm64')]
  [string]$TargetArch = 'x64',

  [string]$SourceRef = 'v1.5.1'
)

$ErrorActionPreference = 'Stop'

$resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$resolvedWorkDir = [System.IO.Path]::GetFullPath($WorkDir)
$outputDir = Split-Path -Parent $resolvedOutputPath

New-Item -ItemType Directory -Path $resolvedWorkDir -Force | Out-Null
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

Write-Host "[WDI] Host work directory: $resolvedWorkDir"
Write-Host "[WDI] Host output path: $resolvedOutputPath"
Write-Host "[WDI] Target Architecture: $TargetArch"

# 1. Find MSBuild (Allerede installeret via GitHub Actions windows-latest)
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vsWhere)) {
    throw "[WDI] vswhere.exe not found. Visual Studio is required."
}

$msBuildPath = & $vsWhere -latest -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe | Select-Object -First 1
if (-not $msBuildPath -or -not (Test-Path $msBuildPath)) {
    throw "[WDI] MSBuild.exe not found."
}
Write-Host "[WDI] Using MSBuild: $msBuildPath"

# 2. Klon libwdi
$libwdiDir = Join-Path $resolvedWorkDir "libwdi"
if (Test-Path $libwdiDir) { Remove-Item $libwdiDir -Recurse -Force }

Write-Host "[WDI] Cloning libwdi ($SourceRef)..."
& git clone --depth 1 --branch $SourceRef https://github.com/pbatard/libwdi.git $libwdiDir
if ($LASTEXITCODE -ne 0) { throw "[WDI] Git clone failed" }

# 3. Download og udpak WDK
$wdkDir = Join-Path $resolvedWorkDir "wdk"
$wdkMsi = Join-Path $resolvedWorkDir "wdk-redist.msi"
if (Test-Path $wdkDir) { Remove-Item $wdkDir -Recurse -Force }
New-Item -ItemType Directory -Path $wdkDir -Force | Out-Null

Write-Host "[WDI] Downloading WDK redistributable..."
Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkID=253170" -OutFile $wdkMsi

Write-Host "[WDI] Extracting WDK..."
$msiProcess = Start-Process msiexec.exe -ArgumentList "/a `"$wdkMsi`" /qn /norestart TARGETDIR=`"$wdkDir`"" -Wait -PassThru
if ($msiProcess.ExitCode -ne 0) { throw "[WDI] msiexec failed to extract WDK" }

# 4. Find WDK udpakningsmappen
$wdk8Dir = $null
$candidates = @(
    (Join-Path $wdkDir "Windows Kits\8.0"),
    (Join-Path $wdkDir "Program Files\Windows Kits\8.0"),
    (Join-Path $wdkDir "Program Files (x86)\Windows Kits\8.0")
)
foreach ($c in $candidates) {
    if (Test-Path $c) { $wdk8Dir = $c; break }
}
if (-not $wdk8Dir) { throw "[WDI] Could not locate extracted WDK 8.0 directory." }

# 5. Klargør WDF/WinUSB-filer til MSBuild (Både x64 og x86 kræves af Solution-filen)
$x64Wdf = Join-Path $wdk8Dir "redist\wdf\x64"
$x86Wdf = Join-Path $wdk8Dir "redist\wdf\x86"
$amd64Wdf = Join-Path $wdk8Dir "redist\wdf\amd64"

if (-not (Test-Path $x64Wdf) -and (Test-Path $amd64Wdf)) { Rename-Item -Path $amd64Wdf -NewName "x64" }
elseif (-not (Test-Path $x64Wdf)) { New-Item -ItemType Directory -Path $x64Wdf -Force | Out-Null }

if (-not (Test-Path $x86Wdf)) { New-Item -ItemType Directory -Path $x86Wdf -Force | Out-Null }

# 5a. Hent x64 WinUSBCoInstaller
$winusbTargetX64 = Join-Path $x64Wdf "winusbcoinstaller2.dll"
if (-not (Test-Path $winusbTargetX64)) {
    $source = Get-ChildItem "$env:WINDIR\System32\DriverStore\FileRepository\*\WinUSBCoInstaller2.dll" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if (-not $source) { $source = "$env:WINDIR\System32\WinUSBCoInstaller2.dll" }
    if (Test-Path $source) { Copy-Item $source -Destination $winusbTargetX64 -Force }
}

# 5b. Hent x86 WinUSBCoInstaller
$winusbTargetX86 = Join-Path $x86Wdf "winusbcoinstaller2.dll"
if (-not (Test-Path $winusbTargetX86)) {
    $sourceX86 = Get-ChildItem "$env:WINDIR\SysWOW64\DriverStore\FileRepository\*\WinUSBCoInstaller2.dll" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if (-not $sourceX86) { $sourceX86 = "$env:WINDIR\SysWOW64\WinUSBCoInstaller2.dll" }
    if (Test-Path $sourceX86) { Copy-Item $sourceX86 -Destination $winusbTargetX86 -Force }
}

# 6. Forbered ARM64 pladsholdere
if ($TargetArch -eq 'arm64') {
    $arm64Wdf = Join-Path $wdk8Dir "redist\wdf\arm64"
    New-Item -ItemType Directory -Path $arm64Wdf -Force | Out-Null
    Copy-Item "$x64Wdf\*" -Destination $arm64Wdf -Force -Recurse
}

# 7. Generer msvc/config.h (HER ER FEJLEN RETTET!)
$escapedWdkDir = $wdk8Dir -replace '\\', '\\'
$configHContent = @"
#pragma once
#define WDK_DIR "$escapedWdkDir"
#define WDF_VER 1011
#define COINSTALLER_DIR "wdf"
#define X64_DIR "x64"
#define ENABLE_LOGGING 1
#define OPT_M32
#define OPT_M64
#define OPT_ARM
"@
$configHPath = Join-Path $libwdiDir "msvc\config.h"
Set-Content -Path $configHPath -Value $configHContent -Encoding Ascii
Write-Host "[WDI] Generated msvc\config.h successfully."

# 8. Byg via Solution-filen (sln) for at respektere intern 32/64 bit projekt-mapping
$platform = if ($TargetArch -eq 'x64') { 'x64' } else { 'ARM64' }
$slnPath = Join-Path $libwdiDir "libwdi.sln"

Push-Location $libwdiDir
Write-Host "[WDI] Starting MSBuild for Platform=$platform..."
$msBuildArgs = @(
    $slnPath,
    "/m",
    "/p:Configuration=Release",
    "/p:Platform=$platform"
)
& $msBuildPath $msBuildArgs
$msBuildExit = $LASTEXITCODE
Pop-Location

if ($msBuildExit -ne 0) { throw "[WDI] MSBuild failed with exit code $msBuildExit" }

# 9. Find og kopier det færdige resultat
$compiledExe = Join-Path $libwdiDir "$platform\Release\examples\wdi-simple.exe"
if (-not (Test-Path $compiledExe)) {
    # Fallback søgning, hvis stien varierer en smule
    $compiledExe = Get-ChildItem -Path $libwdiDir -Filter "wdi-simple.exe" -Recurse |
                   Where-Object { $_.FullName -match "\\Release\\" -and $_.FullName -match "\\$platform\\" } |
                   Select-Object -First 1 -ExpandProperty FullName
}

if (-not $compiledExe -or -not (Test-Path $compiledExe)) {
    throw "[WDI] wdi-simple.exe not found after successful build."
}

Copy-Item $compiledExe -Destination $resolvedOutputPath -Force
Write-Host "[WDI] Successfully built and copied native executable to $resolvedOutputPath"
