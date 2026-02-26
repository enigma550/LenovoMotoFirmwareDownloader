import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { WindowsEdlDriverInstallResponse } from '../../../../shared/rpc.ts';
import { isCommandAvailable, runCommandWithAbort } from '../device-flasher.ts';
import { resolveWdiSimpleCommand, wdiSimpleCommandDisplayName } from './wdi-simple-command.ts';

export type WindowsEdlDriverEnsureResult = {
  attempted: boolean;
  success: boolean;
  detail: string;
};

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}

function getBundledQdloaderInstallerCandidates() {
  const execPath = process.execPath;
  const argv0 = process.argv[0] || execPath;
  const platformArchKey = `${process.platform}-${process.arch}`;
  const installerNames = [
    'QDLoader HS-USB Driver_64bit_Setup.exe',
    'QDLoader-HS-USB-Driver_64bit_Setup.exe',
    'QDLoader_HS-USB_Driver_64bit_Setup.exe',
    'QDLoaderSetup.exe',
  ];

  const packagedAppRoots = uniquePaths([
    join(execPath, '..', '..', 'Resources', 'app'),
    join(dirname(execPath), '..', 'Resources', 'app'),
    join(argv0, '..', '..', 'Resources', 'app'),
    join(dirname(argv0), '..', 'Resources', 'app'),
  ]);

  const packagedCandidates = packagedAppRoots.flatMap((root) =>
    installerNames.map((name) => join(root, 'tools', 'drivers', platformArchKey, name)),
  );

  const developmentCandidates = installerNames.map((name) =>
    join(process.cwd(), 'assets', 'tools', 'drivers', platformArchKey, name),
  );

  return uniquePaths([...packagedCandidates, ...developmentCandidates]);
}

function resolveBundledQdloaderInstallerPath() {
  const candidates = getBundledQdloaderInstallerCandidates();
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

export async function ensureWindowsEdlDriver(options: {
  cwd: string;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
}): Promise<WindowsEdlDriverEnsureResult> {
  if (process.platform !== 'win32') {
    return {
      attempted: false,
      success: false,
      detail: 'Windows EDL driver install skipped (non-Windows host).',
    };
  }

  const wdiCommand = await resolveWdiSimpleCommand();
  const displayName = wdiSimpleCommandDisplayName(wdiCommand.command);
  const available = await isCommandAvailable({
    command: wdiCommand.command,
    args: ['--help'],
    cwd: options.cwd,
    signal: options.signal,
    onProcess: options.onProcess,
  });

  if (!available) {
    return {
      attempted: false,
      success: false,
      detail: `Windows EDL driver helper not found (${displayName}). Continuing without auto-driver install.`,
    };
  }

  const args = [
    '--name',
    'Qualcomm HS-USB QDLoader 9008',
    '--vid',
    '0x05C6',
    '--pid',
    '0x9008',
    '--type',
    '0',
    '--silent',
  ];

  try {
    await runCommandWithAbort({
      command: wdiCommand.command,
      args,
      cwd: options.cwd,
      timeoutMs: 120000,
      signal: options.signal,
      onProcess: options.onProcess,
    });

    return {
      attempted: true,
      success: true,
      detail: `Windows EDL driver step completed (${displayName}).`,
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      detail:
        `Windows EDL driver step failed (${displayName}); continuing anyway. ` +
        `Details: ${formatError(error)}`,
    };
  }
}

export async function installWindowsEdlDriverManually(): Promise<WindowsEdlDriverInstallResponse> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      attempted: false,
      method: 'wdi-simple',
      error: 'Manual EDL driver install is only available on Windows.',
      detail: 'Windows-only action.',
    };
  }

  const qdloaderInstallerPath = resolveBundledQdloaderInstallerPath();
  if (qdloaderInstallerPath) {
    const escapedPath = qdloaderInstallerPath.replace(/'/g, "''");
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
        method: 'qdloader-setup',
        detail: `Driver installer completed: ${qdloaderInstallerPath}`,
      };
    } catch (error) {
      return {
        ok: false,
        attempted: true,
        method: 'qdloader-setup',
        error: `Driver installer failed: ${formatError(error)}`,
        detail: `Installer path: ${qdloaderInstallerPath}`,
      };
    }
  }

  const signalController = new AbortController();
  const fallback = await ensureWindowsEdlDriver({
    cwd: process.cwd(),
    signal: signalController.signal,
    onProcess: () => {},
  });

  return {
    ok: fallback.success,
    attempted: fallback.attempted,
    method: 'wdi-simple',
    detail: fallback.detail,
    error: fallback.success ? undefined : fallback.detail,
  };
}
