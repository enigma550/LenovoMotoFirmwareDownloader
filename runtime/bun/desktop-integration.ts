import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig } from '../../core/infra/config.ts';

export interface DesktopIntegrationStatus {
  ok: boolean;
  status: 'ok' | 'missing' | 'wrong_wmclass' | 'not_linux';
  error?: string;
}

export interface AppInfo {
  version: string;
  platform: string;
  channel: string;
}

const APP_IDENTIFIER = 'com.github.enigma550.lenovomotofirmwaredownloader';
const DESKTOP_DISPLAY_NAME = 'Lenovo Moto Firmware Downloader';
const WMCLASS = 'LenovoMotoFirmwareDown';
const SOFTWARE_FIX_SCHEME = 'x-scheme-handler/softwarefix';
const CALLBACK_DROP_PATH = join(tmpdir(), 'lenovo-moto-firmware-downloader-auth-callback.txt');
const INSTANCE_PID_PATH = join(tmpdir(), 'lenovo-moto-firmware-downloader.pid');

// Known .desktop file names to look for
const GEAR_LEVER_DESKTOP = 'lenovo_moto_firmware_downloader.desktop';
const OUR_DESKTOP = `${APP_IDENTIFIER}.desktop`;

function getExpectedExecPath() {
  if (process.env.APPIMAGE) {
    return process.env.APPIMAGE;
  }

  const launcherPath = join(process.cwd(), 'launcher');
  if (existsSync(launcherPath)) {
    return launcherPath;
  }

  return process.execPath;
}

function normalizeExecCommand(execValue: string) {
  return execValue.replaceAll('"', '').replaceAll('%U', '').trim();
}

function buildExecLine(execPath: string) {
  const escapedExecPath = execPath.replaceAll('"', '\\"');
  const escapedDropPath = CALLBACK_DROP_PATH.replaceAll('"', '\\"');
  const escapedPidPath = INSTANCE_PID_PATH.replaceAll('"', '\\"');
  return `Exec=sh -c 'echo "$1" > "${escapedDropPath}"; pidfile="${escapedPidPath}"; if [ -f "$pidfile" ]; then pid=$(tr -d "[:space:]" < "$pidfile" 2>/dev/null); if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then exit 0; fi; fi; exec "${escapedExecPath}"' lmfd %U`;
}

function ensureExecLine(content: string) {
  const expectedExecLine = buildExecLine(getExpectedExecPath());
  if (content.match(/^Exec=.*$/m)) {
    return content.replace(/^Exec=.*$/m, expectedExecLine);
  }
  return `${content.trimEnd()}\n${expectedExecLine}\n`;
}

