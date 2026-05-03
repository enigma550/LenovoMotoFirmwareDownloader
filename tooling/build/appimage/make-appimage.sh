#!/usr/bin/env bash
set -Eeuo pipefail

on_error() {
  local exit_code=$?
  echo "AppImage build: failed at line ${BASH_LINENO[0]:-$LINENO}: $BASH_COMMAND" >&2
  exit "$exit_code"
}

trap on_error ERR

run_step() {
  local label="$1"
  shift

  echo "AppImage build: $label..."
  "$@"
}

APPDIR="${APPDIR:?APPDIR is required}"
OUTPATH="${OUTPATH:?OUTPATH is required}"
OUTNAME="${OUTNAME:?OUTNAME is required}"
ARCH="${ARCH:?ARCH is required}"
MAIN_BIN="${MAIN_BIN:-launcher}"
DESKTOP_NAME="${DESKTOP_NAME:-Lenovo Moto Firmware Downloader}"
APP_IDENTIFIER="${APP_IDENTIFIER:-com.github.enigma550.lenovomotofirmwaredownloader}"
WM_CLASS="${WM_CLASS:-LenovoMotoFirmwareDown}"
VERSION="${VERSION:-0.0.0}"

QUICK_SHARUN_URL="${QUICK_SHARUN_URL:-https://raw.githubusercontent.com/pkgforge-dev/Anylinux-AppImages/refs/heads/main/useful-tools/quick-sharun.sh}"
ANDROID_UDEV_RULES_URL="${ANDROID_UDEV_RULES_URL:-https://raw.githubusercontent.com/M0Rf30/android-udev-rules/refs/heads/main/51-android.rules}"
CONTAINER_IMAGE="${CONTAINER_IMAGE:-ghcr.io/pkgforge-dev/archlinux:latest}"
CONDA_CHANNEL_BASE="${CONDA_CHANNEL_BASE:-https://conda.anaconda.org/conda-forge}"
DWARFS_COMP="${DWARFS_COMP:-zstd:level=22 -S24 -B4}"

BUILD_TMPDIR="${LMFD_APPIMAGE_TMPDIR:-${TMPDIR:-/tmp}/lmfd-anylinux-$ARCH}"
QUICK_SHARUN_BIN="$BUILD_TMPDIR/quick-sharun"
EXEC_WRAPPER_BIN="$BUILD_TMPDIR/lmfd-execpath-shim"

inside_arch() {
  [ -f /etc/arch-release ] 2>/dev/null
}

run_in_arch_container() {
  if ! command -v podman >/dev/null 2>&1; then
    echo "AppImage build: podman is required when building AnyLinux outside Arch Linux." >&2
    exit 1
  fi

  if ! podman image exists "$CONTAINER_IMAGE" >/dev/null 2>&1; then
    podman pull "$CONTAINER_IMAGE"
  fi

  exec podman run --rm \
    --pull=never \
    -e APPDIR \
    -e OUTPATH \
    -e OUTNAME \
    -e ARCH \
    -e MAIN_BIN \
    -e DESKTOP_NAME \
    -e APP_IDENTIFIER \
    -e WM_CLASS \
    -e VERSION \
    -e UPINFO \
    -e DWARFS_COMP \
    -e QUICK_SHARUN_URL \
    -e ANDROID_UDEV_RULES_URL \
    -e CONDA_CHANNEL_BASE \
    -e LMFD_APPIMAGE_IN_PODMAN=1 \
    -v "$PWD:$PWD:Z" \
    -w "$PWD" \
    "$CONTAINER_IMAGE" \
    bash -lc 'tooling/build/appimage/get-dependencies.sh && tooling/build/appimage/make-appimage.sh'
}

if ! inside_arch && [ "${LMFD_APPIMAGE_IN_PODMAN:-0}" != "1" ]; then
  run_in_arch_container
fi

mkdir -p "$APPDIR" "$OUTPATH" "$BUILD_TMPDIR"

PYTHON_BIN="$(command -v python3 || command -v python || true)"
if [ -z "$PYTHON_BIN" ]; then
  echo "AppImage build: python3 or python is required." >&2
  exit 1
