#!/usr/bin/env bash
# Instala as dependências de sistema para rodar o app a partir do código-fonte.
# Suporta Ubuntu / Zorin / Debian / Linux Mint (apt) e Arch / Manjaro / CachyOS (pacman).
# Uso: ./install-linux-deps.sh [--yes]   (--yes não pergunta antes de instalar o Bun)
set -euo pipefail

ASSUME_YES=0
[ "${1:-}" = "--yes" ] && ASSUME_YES=1

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf 'AVISO: %s\n' "$*" >&2; }
fail() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Linux" ] || fail "este script é só para Linux."

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || fail "precisa de root ou do sudo instalado."
  SUDO="sudo"
fi

ID_LIKE_ALL=""
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  ID_LIKE_ALL="${ID:-} ${ID_LIKE:-}"
fi

# Instala o primeiro nome de pacote que existir no repositório (nomes mudam entre
# versões, ex.: libasound2 -> libasound2t64 no Ubuntu 24.04+).
apt_install_any() {
  local pkg
  for pkg in "$@"; do
    if apt-cache show "$pkg" >/dev/null 2>&1; then
      if $SUDO apt-get install -y "$pkg"; then
        return 0
      fi
    fi
  done
  warn "nenhum destes pacotes pôde ser instalado: $*"
  return 0
}

install_apt() {
  log "Distribuição baseada em Debian/Ubuntu detectada (${PRETTY_NAME:-apt})."
  $SUDO apt-get update
  # Ferramentas de build e utilitários usados pelos scripts de preparação.
  for pkg in git curl unzip xz-utils ca-certificates build-essential pkg-config python3 file; do
    apt_install_any "$pkg"
  done
  # Acesso USB e elevação de permissão (instalação das regras udev via pkexec).
  apt_install_any libusb-1.0-0 libusb-1.0-0-dev
  apt_install_any polkitd pkexec policykit-1
  # Container usado para compilar o addon USB (podman ou docker; um dos dois basta).
  if ! command -v podman >/dev/null 2>&1 && ! command -v docker >/dev/null 2>&1; then
    apt_install_any podman
  fi
  # Bibliotecas de execução do navegador embutido (CEF/Chromium) e GTK.
  apt_install_any libnss3
  apt_install_any libgtk-3-0t64 libgtk-3-0
  apt_install_any libasound2t64 libasound2
  apt_install_any libatk1.0-0t64 libatk1.0-0
  apt_install_any libatk-bridge2.0-0t64 libatk-bridge2.0-0
  apt_install_any libcups2t64 libcups2
  apt_install_any libgbm1
  apt_install_any libxss1
  apt_install_any libxcomposite1
  apt_install_any libxdamage1
  apt_install_any libxrandr2
  apt_install_any libxkbcommon0
  apt_install_any libayatana-appindicator3-1 libappindicator3-1
  # Renderizador nativo opcional (LE_MOTO_RENDERER_LINUX=native).
  apt_install_any libwebkit2gtk-4.1-0 libwebkit2gtk-4.0-37
  apt_install_any fonts-liberation
}

install_pacman() {
  log "Arch Linux (ou derivada) detectada."
  $SUDO pacman -Sy --noconfirm --needed \
    git curl unzip xz base-devel pkgconf python file libusb polkit podman \
    nss gtk3 alsa-lib atk at-spi2-core cups libxss libxcomposite libxdamage \
    libxrandr libxkbcommon libayatana-appindicator webkit2gtk-4.1 gnu-free-fonts
}

case " $ID_LIKE_ALL " in
  *" debian "*|*" ubuntu "*|*" zorin "*|*" linuxmint "*) install_apt ;;
  *" arch "*|*" archlinux "*|*" cachyos "*|*" manjaro "*)  install_pacman ;;
  *) fail "distribuição não reconhecida (${ID_LIKE_ALL:-desconhecida}). Instale manualmente: git, curl, unzip, toolchain C/C++, libusb, polkit, podman/docker e as bibliotecas do Chromium/GTK." ;;
esac

if command -v bun >/dev/null 2>&1; then
  log "Bun já instalado: $(bun --version)"
else
  answer="n"
  if [ "$ASSUME_YES" -eq 1 ]; then
    answer="y"
  elif [ -t 0 ]; then
    read -r -p "Bun não encontrado. Instalar agora via https://bun.sh/install ? [y/N] " answer
  fi
  if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    curl -fsSL https://bun.sh/install | bash
    log 'Bun instalado em ~/.bun. Abra um novo terminal (ou rode: export PATH="$HOME/.bun/bin:$PATH").'
  else
    warn "Bun não instalado. Instale em https://bun.sh antes de rodar 'bun install'."
  fi
fi

log "Dependências instaladas. Próximos passos:"
echo "  bun install --frozen-lockfile"
echo "  (cd web && bun install --frozen-lockfile)"
echo "  bun run start"
echo "No app, use o botão de permissões USB (regras udev) uma vez e reconecte o aparelho."