async function runDesktopCommand(command: string, args: string[]) {
  try {
    const proc = Bun.spawn([command, ...args], {
      stdout: 'ignore',
      stderr: 'ignore',
      stdin: 'ignore',
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

async function refreshSoftwareFixSchemeAssociation(desktopDir: string, desktopFileName: string) {
  if (!desktopFileName) return;

  const setDefaultOk = await runDesktopCommand('xdg-mime', [
    'default',
    desktopFileName,
    SOFTWARE_FIX_SCHEME,
  ]);
  if (!setDefaultOk) {
    console.warn(
      `[DesktopIntegration] Could not set ${desktopFileName} as default scheme handler.`,
    );
  }

  await runDesktopCommand('gio', ['mime', SOFTWARE_FIX_SCHEME, desktopFileName]);

  await runDesktopCommand('update-desktop-database', [desktopDir]);
}

async function getDesktopDir(): Promise<string | null> {
  if (process.platform !== 'linux') return null;
  const home = process.env.HOME;
  if (!home) return null;
  const dir = join(home, '.local', 'share', 'applications');
  await mkdir(dir, { recursive: true }).catch(() => {});
  return dir;
}

/**
 * Find an existing .desktop file - check both our identifier-based name
 * and the Gear Lever-created name.
 * Returns { path, isOurs } or null if none found.
 */
async function findExistingDesktopFile(): Promise<{
  path: string;
  isOurs: boolean;
} | null> {
  const dir = await getDesktopDir();
  if (!dir) return null;

  const ours = join(dir, OUR_DESKTOP);
  if (await Bun.file(ours).exists()) return { path: ours, isOurs: true };

  const gearLever = join(dir, GEAR_LEVER_DESKTOP);
  if (await Bun.file(gearLever).exists()) return { path: gearLever, isOurs: false };

  return null;
}

/**
 * Check if desktop integration should be suppressed per AppImage spec:
 * - appimagekit/no_desktopintegration file exists
 * - $DESKTOPINTEGRATION env is non-empty
 */
async function isDesktopIntegrationSuppressed(): Promise<boolean> {
  const xdgDataHome = process.env.XDG_DATA_HOME || join(process.env.HOME || '', '.local', 'share');
  const noIntegrationPaths = [
    join(xdgDataHome, 'appimagekit', 'no_desktopintegration'),
    '/usr/share/appimagekit/no_desktopintegration',
    '/etc/appimagekit/no_desktopintegration',
  ];

  for (const p of noIntegrationPaths) {
    if (await Bun.file(p).exists()) return true;
  }

  if (process.env.DESKTOPINTEGRATION) return true;

  return false;
}

function ensureSoftwareFixScheme(content: string) {
  const mimeTypeMatch = content.match(/^MimeType=(.*)$/m);
  if (!mimeTypeMatch) {
    return `${content.trimEnd()}\nMimeType=${SOFTWARE_FIX_SCHEME};\n`;
  }

  const mimeTypeValue = mimeTypeMatch[1] || '';
  const currentValues = mimeTypeValue
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean);
  if (currentValues.some((value) => value.toLowerCase() === SOFTWARE_FIX_SCHEME)) {
    return content;
  }

  const updatedValues = [...currentValues, SOFTWARE_FIX_SCHEME];
  const updatedMimeTypeLine = `MimeType=${updatedValues.join(';')};`;
  return content.replace(/^MimeType=.*$/m, updatedMimeTypeLine);
}

function ensureIconLine(content: string, iconValue: string) {
  const iconLine = `Icon=${iconValue}`;
  if (content.match(/^Icon=.*$/m)) {
    return content.replace(/^Icon=.*$/m, iconLine);
  }
  return `${content.trimEnd()}\n${iconLine}\n`;
}

async function getDesktopIconSourcePath() {
  const candidates = [
    join(process.cwd(), 'assets', 'icons', 'icon.iconset', 'icon_512x512.png'),
    join(process.cwd(), '..', 'Resources', 'app', 'icon.png'),
    join(process.cwd(), 'Resources', 'app', 'icon.png'),
  ];

  if (process.env.APPDIR) {
    candidates.push(join(process.env.APPDIR, 'Resources', 'app', 'icon.png'));
    candidates.push(join(process.env.APPDIR, `${APP_IDENTIFIER}.png`));
  }

  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) {
      return candidate;
    }
  }

  return null;
}

async function installDesktopIcon() {
  const sourcePath = await getDesktopIconSourcePath();
  if (!sourcePath) {
    return APP_IDENTIFIER;
  }

  const home = process.env.HOME;
  if (!home) {
    return sourcePath;
  }

  const iconDir = join(home, '.local', 'share', 'icons', 'hicolor', '512x512', 'apps');
  const targetPath = join(iconDir, `${APP_IDENTIFIER}.png`);

  await mkdir(iconDir, { recursive: true });
  await copyFile(sourcePath, targetPath);

  const hicolorRoot = join(home, '.local', 'share', 'icons', 'hicolor');
  await runDesktopCommand('gtk-update-icon-cache', ['-f', '-t', hicolorRoot]);
  await runDesktopCommand('xdg-icon-resource', ['forceupdate']);

  return APP_IDENTIFIER;
}

export async function checkDesktopIntegration(): Promise<DesktopIntegrationStatus> {
  if (process.platform !== 'linux') {
    return { ok: true, status: 'not_linux' };
  }

  if (await isDesktopIntegrationSuppressed()) {
    return { ok: true, status: 'ok' };
  }

  // Dedup: if both our file and Gear Lever's file exist, remove ours
  // to avoid duplicate icons in the launcher
  const dir = await getDesktopDir();
  if (dir) {
    const oursPath = join(dir, OUR_DESKTOP);
    const gearLeverPath = join(dir, GEAR_LEVER_DESKTOP);
    if ((await Bun.file(oursPath).exists()) && (await Bun.file(gearLeverPath).exists())) {
      await Bun.file(oursPath)
        .delete()
        .catch(() => {});
    }
  }

  const existing = await findExistingDesktopFile();
  if (!existing) {
    return { ok: true, status: 'missing' };
  }

  try {
    const content = await Bun.file(existing.path).text();
    const hasWmClass = content.includes(`StartupWMClass=${WMCLASS}`);
    const hasSoftwareFixScheme = /^MimeType=.*x-scheme-handler\/softwarefix/im.test(content);
    const execMatch = content.match(/^Exec=(.*)$/m);
    const currentExec = normalizeExecCommand(execMatch?.[1] || '');
    const expectedExec = normalizeExecCommand(getExpectedExecPath());
    const hasSingleInstanceGuard =
      currentExec.includes(INSTANCE_PID_PATH) && currentExec.includes('kill -0');
    const hasExpectedExec =
      currentExec.includes(expectedExec) &&
      currentExec.includes(CALLBACK_DROP_PATH) &&
      hasSingleInstanceGuard;
    if (!hasWmClass || !hasSoftwareFixScheme || !hasExpectedExec) {
      return { ok: true, status: 'wrong_wmclass' };
    }
    return { ok: true, status: 'ok' };
  } catch (error) {
    return { ok: false, status: 'missing', error: String(error) };
  }
}

export async function createDesktopIntegration(): Promise<DesktopIntegrationStatus> {
  if (process.platform !== 'linux') {
    return { ok: false, status: 'not_linux', error: 'Only supported on Linux' };
  }

  const dir = await getDesktopDir();
  if (!dir) {
    return { ok: false, status: 'missing', error: '$HOME not found.' };
  }

  // Check if Gear Lever (or another tool) already created a .desktop file.
  // If so, patch it in-place rather than creating a duplicate.
  const existing = await findExistingDesktopFile();

  if (existing && !existing.isOurs) {
    // Gear Lever file exists - patch its StartupWMClass in-place
    try {
      let content = await Bun.file(existing.path).text();
      const iconValue = await installDesktopIcon();
      content = ensureExecLine(content);
      content = ensureIconLine(content, iconValue);
      if (content.match(/^StartupWMClass=.*/m)) {
        content = content.replace(/^StartupWMClass=.*/m, `StartupWMClass=${WMCLASS}`);
      } else {
        content = `${content.trimEnd()}\nStartupWMClass=${WMCLASS}\n`;
      }
      content = ensureSoftwareFixScheme(content);
      await Bun.write(existing.path, content);
      await refreshSoftwareFixSchemeAssociation(dir, existing.path.split('/').at(-1) || '');
      return { ok: true, status: 'ok' };
    } catch (error) {
      return { ok: false, status: 'missing', error: String(error) };
    }
  }

  // No existing file or it's ours - write our identifier-based .desktop file
  const filePath = join(dir, OUR_DESKTOP);

  const execPath = getExpectedExecPath();
  const iconPath = await installDesktopIcon();

  const desktopFileContent = `[Desktop Entry]
Version=1.0
Type=Application
Name=${DESKTOP_DISPLAY_NAME}
Comment=${DESKTOP_DISPLAY_NAME}
${buildExecLine(execPath)}
Icon=${iconPath}
Terminal=false
StartupWMClass=${WMCLASS}
MimeType=${SOFTWARE_FIX_SCHEME};
Categories=Utility;Application;
`;

  try {
    await Bun.write(filePath, desktopFileContent);
    await refreshSoftwareFixSchemeAssociation(dir, OUR_DESKTOP);
    return { ok: true, status: 'ok' };
  } catch (error) {
    return { ok: false, status: 'missing', error: String(error) };
  }
}

export async function getDesktopPromptPreference(): Promise<boolean> {
  try {
    const config = await loadConfig();
    // Default to true (ask) if not explicitly set to false
    return config.askDesktopIntegration !== false;
  } catch {
    return true;
  }
}

export async function setDesktopPromptPreference(ask: boolean): Promise<boolean> {
  try {
    const config = await loadConfig();
    config.askDesktopIntegration = ask;
    await saveConfig(config);
    return true;
  } catch {
    return false;
  }
}

export async function getAppInfo(): Promise<AppInfo> {
  let version = '0.0.0';
  let channel = '';
  try {
    // Electrobun writes Resources/version.json during build with version, channel, etc.
    // At runtime, CWD is the bin/ folder, so Resources is ../Resources/
    const candidates = [
      join(process.cwd(), '..', 'Resources', 'version.json'),
      join(process.cwd(), 'Resources', 'version.json'),
    ];

    if (process.env.APPDIR) {
      candidates.push(join(process.env.APPDIR, 'Resources', 'version.json'));
    }

    for (const p of candidates) {
      const f = Bun.file(p);
      if (await f.exists()) {
        const info = await f.json();
        if (info.version) {
          version = info.version;
          channel = info.channel || '';
          break;
        }
      }
    }
  } catch (e) {
    console.warn('Failed to read version.json', e);
  }

  return {
    version,
    platform: process.platform,
    channel,
  };
}