fi

download_executable() {
  local url="$1"
  local target="$2"

  if [ -x "$target" ]; then
    return
  fi

  curl -fL "$url" -o "$target"
  chmod +x "$target"
}

patch_quick_sharun_safe_scan() {
  "$PYTHON_BIN" - "$QUICK_SHARUN_BIN" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
marker = "# LMFD quick-sharun safe scan patch"
if marker in text:
    raise SystemExit(0)

old = """# patch away any hardcoded path to /usr/share or /usr/lib in bins...\nset -- \"$APPDIR\"/shared/bin/*\nfor bin do\n\tif p=$(grep -ao -m 1 '/usr/share/.*/' \"$bin\"); then\n\t\t_echo \"* Detected hardcoded path to $p in $bin\"\n\t\t_patch_away_usr_share_dir \"$bin\" || :\n\tfi\n\tif p=$(grep -ao -m 1 '/usr/lib/.*/' \"$bin\"); then\n\t\t_echo \"* Detected hardcoded path to $p in $bin\"\n\t\t_patch_away_usr_lib_dir \"$bin\" || :\n\tfi\ndone\n"""

new = """# LMFD quick-sharun safe scan patch\n# patch away any hardcoded path to /usr/share or /usr/lib in bins...\nset -- \"$APPDIR\"/shared/bin/*\nfor bin do\n\tif [ -d \"$bin\" ]; then\n\t\tcontinue\n\tfi\n\tif p=$(grep -ao -m 1 '/usr/share/[^[:space:]]\\{1,256\\}/' \"$bin\" 2>/dev/null | tr -d '\\000' | head -n 1); then\n\t\t_echo \"* Detected hardcoded path to $p in $bin\"\n\t\t_patch_away_usr_share_dir \"$bin\" || :\n\tfi\n\tif p=$(grep -ao -m 1 '/usr/lib/[^[:space:]]\\{1,256\\}/' \"$bin\" 2>/dev/null | tr -d '\\000' | head -n 1); then\n\t\t_echo \"* Detected hardcoded path to $p in $bin\"\n\t\t_patch_away_usr_lib_dir \"$bin\" || :\n\tfi\ndone\n"""

if old not in text:
    raise SystemExit("Could not find quick-sharun hardcoded-path scan block to patch")

path.write_text(text.replace(old, new, 1))
PY
}

prepare_quick_sharun() {
  download_executable "$QUICK_SHARUN_URL" "$QUICK_SHARUN_BIN"
  patch_quick_sharun_safe_scan
}

write_desktop_metadata() {
  local icon_source=""
  local desktop_path="$APPDIR/$APP_IDENTIFIER.desktop"

  for candidate in \
    "$APPDIR/$APP_IDENTIFIER.png" \
    "$APPDIR/.DirIcon" \
    "$APPDIR/Resources/appIcon.png" \
    "$APPDIR/Resources/app/icon.png"
  do
    if [ -f "$candidate" ]; then
      icon_source="$candidate"
      break
    fi
  done

  if [ -z "$icon_source" ]; then
    echo "AppImage build: could not find an application icon inside $APPDIR" >&2
    exit 1
  fi

  mkdir -p "$APPDIR/usr/share/icons/hicolor/256x256/apps"
  cp -f "$icon_source" "$APPDIR/.DirIcon"
  cp -f "$icon_source" "$APPDIR/$APP_IDENTIFIER.png"
  cp -f "$icon_source" "$APPDIR/usr/share/icons/hicolor/256x256/apps/$APP_IDENTIFIER.png"

  find "$APPDIR" -maxdepth 1 -type f -name '*.desktop' ! -name "$(basename "$desktop_path")" -delete
  cat >"$desktop_path" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=$DESKTOP_NAME
Comment=$DESKTOP_NAME application
Exec=$MAIN_BIN
Icon=$APP_IDENTIFIER
Terminal=false
StartupWMClass=$WM_CLASS
Categories=Utility;Application;
X-AppImage-Version=$VERSION
EOF
}

