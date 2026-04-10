import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  WindowsMtkDriverInstallResponse,
  WindowsSpdDriverInstallResponse,
} from '../../../../shared/desktop-rpc';
import { runCommandWithAbort } from '../device-flasher.ts';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const APP_IDENTIFIER = 'com.github.enigma550.lenovomotofirmwaredownloader';

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function inferAppRootsFromModuleDir(moduleDir: string) {
  const normalizedModuleDir = resolve(moduleDir).replaceAll('/', '\\');
  const bundledMarker = '\\resources\\app\\';
  const bundledMarkerIndex = normalizedModuleDir.toLowerCase().lastIndexOf(bundledMarker);
  if (bundledMarkerIndex >= 0) {
    return [normalizedModuleDir.slice(0, bundledMarkerIndex + bundledMarker.length - 1)];
  }

  const sourceMarker = '\\runtime\\bun\\';
  const sourceMarkerIndex = normalizedModuleDir.toLowerCase().lastIndexOf(sourceMarker);
  if (sourceMarkerIndex >= 0) {
    return [normalizedModuleDir.slice(0, sourceMarkerIndex)];
  }

  return [];
}

export function getBundledAppRootCandidates() {
  const execPath = process.execPath;
  const argv0 = process.argv[0] || execPath;
  const resourcesPath =
    typeof (process as { resourcesPath?: unknown }).resourcesPath === 'string'
      ? ((process as { resourcesPath?: string }).resourcesPath ?? '')
      : '';
  const localAppData = process.env.LOCALAPPDATA || '';
  const buildEnvironment = (process.env.ELECTROBUN_BUILD_ENV || '').trim();
  const appDataChannels = [buildEnvironment, 'canary', 'stable', 'dev'].filter(Boolean);

  return uniquePaths([
    ...inferAppRootsFromModuleDir(MODULE_DIR),
    ...appDataChannels.map((channel) =>
      join(localAppData, APP_IDENTIFIER, channel, 'app', 'Resources', 'app'),
    ),
    resourcesPath ? join(resourcesPath, 'app') : '',
    resourcesPath,
    join(execPath, '..', '..', 'Resources', 'app'),
    join(dirname(execPath), '..', 'Resources', 'app'),
    join(argv0, '..', '..', 'Resources', 'app'),
    join(dirname(argv0), '..', 'Resources', 'app'),
  ]).filter(Boolean);
}

export function formatError<ErrorValue>(error: ErrorValue) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getBundledDriverExeCandidates(options: {
  installerSubDir: string;
  preferredFileNames: string[];
}) {
  const platformArchKey = `${process.platform}-${process.arch}`;
  const packagedAppRoots = getBundledAppRootCandidates();

  const bundledRoots = uniqueStrings([
    // Preferred layout
    join('tools', 'drivers', platformArchKey, options.installerSubDir),
    join('tools', 'drivers', 'win32-x64', options.installerSubDir),
    // Legacy layout fallback
    join('tools', options.installerSubDir, platformArchKey),
    join('tools', options.installerSubDir, 'win32-x64'),
  ]);

  const packagedCandidates = packagedAppRoots.flatMap((root) =>
    bundledRoots.flatMap((bundledRoot) =>
      options.preferredFileNames.map((name) => join(root, bundledRoot, name)),
    ),
  );

  const developmentCandidates = bundledRoots.flatMap((bundledRoot) =>
    options.preferredFileNames.map((name) => join(process.cwd(), 'assets', bundledRoot, name)),
  );

  return uniquePaths([...packagedCandidates, ...developmentCandidates]);
}

export function resolveBundledDriverExePath(options: {
  installerSubDir: string;
  preferredFileNames: string[];
}) {
  const candidates = getBundledDriverExeCandidates(options);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return '';
}

export async function runBundledDriverExeWithUac(options: {
  installerPath: string;
  method: WindowsSpdDriverInstallResponse['method'] | WindowsMtkDriverInstallResponse['method'];
}): Promise<WindowsSpdDriverInstallResponse | WindowsMtkDriverInstallResponse> {
  const escapedPath = options.installerPath.replace(/'/g, "''");
  const signalController = new AbortController();
  try {
    await runCommandWithAbort({
      command: 'powershell',
      args: [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Start-Process -FilePath '${escapedPath}' -Verb RunAs -Wait`,
      ],
      cwd: process.cwd(),
      timeoutMs: 600000,
      signal: signalController.signal,
      onProcess: () => {},
    });

    return {
      ok: true,
      attempted: true,
      method: options.method,
      detail: `Driver installer completed: ${options.installerPath}.`,
    };
  } catch (error) {
    return {
      ok: false,
      attempted: true,
      method: options.method,
      error: `Driver installer failed: ${formatError(error)}`,
      detail: `Installer path: ${options.installerPath}`,
    };
  }
}
