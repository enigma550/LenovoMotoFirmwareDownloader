import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

type WindowsSoftwareFixBackup = NonNullable<
  Awaited<ReturnType<typeof loadConfig>>['windowsSoftwareFixHandlerBackup']
>;

const APP_IDENTIFIER = 'com.github.enigma550.lenovomotofirmwaredownloader';
const DESKTOP_DISPLAY_NAME = 'Lenovo Moto Firmware Downloader';
const WMCLASS = 'LenovoMotoFirmwareDown';
const SOFTWARE_FIX_SCHEME = 'x-scheme-handler/softwarefix';
const WINDOWS_SOFTWAREFIX_KEY = 'HKCU\\Software\\Classes\\softwarefix';
const WINDOWS_SOFTWAREFIX_COMMAND_KEY = `${WINDOWS_SOFTWAREFIX_KEY}\\shell\\open\\command`;
const WINDOWS_SOFTWAREFIX_MACHINE_KEY = 'HKCR\\softwarefix';
const WINDOWS_SOFTWAREFIX_MACHINE_COMMAND_KEY = `${WINDOWS_SOFTWAREFIX_MACHINE_KEY}\\shell\\open\\command`;
const CALLBACK_DROP_PATH = join(tmpdir(), 'lenovo-moto-firmware-downloader-auth-callback.txt');
const INSTANCE_PID_PATH = join(tmpdir(), 'lenovo-moto-firmware-downloader.pid');

// Known .desktop file names to look for
const GEAR_LEVER_DESKTOP = 'lenovo_moto_firmware_downloader.desktop';
const OUR_DESKTOP = `${APP_IDENTIFIER}.desktop`;

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}

function normalizeWindowsCommand(command: string) {
  return command.replace(/\s+/g, ' ').trim().toLowerCase();
}

function sameWindowsCommand(left: string, right: string) {
  return normalizeWindowsCommand(left) === normalizeWindowsCommand(right);
}

function isLmfdWindowsSoftwareFixCommand(command: string) {
  const normalized = normalizeWindowsCommand(command);
  return (
    normalized.includes(APP_IDENTIFIER.toLowerCase()) ||
    normalized.includes('lenovomotofirmwaredownloader')
  );
}

function resolveWindowsProtocolLauncherPath() {
  const execDir = dirname(process.execPath);
  const candidates = uniquePaths([
    join(execDir, 'launcher.exe'),
    join(process.cwd(), 'launcher.exe'),
    join(process.cwd(), 'bin', 'launcher.exe'),
    process.execPath,
  ]);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return process.execPath;
}

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

async function runWindowsRegistryCommand(args: string[]) {
  const proc = Bun.spawn(['reg', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });

  const [stdoutText, stderrText, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    ok: exitCode === 0,
    stdoutText,
    stderrText,
    exitCode,
  };
}

async function queryRegistryDefaultValue(keyPath: string) {
  const result = await runWindowsRegistryCommand(['query', keyPath, '/ve']);
  if (!result.ok) {
    return '';
  }

  const lines = result.stdoutText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const valueLine = lines.find((line) => /\sREG_\w+\s/.test(line));
  if (!valueLine) {
    return '';
  }

  const match = valueLine.match(/REG_\w+\s+(.*)$/);
  return match?.[1]?.trim() || '';
}

async function setRegistryDefaultValue(keyPath: string, value: string) {
  const result = await runWindowsRegistryCommand(['add', keyPath, '/ve', '/d', value, '/f']);
  if (!result.ok) {
    throw new Error(
      result.stderrText.trim() || result.stdoutText.trim() || 'Registry write failed.',
    );
  }
}

async function setRegistryNamedValue(keyPath: string, name: string, value: string) {
  const result = await runWindowsRegistryCommand(['add', keyPath, '/v', name, '/d', value, '/f']);
  if (!result.ok) {
    throw new Error(
      result.stderrText.trim() || result.stdoutText.trim() || 'Registry write failed.',
    );
  }
}

async function deleteRegistryKey(keyPath: string) {
  const result = await runWindowsRegistryCommand(['delete', keyPath, '/f']);
  if (
    !result.ok &&
    !/unable to find/i.test(result.stderrText) &&
    !/unable to find/i.test(result.stdoutText)
  ) {
    throw new Error(
      result.stderrText.trim() || result.stdoutText.trim() || 'Registry delete failed.',
    );
  }
}

