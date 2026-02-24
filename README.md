# Lenovo Moto Firmware Downloader

Desktop app for Motorola/Lenovo firmware lookup via LMSA, built with Bun + Electrobun + Angular.
You can download prebuilt binaries from the GitHub Releases page: [Releases](https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases)

## Why this app?

Lenovo and Motorola only provide their official Software Fix (LMSA) software for Windows, leaving users on Linux and macOS without a way to download firmware or perform rescue operations on their devices. This app was created to fill that gap - giving users on any operating system the same access to Lenovo/Motorola firmware downloads and device rescue functionality that was previously exclusive to Windows.

## ⚠️ Disclaimer

The Rescue Lite (experimental) feature in this app performs firmware flashing operations on your device. Use it entirely at your own risk. The author of this application is not responsible for any damage, data loss, bricked devices, or other issues that may result from using this software. Always ensure you have selected the correct firmware for your specific device model before proceeding.

## Usage

1. Download and install the app from [Releases](https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases).
2. Click **Sign in** - your browser will open the Lenovo login page.
3. After signing in, paste the resulting URL back into the app.
4. Search for your device model to browse available firmware.
5. Download firmware packages directly to your computer.

Rescue Lite *(Optional)* (Not fully functional):
- Use **Rescue Lite** *(experimental)* to flash firmware onto a device in fastboot mode.
- Use **Rescue Lite (Dry run)** *(experimental)* to see flashboot commands used for Rescue Lite without execution.

All data is stored locally on your machine - nothing is sent to any third-party server.

---

## Development

### Install
```bash
bun install
cd web && bun install
```

### Run (dev)
```bash
bun run start
```

For clean dev data reset before start:
```bash
bun run start:clean
```

### Scripts
| Command | Description |
|---|---|
| `bun run start` | Primary development launch script |
| `bun run start:clean` | Reset dev data and start |
| `bun run start:native` | Start with Linux native GTK/WebKit renderer |
| `bun run start:cef` | Start with Linux CEF renderer |
| `bun run web:build` | Build the Angular frontend |
| `bun run prepare:all` | Build Angular and sync views to Electrobun |
| `bun run dev:data:reset` | Reset local config/models data |
| `bun run build:stable` | Full production build for the current platform |
| `bun run build:canary` | Canary build for the current platform |
| `bun run build:dev` | Development build for the current platform |
| `bun run check` | Type-check the codebase |

### Build Hooks
- `scripts/finalize-app.ts` - Patches app icons and Linux manifests (postBuild).
- `scripts/finalize-installer.ts` - Patches the Windows Setup icon (postPackage).

### Storage Paths
- Dev from repo: `./assets/data/config.json` and `./assets/data/models-catalog.json`
- Packaged app: OS app-data folder (`<appData>/<identifier>/<channel>/assets/data/`)

### Cross-Platform Builds (macOS + Windows + Linux)
Electrobun builds for the current host platform.  
So macOS builds must run on macOS, and Windows builds must run on Windows.

This repo includes a GitHub Actions matrix workflow:
- `.github/workflows/electrobun-build-matrix.yml`

Run it from **Actions → Build Matrix → Run workflow** and choose:
- `dev`
- `canary`
- `stable`

The workflow builds for:
- **macOS**: ARM64 (`macos-latest`), x64 (`macos-15-intel`)
- **Linux**: x64 (`ubuntu-latest`), ARM64 (`ubuntu-24.04-arm`)
- **Windows**: x64 (`windows-latest`)

Build artifacts are uploaded to `artifacts/`.