strip_packaged_binaries() {
  local candidate

  for candidate in \
    "$APPDIR/bin/libNativeWrapper.so" \
    "$APPDIR/bin/libasar.so" \
    "$APPDIR/Resources/app/tools/qdl/linux-x64/qdl" \
    "$APPDIR/Resources/app/tools/qdl/linux-arm64/qdl"
  do
    if [ -f "$candidate" ]; then
      strip --strip-unneeded "$candidate" || true
    fi
  done
}

deploy_with_quick_sharun() {
  local executables=()
  local candidate

  for candidate in "$APPDIR/bin/launcher" "$APPDIR/bin/bun"; do
    if [ -f "$candidate" ]; then
      executables+=("$candidate")
    fi
  done

  if [ "${#executables[@]}" -eq 0 ]; then
    echo "AppImage build: no launcher executables found under $APPDIR/bin" >&2
    exit 1
  fi

  export APPDIR OUTPATH OUTNAME ARCH DWARFS_COMP
  export ANYLINUX_LIB=1
  export DEPLOY_GDK=1
  export DEPLOY_GLIB_NETWORKING=1
  export DEPLOY_GTK=1
  export DEPLOY_OPENGL="${DEPLOY_OPENGL:-1}"
  export DEPLOY_PIPEWIRE="${DEPLOY_PIPEWIRE:-0}"
  export DEPLOY_VULKAN="${DEPLOY_VULKAN:-0}"
  export DEPLOY_WEBKIT2GTK=1
  export DEPLOY_GSTREAMER=0
  export DEPLOY_GLYCIN=0
  export DEPLOY_P11KIT=0

  case ":${ADD_HOOKS:-}:" in
    *:udev-installer.hook:*) ;;
    *) export ADD_HOOKS="${ADD_HOOKS:+$ADD_HOOKS:}udev-installer.hook" ;;
  esac

  echo "AppImage build: deploying runtime with quick-sharun..."
  "$QUICK_SHARUN_BIN" "${executables[@]}"
}

install_android_udev_rules() {
  local rules_dir="$APPDIR/etc/udev/rules.d"
  local upstream_rules_path="$rules_dir/51-android.rules"
  local lmfd_rules_path="$rules_dir/99-lmfd-android.rules"

  mkdir -p "$rules_dir"
  curl -fL "$ANDROID_UDEV_RULES_URL" -o "$upstream_rules_path"

  cat >"$lmfd_rules_path" <<'EOF'
# LMFD Android USB permissions. Keep this later than generic MTP/media rules.
ACTION!="add", ACTION!="bind", ACTION!="change", GOTO="lmfd_android_end"
SUBSYSTEM!="usb", GOTO="lmfd_android_end"

ENV{DEVTYPE}=="usb_device", ATTR{idVendor}=="22d9", MODE:="0666", GROUP:="adbusers", TAG+="uaccess", SYMLINK+="android", SYMLINK+="android%n"
ENV{DEVTYPE}=="usb_device", ENV{ID_USB_INTERFACES}=="*:ff4201:*", MODE:="0666", GROUP:="adbusers", TAG+="uaccess", SYMLINK+="android", SYMLINK+="android%n"
ENV{DEVTYPE}=="usb_device", ENV{ID_USB_INTERFACES}=="*:ff4203:*", MODE:="0666", GROUP:="adbusers", TAG+="uaccess", SYMLINK+="android_fastboot"

# Older udev stacks do not always expose DEVTYPE during later override passes.
ATTR{idVendor}=="22d9", MODE:="0666", GROUP:="adbusers", TAG+="uaccess", SYMLINK+="android", SYMLINK+="android%n"
ENV{ID_USB_INTERFACES}=="*:ff4201:*", MODE:="0666", GROUP:="adbusers", TAG+="uaccess", SYMLINK+="android", SYMLINK+="android%n"
ENV{ID_USB_INTERFACES}=="*:ff4203:*", MODE:="0666", GROUP:="adbusers", TAG+="uaccess", SYMLINK+="android_fastboot"

LABEL="lmfd_android_end"
EOF
}

