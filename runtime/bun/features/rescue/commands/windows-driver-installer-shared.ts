import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type {
  WindowsMtkDriverInstallResponse,
  WindowsSpdDriverInstallResponse,
} from '../../../../shared/rpc.ts';
import { runCommandWithAbort } from '../device-flasher.ts';

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
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
  const execPath = process.execPath;
  const argv0 = process.argv[0] || execPath;
  const platformArchKey = `${process.platform}-${process.arch}`;

  const packagedAppRoots = uniquePaths([
    join(execPath, '..', '..', 'Resources', 'app'),
    join(dirname(execPath), '..', 'Resources', 'app'),
    join(argv0, '..', '..', 'Resources', 'app'),
    join(dirname(argv0), '..', 'Resources', 'app'),
  ]);

  const bundledRoots = uniquePaths([
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
