import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';

export type LinuxUdevStatus = {
  isLinux: boolean;
  installed: boolean;
  filePath: string;
  hasRules: boolean;
  userInPlugdev: boolean;
};

export type LinuxUdevInstallResult = {
  ok: boolean;
  message: string;
};

const UDEV_RULES_CONTENT = `# 51-motorola-android.rules
# Udev rules for Motorola, Lenovo, MediaTek, Qualcomm, and Unisoc flash tools

# Motorola PCS (Fastboot, ADB, Flash mode)
SUBSYSTEM=="usb", ATTR{idVendor}=="22b8", MODE="0666", GROUP="plugdev", TAG+="uaccess"
# Lenovo
SUBSYSTEM=="usb", ATTR{idVendor}=="17ef", MODE="0666", GROUP="plugdev", TAG+="uaccess"

# MediaTek (Preloader, BootROM, Fastboot)
SUBSYSTEM=="usb", ATTR{idVendor}=="0e8d", MODE="0666", GROUP="plugdev", TAG+="uaccess"

# Qualcomm (EDL 9008 emergency download mode, Fastboot)
SUBSYSTEM=="usb", ATTR{idVendor}=="05c6", MODE="0666", GROUP="plugdev", TAG+="uaccess"

# Unisoc / Spreadtrum (PAC / SPD download mode)
SUBSYSTEM=="usb", ATTR{idVendor}=="1782", MODE="0666", GROUP="plugdev", TAG+="uaccess"

# Google (Generic Fastboot, Fastbootd)
SUBSYSTEM=="usb", ATTR{idVendor}=="18d1", MODE="0666", GROUP="plugdev", TAG+="uaccess"
`;

const TARGET_RULES_PATH = '/etc/udev/rules.d/51-motorola-android.rules';
const FALLBACK_RULES_PATH = '/etc/udev/rules.d/51-android.rules';

export async function checkLinuxUdevRules(): Promise<LinuxUdevStatus> {
  if (process.platform !== 'linux') {
    return {
      isLinux: false,
      installed: false,
      filePath: '',
      hasRules: false,
      userInPlugdev: false,
    };
  }

  let filePath = '';
  let installed = false;
  let hasRules = false;

  if (existsSync(TARGET_RULES_PATH)) {
    filePath = TARGET_RULES_PATH;
    installed = true;
  } else if (existsSync(FALLBACK_RULES_PATH)) {
    filePath = FALLBACK_RULES_PATH;
    installed = true;
  }

  if (installed && filePath) {
    try {
      const content = await readFile(filePath, 'utf-8');
      hasRules = content.includes('22b8') || content.includes('0e8d') || content.includes('05c6');
    } catch {
      // Ignore read errors
    }
  }

  let userInPlugdev = false;
  try {
    const proc = Bun.spawn(['groups'], { stdout: 'pipe' });
    const output = await new Response(proc.stdout).text();
    userInPlugdev = output.includes('plugdev') || output.includes('uaccess');
  } catch {
    // Ignore
  }

  return {
    isLinux: true,
    installed: installed && hasRules,
    filePath,
    hasRules,
    userInPlugdev,
  };
}

export async function installLinuxUdevRules(): Promise<LinuxUdevInstallResult> {
  if (process.platform !== 'linux') {
    return { ok: false, message: 'Udev rules are only applicable to Linux systems.' };
  }

  const currentUser = userInfo().username;
  const tempScriptPath = `/tmp/lmfd_install_udev_${Date.now()}.sh`;

  const scriptContent = `#!/bin/sh
set -e
cat << 'EOF' > "${TARGET_RULES_PATH}"
${UDEV_RULES_CONTENT}
EOF
chmod 644 "${TARGET_RULES_PATH}"
groupadd -f plugdev || true
if id "${currentUser}" >/dev/null 2>&1; then
  usermod -aG plugdev "${currentUser}" || true
fi
udevadm control --reload-rules || true
udevadm trigger || true
`;

  try {
    await writeFile(tempScriptPath, scriptContent, { mode: 0o755 });

    const proc = Bun.spawn(['pkexec', 'sh', tempScriptPath], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    await unlink(tempScriptPath).catch(() => {});

    if (exitCode === 0) {
      return {
        ok: true,
        message: 'Regras Udev do Linux instaladas com sucesso! Permissões USB ativadas.',
      };
    }

    const stderr = await new Response(proc.stderr).text();
    return {
      ok: false,
      message: stderr.trim() || `Falha na autorização do administrador (código ${exitCode}).`,
    };
  } catch (error) {
    await unlink(tempScriptPath).catch(() => {});
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