patch_apprun_sudo_prompt() {
  local apprun_lib="$APPDIR/AppRun.lib"

  if [ ! -f "$apprun_lib" ]; then
    return 0
  fi

  "$PYTHON_BIN" - "$apprun_lib" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

old = """run_gui_sudo() {\n        if   [ \"$(id -u)\" = 0 ];               then _sudocmd=\"\"\n        elif _sudocmd=$(command -v pkexec);    then :\n        elif _sudocmd=$(command -v lxqt-sudo); then :\n        elif _sudocmd=$(command -v run0);      then set -- --via-shell \"$@\"\n        fi\n"""
new = """run_gui_sudo() {\n        if   [ \"$(id -u)\" = 0 ];               then _sudocmd=\"\"\n        elif _sudocmd=$(command -v pkexec);    then :\n        elif _sudocmd=$(command -v lxqt-sudo); then :\n        elif _sudocmd=$(command -v run0);      then set -- --via-shell \"$@\"\n        elif _sudocmd=$(command -v sudo);      then :\n        fi\n"""
if old in text:
    text = text.replace(old, new, 1)

text = text.replace(
    "We need 'pkexec' or 'lxqt-sudo' or 'run0' to perform this operation",
    "We need 'pkexec' or 'lxqt-sudo' or 'run0' or 'sudo' to perform this operation",
)

old_prompt = """        # normal terminals\n"""
new_prompt = """        if [ -t 0 ] && [ -t 1 ]; then\n                if [ \"$_notification\" = 1 ]; then\n                        printf '%s\\n' \"$_message\" >&2\n                        return 0\n                fi\n                printf '%s\\n\\n%s' \"$_message\" '   (Yes/No)?: ' >&2\n                while :; do\n                        read yn || return 1\n                        case $yn in\n                                Y*|y*) return 0 ;;\n                                N*|n*) return 1 ;;\n                                *)     printf '%s\\n' 'Please type Yes or No' >&2 ;;\n                        esac\n                done\n        fi\n\n        # normal terminals\n"""
if old_prompt in text and new_prompt not in text:
    text = text.replace(old_prompt, new_prompt, 1)

path.write_text(text)
PY
}

patch_udev_installer_hook() {
  local hook_path="$APPDIR/bin/udev-installer.hook"

  if [ ! -f "$hook_path" ]; then
    echo "AppImage build: warning: quick-sharun did not generate udev-installer.hook." >&2
    return 0
  fi

  "$PYTHON_BIN" - "$hook_path" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

old_install = """\trun_gui_sudo /bin/sh -c \"\n\t  mkdir -p /usr/local/lib/udev/rules.d\n\t  cp -v '$_tmp_udev_dir'/* /usr/local/lib/udev/rules.d\n\t  command -v udevadm && udevadm control --reload-rules\n\t\"\n\tnotify \"udev rules successfully installed!\"\n"""
new_install = """\trun_gui_sudo /bin/sh -c \"\n\t  mkdir -p /etc/udev/rules.d\n\t  cp -v '$_tmp_udev_dir'/* /etc/udev/rules.d\n\t  groupadd -f adbusers || :\n\t  usermod -a -G adbusers $(logname 2>/dev/null || id -un) || :\n\t  command -v udevadm >/dev/null 2>&1 && udevadm control --reload-rules || :\n\t  command -v udevadm >/dev/null 2>&1 && udevadm trigger --subsystem-match=usb --action=add || :\n\t  command -v udevadm >/dev/null 2>&1 && udevadm settle || :\n\t\"\n\tnotify \"udev rules installed in /etc/udev/rules.d. Replug the Android device. On older systems you may need to log out and back in before USB access works.\"\n"""
if old_install in text:
    text = text.replace(old_install, new_install, 1)

old_check = """\t\tif [ -f /etc/udev/rules.d/\"${f##*/}\" ] \\\n\t\t  || [ -f /usr/lib/udev/rules.d/\"${f##*/}\" ] \\\n\t\t  || [ -f /usr/local/lib/udev/rules.d/\"${f##*/}\" ]; then\n"""
new_check = """\t\tif [ -f /etc/udev/rules.d/\"${f##*/}\" ] \\\n\t\t  || [ -f /lib/udev/rules.d/\"${f##*/}\" ] \\\n\t\t  || [ -f /usr/lib/udev/rules.d/\"${f##*/}\" ]; then\n"""
if old_check in text:
    text = text.replace(old_check, new_check, 1)

old_prompt = """install_udev_rules() {\n\t_udev_installer_check || return 0\n\t_is_rule_already_installed || return 0\n\tif notify --display-question \"$_udev_install_msg\"; then\n"""
new_prompt = """install_udev_rules() {\n\t_udev_installer_check || return 0\n\t_is_rule_already_installed || return 0\n\tif [ ! -t 0 ] || [ ! -t 1 ]; then\n\t\tif ! is_cmd --any kdialog qarma yad zenity gxmessage xmessage; then\n\t\t\treturn 0\n\t\tfi\n\tfi\n\tif notify --display-question \"$_udev_install_msg\"; then\n"""
if old_prompt in text:
    text = text.replace(old_prompt, new_prompt, 1)

path.write_text(text)
PY
}

