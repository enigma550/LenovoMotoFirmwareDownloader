#!/usr/bin/env bash
set -euo pipefail

if [ ! -f /etc/arch-release ]; then
  exit 0
fi

GET_DEBLOATED_PKGS_URL="${GET_DEBLOATED_PKGS_URL:-https://raw.githubusercontent.com/pkgforge-dev/Anylinux-AppImages/refs/heads/main/useful-tools/get-debloated-pkgs.sh}"

install_get_debloated_pkgs() {
  if command -v get-debloated-pkgs >/dev/null 2>&1; then
    return 0
  fi

  curl -fL "$GET_DEBLOATED_PKGS_URL" -o /usr/local/bin/get-debloated-pkgs
  chmod +x /usr/local/bin/get-debloated-pkgs
}

pacman -Sy --noconfirm --needed \
  alsa-lib \
  atk \
  at-spi2-core \
  bash \
  cairo \
  coreutils \
  cups \
  curl \
  desktop-file-utils \
  file \
  findutils \
  gcc \
  glib-networking \
  gnu-free-fonts \
  grep \
  jack2 \
  libayatana-appindicator \
  libxcomposite \
  libxdamage \
  libxss \
  libxml2-legacy \
  libxkbcommon \
  musl \
  nss \
  pango \
  patchelf \
  python \
  sed \
  squashfs-tools \
  strace \
  tar \
  unzip \
  wget \
  webkit2gtk-4.1 \
  xorg-server-xvfb \
  xz \
  zstd \
  zsync

install_get_debloated_pkgs
get-debloated-pkgs --add-common --prefer-nano ffmpeg-mini
