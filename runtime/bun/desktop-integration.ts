import { mkdir } from 'node:fs/promises';
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

// Known .desktop file names to look for
const GEAR_LEVER_DESKTOP = 'lenovo_moto_firmware_downloader.desktop';
const OUR_DESKTOP = `${APP_IDENTIFIER}.desktop`;

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
    if (!content.includes(`StartupWMClass=${WMCLASS}`)) {
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
      if (content.match(/^StartupWMClass=.*/m)) {
        content = content.replace(/^StartupWMClass=.*/m, `StartupWMClass=${WMCLASS}`);
      } else {
        content = `${content.trimEnd()}\nStartupWMClass=${WMCLASS}\n`;
      }
      await Bun.write(existing.path, content);
      return { ok: true, status: 'ok' };
    } catch (error) {
      return { ok: false, status: 'missing', error: String(error) };
    }
  }

  // No existing file or it's ours - write our identifier-based .desktop file
  const filePath = join(dir, OUR_DESKTOP);

  // APPIMAGE is set by the AppImageKit runtime when launched from an AppImage.
  const execPath = process.env.APPIMAGE || process.execPath;

  // Resolve the icon. In AppImage, APPDIR is set to the mount point.
  let iconPath = APP_IDENTIFIER;
  if (process.env.APPDIR) {
    const maybeIcon = join(process.env.APPDIR, `${APP_IDENTIFIER}.png`);
    if (await Bun.file(maybeIcon).exists()) {
      iconPath = maybeIcon;
    }
  }

  const desktopFileContent = `[Desktop Entry]
Version=1.0
Type=Application
Name=${DESKTOP_DISPLAY_NAME}
Comment=${DESKTOP_DISPLAY_NAME}
Exec="${execPath}" %U
Icon=${iconPath}
Terminal=false
StartupWMClass=${WMCLASS}
Categories=Utility;Application;
`;

  try {
    await Bun.write(filePath, desktopFileContent);
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