patch_generated_runtime_scripts() {
  patch_apprun_sudo_prompt
  patch_udev_installer_hook
}

fetch_conda_payload() {
  local conda_subdir="$1"
  local package_name="$2"
  local compat_root="$BUILD_TMPDIR/conda-compat/$ARCH"
  local archive_dir="$compat_root/archive"
  local cache_dir="$compat_root/cache"
  local payload_dir="$compat_root/payload"
  local archive_path="$archive_dir/$package_name"
  local payload_archive="$cache_dir/pkg-${package_name%.conda}.tar.zst"
  local extract_dir="$payload_dir/${package_name%.conda}"

  mkdir -p "$archive_dir" "$cache_dir" "$payload_dir"

  if [ ! -f "$archive_path" ]; then
    curl -fL "$CONDA_CHANNEL_BASE/$conda_subdir/$package_name" -o "$archive_path"
  fi

  if [ ! -f "$payload_archive" ]; then
    "$PYTHON_BIN" - "$archive_path" "$payload_archive" <<'PY'
from pathlib import Path
import sys
import zipfile

archive = Path(sys.argv[1])
payload = Path(sys.argv[2])

with zipfile.ZipFile(archive) as zf:
    for entry in zf.namelist():
        if entry.startswith("pkg-") and entry.endswith(".tar.zst"):
            payload.write_bytes(zf.read(entry))
            break
    else:
        raise SystemExit(f"Could not find payload archive inside {archive}")
PY
  fi

  if [ ! -d "$extract_dir/lib" ]; then
    mkdir -p "$extract_dir"
    zstd -dc "$payload_archive" | tar -xf - -C "$extract_dir"
  fi

  printf '%s\n' "$extract_dir"
}

install_compat_cpp_runtime() {
  local conda_subdir="" libstd_pkg="" libgcc_pkg=""

  case "$ARCH" in
    x86_64)
      conda_subdir="linux-64"
      libstd_pkg="libstdcxx-15.2.0-h934c35e_18.conda"
      libgcc_pkg="libgcc-15.2.0-he0feb66_18.conda"
      ;;
    aarch64)
      conda_subdir="linux-aarch64"
      libstd_pkg="libstdcxx-15.2.0-hef695bb_18.conda"
      libgcc_pkg="libgcc-15.2.0-h8acb6b2_18.conda"
      ;;
    *)
      echo "AppImage build: unsupported ARCH for compat C++ runtime: $ARCH" >&2
      exit 1
      ;;
  esac

  local libstd_dir="" libgcc_dir=""
  libstd_dir="$(fetch_conda_payload "$conda_subdir" "$libstd_pkg")"
  libgcc_dir="$(fetch_conda_payload "$conda_subdir" "$libgcc_pkg")"

  install -m 0644 "$libstd_dir/lib/libstdc++.so.6.0.34" "$APPDIR/lib/libstdc++.so.6.0.34"
  ln -sfn "libstdc++.so.6.0.34" "$APPDIR/lib/libstdc++.so.6"
  ln -sfn "libstdc++.so.6.0.34" "$APPDIR/lib/libstdc++.so"

  install -m 0644 "$libgcc_dir/lib/libgcc_s.so.1" "$APPDIR/lib/libgcc_s.so.1"
  ln -sfn "libgcc_s.so.1" "$APPDIR/lib/libgcc_s.so"

  strip --strip-unneeded "$APPDIR/lib/libstdc++.so.6.0.34" || true
  strip --strip-unneeded "$APPDIR/lib/libgcc_s.so.1" || true
}