function getLmfdWindowsSoftwareFixCommand() {
  const launcherPath = resolveWindowsProtocolLauncherPath();
  return `"${launcherPath}" "%1"`;
}

async function detectCurrentSoftwareFixRegistration(): Promise<WindowsSoftwareFixBackup | null> {
  const userCommand = await queryRegistryDefaultValue(WINDOWS_SOFTWAREFIX_COMMAND_KEY);
  if (userCommand) {
    return {
      command: userCommand,
      source: 'hkcu',
      description: (await queryRegistryDefaultValue(WINDOWS_SOFTWAREFIX_KEY)) || undefined,
    };
  }

  const machineCommand = await queryRegistryDefaultValue(WINDOWS_SOFTWAREFIX_MACHINE_COMMAND_KEY);
  if (machineCommand) {
    return {
      command: machineCommand,
      source: 'hkcr',
      description: (await queryRegistryDefaultValue(WINDOWS_SOFTWAREFIX_MACHINE_KEY)) || undefined,
    };
  }

  return null;
}

export async function switchSoftwareFixProtocolToLmfd() {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      error: 'This action is only available on Windows.',
    };
  }

  const lmfdCommand = getLmfdWindowsSoftwareFixCommand();
  const currentRegistration = await detectCurrentSoftwareFixRegistration();

  try {
    const config = await loadConfig();
    if (
      currentRegistration &&
      !sameWindowsCommand(currentRegistration.command, lmfdCommand) &&
      !isLmfdWindowsSoftwareFixCommand(currentRegistration.command)
    ) {
      config.windowsSoftwareFixHandlerBackup = currentRegistration;
    }

    await setRegistryDefaultValue(
      WINDOWS_SOFTWAREFIX_KEY,
      currentRegistration?.description || 'URL:LMFD Custom Protocol',
    );
    await setRegistryNamedValue(WINDOWS_SOFTWAREFIX_KEY, 'URL Protocol', '');
    await setRegistryDefaultValue(WINDOWS_SOFTWAREFIX_COMMAND_KEY, lmfdCommand);
    await saveConfig(config);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function restoreSoftwareFixProtocolHandler() {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      error: 'This action is only available on Windows.',
    };
  }

  try {
    const config = await loadConfig();
    const backup = config.windowsSoftwareFixHandlerBackup;
    const currentUserCommand = await queryRegistryDefaultValue(WINDOWS_SOFTWAREFIX_COMMAND_KEY);
    if (!backup) {
      if (currentUserCommand && isLmfdWindowsSoftwareFixCommand(currentUserCommand)) {
        await deleteRegistryKey(WINDOWS_SOFTWAREFIX_KEY);
        return { ok: true };
      }

      return {
        ok: false,
        error: 'No previous Software Fix handler was saved yet, and no LMFD user override exists.',
      };
    }

    if (backup.source === 'hkcr') {
      await deleteRegistryKey(WINDOWS_SOFTWAREFIX_KEY);
    } else {
      await setRegistryDefaultValue(
        WINDOWS_SOFTWAREFIX_KEY,
        backup.description || 'URL:SF Custom Protocol',
      );
      await setRegistryNamedValue(WINDOWS_SOFTWAREFIX_KEY, 'URL Protocol', '');
      await setRegistryDefaultValue(WINDOWS_SOFTWAREFIX_COMMAND_KEY, backup.command);
    }

    delete config.windowsSoftwareFixHandlerBackup;
    await saveConfig(config);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
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
  if (process.platform === 'win32') {
    try {
      const currentRegistration = await detectCurrentSoftwareFixRegistration();
      if (!currentRegistration?.command) {
        return { ok: true, status: 'missing' };
      }

      const lmfdCommand = getLmfdWindowsSoftwareFixCommand();
      if (sameWindowsCommand(currentRegistration.command, lmfdCommand)) {
        return { ok: true, status: 'ok' };
      }

      if (isLmfdWindowsSoftwareFixCommand(currentRegistration.command)) {
        const switchResult = await switchSoftwareFixProtocolToLmfd();
        if (switchResult.ok) {
          return { ok: true, status: 'ok' };
        }

        return {
          ok: false,
          status: 'missing',
          error: switchResult.error || 'Could not update LMFD softwarefix:// handler.',
        };
      }

      return { ok: true, status: 'missing' };
    } catch (error) {
      return {
        ok: false,
        status: 'missing',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

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
