@ECHO OFF
cd /d "%~dp0"
for /f "tokens=4-6 delims=. " %%i in ('ver') do set VERSION=%%i.%%j
echo Windows version: %VERSION%

if "%VERSION%"=="10.0" (
    echo Detected Windows 10/11. Installing QDLoader drivers...
    pnputil /add-driver "Windows10\*.inf" /install
    exit /b %ERRORLEVEL%
)

echo Unsupported Windows version. This installer supports Windows 10 and Windows 11 only.
exit /b 1