ensure_bundled_libudev() {
  local source_path="" resolved_path="" resolved_name=""

  for candidate in \
    /usr/lib64/libudev.so.1 \
    /usr/lib/libudev.so.1 \
    /lib64/libudev.so.1 \
    /lib/libudev.so.1 \
    /usr/lib/x86_64-linux-gnu/libudev.so.1 \
    /lib/x86_64-linux-gnu/libudev.so.1
  do
    if [ -e "$candidate" ]; then
      source_path="$candidate"
      break
    fi
  done

  if [ -z "$source_path" ] && command -v ldconfig >/dev/null 2>&1; then
    source_path="$(ldconfig -p 2>/dev/null | awk '/libudev\.so\.1 / {print $NF; exit}')"
  fi

  if [ -z "$source_path" ]; then
    echo "AppImage build: could not locate libudev.so.1 on the build system" >&2
    exit 1
  fi

  resolved_path="$(readlink -f -- "$source_path")"
  resolved_name="$(basename -- "$resolved_path")"

  install -m 0644 "$resolved_path" "$APPDIR/lib/$resolved_name"
  if [ "$resolved_name" != "libudev.so.1" ]; then
    ln -sfn "$resolved_name" "$APPDIR/lib/libudev.so.1"
  fi
}

ensure_qdl_legacy_libxml2() {
  local source_path="" resolved_path="" resolved_name=""

  for candidate in \
    /usr/lib64/libxml2.so.2 \
    /usr/lib/libxml2.so.2 \
    /lib64/libxml2.so.2 \
    /lib/libxml2.so.2 \
    /usr/lib/x86_64-linux-gnu/libxml2.so.2 \
    /lib/x86_64-linux-gnu/libxml2.so.2
  do
    if [ -e "$candidate" ]; then
      source_path="$candidate"
      break
    fi
  done

  if [ -z "$source_path" ] && command -v ldconfig >/dev/null 2>&1; then
    source_path="$(ldconfig -p 2>/dev/null | awk '/libxml2\.so\.2 / {print $NF; exit}')"
  fi

  if [ -z "$source_path" ]; then
    echo "AppImage build: could not locate libxml2.so.2 for bundled qdl" >&2
    exit 1
  fi

  resolved_path="$(readlink -f -- "$source_path")"
  resolved_name="$(basename -- "$resolved_path")"

  install -m 0644 "$resolved_path" "$APPDIR/lib/$resolved_name"
  ln -sfn "$resolved_name" "$APPDIR/lib/libxml2.so.2"
  strip --strip-unneeded "$APPDIR/lib/$resolved_name" || true
}

collapse_duplicate_libraries() {
  "$PYTHON_BIN" - "$APPDIR/lib" <<'PY'
from pathlib import Path
import hashlib
import os
import sys

libdir = Path(sys.argv[1])

def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

groups = {}
for path in libdir.iterdir():
    if not path.is_file() or path.is_symlink():
        continue
    key = (path.stat().st_size, digest(path))
    groups.setdefault(key, []).append(path)

for (_size, _hash), paths in groups.items():
    if len(paths) < 2:
        continue
    canonical = max(paths, key=lambda p: (len(p.name), p.name))
    for duplicate in paths:
        if duplicate == canonical:
            continue
        duplicate.unlink()
        os.symlink(canonical.name, duplicate)
PY
}

