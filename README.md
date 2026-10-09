# Lenovo Moto Firmware Downloader

Desktop app for Motorola/Lenovo firmware lookup via LMSA, built with Bun + Electrobun + Angular. Features flashing abilities, backup & restore of snapshots.
You can download prebuilt binaries from the GitHub Releases page: [Releases](https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases)

## Why this app?

Lenovo and Motorola only provide their official Software Fix (LMSA) software for Windows, leaving users on Linux and macOS without a way to download firmware or perform rescue operations on their devices. This app was created to fill that gap - giving users on any operating system the same access to Lenovo/Motorola firmware downloads and device rescue functionality that was previously exclusive to Windows.

## ⚠️ Disclaimer

The Rescue Lite (experimental) feature in this app performs firmware flashing operations on your device. Use it entirely at your own risk. The author of this application is not responsible for any damage, data loss, bricked devices, or other issues that may result from using this software. Always ensure you have selected the correct firmware for your specific device model before proceeding.

## Usage

1. Download and install the app from [Releases](https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases).
  1.1 On Windows: Click on "Switch to LMFD" 
4. Click **Sign in** - your browser will open the Lenovo login page.
5. After signing in, click on "Open in Lenovo Moto Firmware Downloader".
6. Search for your device model to browse available firmware.
7. Download firmware packages directly to your computer.

Rescue Lite *(Optional)* (Not fully functional):
- Use **Rescue Lite** *(experimental)* to flash firmware onto a device.
- Use **Rescue Lite (Dry run)** *(experimental)* to see flash commands used for Rescue Lite without execution.
- QDL/EDL rescue mode uses bundled `qdl` in official builds. Local/dev runs can still use `qdl` from `PATH`.
- Unisoc/SPD rescue mode uses bundled `spd-bun-tool` in official builds.
- MediaTek rescue mode is not supported yet.

All data is stored locally on your machine - nothing is sent to any third-party server.

---

## Instalação via código-fonte no Linux (Ubuntu, Zorin, Debian, Arch)

Funciona em distribuições baseadas em Debian/Ubuntu (Ubuntu, Zorin OS, Linux Mint) e em Arch.

```bash
git clone https://github.com/darkmorellato/LenovoMotoFirmwareDownloader.git
cd LenovoMotoFirmwareDownloader
./install-linux-deps.sh        # instala dependências de sistema (pede sudo); --yes instala o Bun sem perguntar
bun install --frozen-lockfile
(cd web && bun install --frozen-lockfile)
bun run start
```

- O script detecta `apt` ou `pacman`, instala ferramentas de build, libusb, polkit (`pkexec`),
  `podman` (se nem `podman` nem `docker` existirem — usado para compilar o addon USB) e as
  bibliotecas do navegador embutido (CEF/GTK). Pacotes com nomes diferentes entre versões
  (ex.: `libasound2` / `libasound2t64`) são resolvidos automaticamente.
- **Permissões USB:** use o botão de regras udev do app uma vez (pede senha via `pkexec`) e
  reconecte o aparelho. As regras também dizem ao **ModemManager** (ativo por padrão no
  Ubuntu/Zorin) para ignorar os aparelhos, evitando que ele ocupe as portas durante o flash.
  Instalações antigas das regras serão detectadas como desatualizadas e podem ser reinstaladas.
- Com o aparelho em modo Fastboot, "Consultar Atualização" lê IMEI/serial via Fastboot (sem ADB).

---

## Atualização (instalações via código-fonte) / Updating (source installs)

Máquinas que **já clonaram o repositório** podem se atualizar de três formas — nenhuma delas sobrescreve trabalho local sem aviso:

### 1. Botão "Atualizar" no aplicativo (recomendado)

Clique em **🔄 Atualizar** no cabeçalho do app. Ele:

1. Valida suas credenciais git para o repositório remoto (avisa se faltar acesso);
2. Mostra os commits recebidos e o estado local **antes** de alterar qualquer coisa;
3. Sincroniza apenas via *fast-forward* — nunca sobrescreve seu histórico local;
4. Se houver alterações locais, oferece **backup seguro** (`git stash`) — nada é perdido;
5. Reinstala as dependências (raiz e `web/`) e recompila a interface;
6. Registra cada operação em `assets/data/logs/update-*.log` (botão "Ver log").

Ao final, **reinicie o app** para usar a nova versão.

### 2. Script de linha de comando

```bash
./update.sh            # atualiza (aborta com segurança se houver mudanças locais)
./update.sh --backup   # faz stash das mudanças locais e atualiza
```

### 3. Manualmente

```bash
git fetch origin
git log HEAD..origin/main --oneline    # veja o que vem por aí
git merge --ff-only origin/main        # atualiza apenas se for fast-forward
bun install --frozen-lockfile
(cd web && bun install --frozen-lockfile)
bun run web:build
bun run tooling/build/sync-frontend.ts
```

Depois inicie com `bun run start`.

**Notas**

- Se o `git merge --ff-only` falhar, seu branch **divergiu** do remoto — resolva manualmente
  (`git rebase origin/main` ou merge). Nada é sobrescrito automaticamente.
- Alterações locais podem ser preservadas com `./update.sh --backup` e restauradas
  depois com `git stash pop`.
- Apps instalados por **Release** (AppImage/Setup) não usam git: atualizam pelo
  mesmo botão "Atualizar", via canal de releases do GitHub.

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
- `tooling/build/finalize-app.ts` - postBuild hook that packages bundled runtime dependencies and applies platform-specific app metadata/assets for Linux, Windows, and macOS.
- `tooling/build/finalize-installer.ts` - postPackage hook that builds Linux AppImage artifacts and patches/repackages the Windows Setup installer.

### Storage Paths
- Dev from repo: `./assets/data/config.json` and `./assets/data/models-catalog.json`
- Packaged app: OS app-data folder (`<appData>/<identifier>/<channel>/assets/data/`)

### Cross-Platform Builds (macOS + Windows + Linux)
Electrobun builds for the current host platform.  
So macOS builds must run on macOS, and Windows builds must run on Windows.

This repo includes a GitHub Actions matrix workflow:
- `.github/workflows/lmfd-build-matrix.yml`

Run it from **Actions → Build Matrix → Run workflow** and choose:
- `dev`
- `canary`
- `stable`

The workflow builds for:
- **macOS**: ARM64 (`macos-latest`), x64 (`macos-15-intel`)
- **Linux**: x64 (`ubuntu-latest`), ARM64 (`ubuntu-24.04-arm`)
- **Windows**: x64 (`windows-latest`)

Build artifacts are uploaded to `artifacts/`.