compact_bundled_runtime() {
  install_compat_cpp_runtime
  ensure_bundled_libudev
  ensure_qdl_legacy_libxml2

  rm -rf "$APPDIR/lib/dri"
  rm -f \
    "$APPDIR"/lib/libLLVM.so* \
    "$APPDIR"/lib/libgallium-*.so \
    "$APPDIR"/lib/libdrm*.so \
    "$APPDIR"/lib/libglapi.so* \
    "$APPDIR"/lib/libwayland-*.so \
    "$APPDIR"/lib/libxshmfence.so* \
    "$APPDIR"/lib/libxcb-dri*.so* \
    "$APPDIR"/lib/libxcb-present.so* \
    "$APPDIR"/lib/libxcb-sync.so* \
    "$APPDIR"/lib/libxcb-xfixes.so*

  if [ -d "$APPDIR/bin/locales" ]; then
    find "$APPDIR/bin/locales" -maxdepth 1 -type f -name '*.pak' ! -name 'en-US.pak' -delete
  fi

  rm -rf \
    "$APPDIR/share/alsa" \
    "$APPDIR/share/drirc.d" \
    "$APPDIR/share/glvnd" \
    "$APPDIR/share/glycin-loaders" \
    "$APPDIR/share/terminfo" \
    "$APPDIR/share/X11/locale"

  find "$APPDIR/lib" -maxdepth 1 \( -type f -o -type l \) \( \
    -name 'libnss_myhostname.so*' -o \
    -name 'libnss_mymachines.so*' \
  \) -delete

  if [ -f "$APPDIR/bin/vk_swiftshader_icd.json" ] && [ -f "$APPDIR/bin/cef/vk_swiftshader_icd.json" ]; then
    rm -f "$APPDIR/bin/vk_swiftshader_icd.json"
    ln -s "cef/vk_swiftshader_icd.json" "$APPDIR/bin/vk_swiftshader_icd.json"
  fi

  mkdir -p "$APPDIR/lib/bin" "$APPDIR/shared/bin"

  if [ -d "$APPDIR/bin/cef" ]; then
    rm -rf "$APPDIR/lib/bin/cef"
    ln -s "../../bin/cef" "$APPDIR/lib/bin/cef"
  fi

  for duplicate_entry in libasar.so libNativeWrapper.so; do
    if [ -e "$APPDIR/bin/$duplicate_entry" ]; then
      rm -f "$APPDIR/lib/bin/$duplicate_entry"
      ln -s "../../bin/$duplicate_entry" "$APPDIR/lib/bin/$duplicate_entry"
    fi
  done

  for cef_lib in libcef.so libEGL.so libGLESv2.so libvulkan.so.1 libvk_swiftshader.so; do
    if [ -e "$APPDIR/bin/cef/$cef_lib" ]; then
      rm -f "$APPDIR/lib/$cef_lib"
      ln -s "../bin/cef/$cef_lib" "$APPDIR/lib/$cef_lib"
    fi
  done

  collapse_duplicate_libraries
}

build_exec_wrapper_binary() {
  local source_path="$PWD/tooling/build/appimage/execpath-shim.c"
  local build_log="$BUILD_TMPDIR/execpath-shim-build.log"

  if [ -x "$EXEC_WRAPPER_BIN" ]; then
    return 0
  fi

  if [ ! -f "$source_path" ]; then
    echo "AppImage build: missing runtime wrapper source $source_path" >&2
    exit 1
  fi

  if command -v musl-gcc >/dev/null 2>&1; then
    if musl-gcc -static -Os -s -o "$EXEC_WRAPPER_BIN" "$source_path" 2>"$build_log"; then
      rm -f "$build_log"
      return
    fi
    echo "AppImage build: musl-gcc wrapper build failed; falling back to gcc -static." >&2
  fi

  if gcc -static -Os -s -o "$EXEC_WRAPPER_BIN" "$source_path"; then
    rm -f "$build_log"
    return
  fi

  if [ -s "$build_log" ]; then
    cat "$build_log" >&2
  fi
  echo "AppImage build: unable to compile a static runtime wrapper." >&2
  exit 1
}

install_exec_wrapper() {
  install -m 0755 "$EXEC_WRAPPER_BIN" "$1"
}

prepare_wrapped_runtime_binary() {
  local runtime_bin="$1"
  local name="" shared_entry=""

  if [ ! -e "$runtime_bin" ]; then
    return 0
  fi

  name="$(basename "$runtime_bin")"
  shared_entry="$APPDIR/shared/bin/$name"

  if [ -L "$shared_entry" ]; then
    rm -f "$shared_entry"
  fi

  if [ ! -e "$shared_entry" ]; then
    mv "$runtime_bin" "$shared_entry"
  else
    rm -f "$runtime_bin"
  fi

  install_exec_wrapper "$runtime_bin"
}

wrap_electrobun_runtime() {
  local entry="" name="" helper=""

  build_exec_wrapper_binary
  mkdir -p "$APPDIR/shared/bin"

  for entry in "$APPDIR/bin"/*; do
    if [ ! -e "$entry" ]; then
      continue
    fi
    name="$(basename "$entry")"
    if [ ! -e "$APPDIR/shared/bin/$name" ]; then
      ln -s "../../bin/$name" "$APPDIR/shared/bin/$name"
    fi
  done

  for helper in \
    "$APPDIR/bin/bun" \
    "$APPDIR/bin/bun Helper" \
    "$APPDIR/bin/bun Helper (Alerts)" \
    "$APPDIR/bin/bun Helper (GPU)" \
    "$APPDIR/bin/bun Helper (Plugin)" \
    "$APPDIR/bin/bun Helper (Renderer)" \
    "$APPDIR/bin/chrome-sandbox"
  do
    prepare_wrapped_runtime_binary "$helper"
  done

  for helper in \
    bun \
    "bun Helper" \
    "bun Helper (Alerts)" \
    "bun Helper (GPU)" \
    "bun Helper (Plugin)" \
    "bun Helper (Renderer)" \
    chrome-sandbox
  do
    if [ -e "$APPDIR/bin/$helper" ]; then
      rm -f "$APPDIR/lib/$helper"
      ln -s "../bin/$helper" "$APPDIR/lib/$helper"
    fi
  done

  if [ -f "$APPDIR/shared/bin/bun Helper" ]; then
    strip --strip-unneeded "$APPDIR/shared/bin/bun Helper" || true
    for helper in \
      "bun Helper (Alerts)" \
      "bun Helper (GPU)" \
      "bun Helper (Plugin)" \
      "bun Helper (Renderer)"
    do
      if [ -f "$APPDIR/shared/bin/$helper" ]; then
        rm -f "$APPDIR/shared/bin/$helper"
        ln -s "bun Helper" "$APPDIR/shared/bin/$helper"
      fi
    done
  fi

}

rewrite_tool_binary_wrapper() {
  local wrapper_path="$1"
  local target_path="${wrapper_path}.lmfd-real"

  if [ ! -f "$wrapper_path" ]; then
    return 0
  fi

  if [ ! -f "$target_path" ]; then
    mv "$wrapper_path" "$target_path"
  fi

  build_exec_wrapper_binary
  install_exec_wrapper "$wrapper_path"
  chmod +x "$target_path"
}

wrap_embedded_tool_binaries() {
  rewrite_tool_binary_wrapper "$APPDIR/Resources/app/tools/qdl/linux-x64/qdl"
  rewrite_tool_binary_wrapper "$APPDIR/Resources/app/tools/qdl/linux-arm64/qdl"
}

make_appimage() {
  if [ -n "${UPINFO:-}" ] && ! command -v zsyncmake >/dev/null 2>&1; then
    echo "AppImage build: zsyncmake not found, skipping UPINFO/zsync generation for local build." >&2
    unset UPINFO
  fi

  echo "AppImage build: creating $OUTNAME..."
  "$QUICK_SHARUN_BIN" --make-appimage
}

main() {
  run_step "preparing quick-sharun" prepare_quick_sharun
  run_step "writing desktop metadata" write_desktop_metadata
  run_step "stripping packaged binaries" strip_packaged_binaries
  run_step "deploying runtime" deploy_with_quick_sharun
  run_step "installing Android udev rules" install_android_udev_rules
  run_step "patching generated runtime scripts" patch_generated_runtime_scripts
  run_step "compacting bundled runtime" compact_bundled_runtime
  run_step "wrapping Electrobun runtime" wrap_electrobun_runtime
  run_step "wrapping embedded tool binaries" wrap_embedded_tool_binaries
  run_step "creating AppImage" make_appimage
}

main "$@"
