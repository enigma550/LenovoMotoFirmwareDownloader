import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type {
  WindowsQdloaderDriverInstallResponse,
  WindowsQdloaderDriverStatusResponse,
} from '../../../../shared/rpc.ts';
import { runCommandWithAbort } from '../device-flasher.ts';
import { formatError } from './windows-driver-installer-shared.ts';

export type WindowsQdloaderDriverEnsureResult = {
  attempted: boolean;
  success: boolean;
  detail: string;
};

const qdloaderInfNames = [
  'qcadb.inf',
  'qcfilter.inf',
  'qcwdfmdm.inf',
  'qcwdfser.inf',
  'qcwwan.inf',
  'qdbusb.inf',
];

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}

function getBundledQdloaderInstallScriptCandidates() {
  const execPath = process.execPath;
  const argv0 = process.argv[0] || execPath;
  const platformArchKey = `${process.platform}-${process.arch}`;
  const scriptNames = ['Install.bat', 'install.bat'];

  const packagedAppRoots = uniquePaths([
    join(execPath, '..', '..', 'Resources', 'app'),
    join(dirname(execPath), '..', 'Resources', 'app'),
    join(argv0, '..', '..', 'Resources', 'app'),
    join(dirname(argv0), '..', 'Resources', 'app'),
  ]);

  const installerRoots = uniquePaths([
    // Preferred layout
    join('tools', 'drivers', platformArchKey, 'qdl', 'QUD_CustomInst_1.00.91.7'),
    join('tools', 'drivers', 'win32-x64', 'qdl', 'QUD_CustomInst_1.00.91.7'),
    // Legacy layout fallback
    join('tools', 'qdl', platformArchKey, 'QUD_CustomInst_1.00.91.7'),
    join('tools', 'qdl', 'win32-x64', 'QUD_CustomInst_1.00.91.7'),
  ]);

  const packagedCandidates = packagedAppRoots.flatMap((root) =>
    installerRoots.flatMap((installerRoot) =>
      scriptNames.map((name) => join(root, installerRoot, name)),
    ),
  );

  const developmentCandidates = installerRoots.flatMap((installerRoot) =>
    scriptNames.map((name) => join(process.cwd(), 'assets', installerRoot, name)),
  );

  return uniquePaths([...packagedCandidates, ...developmentCandidates]);
}

function getQdloaderStepDetail(qdloaderInstallScriptPath: string) {
  if (!qdloaderInstallScriptPath) {
    return (
      'Windows QDLoader driver auto-install skipped. Bundled QDLoader install script not found; ' +
      'install it manually before flashing if Qualcomm 9008 is missing.'
    );
  }

  return (
    'Windows QDLoader driver auto-install skipped. Use "Install QDLoader driver" in UI if needed. ' +
    `Bundled installer script: ${qdloaderInstallScriptPath}`
  );
}

function resolveBundledQdloaderInstallScriptPath() {
  const candidates = getBundledQdloaderInstallScriptCandidates();
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

function parseDriverProbeOutput(output: string): {
  installed: boolean;
  missingInfNames: string[];
} {
  const normalizedOutput = output.trim();
  const lines = normalizedOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.some((line) => line.toLowerCase() === 'installed')) {
    return {
      installed: true,
      missingInfNames: [],
    };
  }

  const missingLine = lines.find((line) => line.toLowerCase().startsWith('missing:')) || '';
  const missingInfNames = missingLine
    .slice('missing:'.length)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  return {
    installed: false,
    missingInfNames,
  };
}

async function probeWindowsQdloaderDriverInstallation() {
  const signalController = new AbortController();
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$repo = Join-Path $env:WINDIR 'System32\\DriverStore\\FileRepository'",
    `$targets = @(${qdloaderInfNames.map((name) => `'${name}'`).join(', ')})`,
    '$missing = @()',
    'foreach ($target in $targets) {',
    "  $pattern = $target + '_*'",
    '  $found = Get-ChildItem -Path $repo -Directory -Filter $pattern -ErrorAction SilentlyContinue | Select-Object -First 1',
    '  if (-not $found) {',
    '    $missing += $target',
    '  }',
    '}',
    'if ($missing.Count -eq 0) {',
    "  Write-Output 'installed'",
    '} else {',
    "  Write-Output ('missing:' + ($missing -join ','))",
    '}',
  ].join('; ');

  const result = await runCommandWithAbort({
    command: 'powershell',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    cwd: process.cwd(),
    timeoutMs: 20000,
    signal: signalController.signal,
    onProcess: () => {},
  });

  return parseDriverProbeOutput(`${result.stdoutText}\n${result.stderrText}`);
}

export async function getWindowsQdloaderDriverStatus(): Promise<WindowsQdloaderDriverStatusResponse> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      installed: false,
      error: 'QDLoader driver status is only available on Windows.',
      detail: 'Windows-only action.',
    };
  }

  try {
    const probe = await probeWindowsQdloaderDriverInstallation();
    if (probe.installed) {
      return {
        ok: true,
        installed: true,
        detail: 'QDLoader driver package is already installed.',
      };
    }

    const missingLabel =
      probe.missingInfNames.length > 0
        ? `Missing packages: ${probe.missingInfNames.join(', ')}.`
        : 'Missing one or more required QDLoader INF packages.';

    return {
      ok: true,
      installed: false,
      detail: `QDLoader driver package not installed. ${missingLabel}`,
    };
  } catch (error) {
    return {
      ok: false,
      installed: false,
      error: `Could not determine QDLoader driver status: ${formatError(error)}`,
    };
  }
}

export async function ensureWindowsQdloaderDriver(_options: {
  cwd: string;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
}): Promise<WindowsQdloaderDriverEnsureResult> {
  if (process.platform !== 'win32') {
    return {
      attempted: false,
      success: false,
      detail: 'Windows QDLoader driver install skipped (non-Windows host).',
    };
  }

  const status = await getWindowsQdloaderDriverStatus();
  if (status.ok && status.installed) {
    return {
      attempted: false,
      success: true,
      detail: status.detail || 'Windows QDLoader driver is already installed.',
    };
  }

  const qdloaderInstallerPath = resolveBundledQdloaderInstallScriptPath();
  return {
    attempted: false,
    success: false,
    detail: getQdloaderStepDetail(qdloaderInstallerPath),
  };
}

export async function installWindowsQdloaderDriverManually(): Promise<WindowsQdloaderDriverInstallResponse> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      attempted: false,
      method: 'qdloader-setup',
      error: 'Manual QDLoader driver install is only available on Windows.',
      detail: 'Windows-only action.',
    };
  }

  const status = await getWindowsQdloaderDriverStatus();
  if (status.ok && status.installed) {
    return {
      ok: true,
      attempted: false,
      method: 'qdloader-setup',
      detail: status.detail || 'QDLoader driver package is already installed.',
    };
  }

  const qdloaderInstallerPath = resolveBundledQdloaderInstallScriptPath();
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
          `$installer = '${escapedPath}'; Start-Process -FilePath $installer -Verb RunAs -Wait`,
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
        detail: `Driver installer completed: ${qdloaderInstallerPath}.`,
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

  return {
    ok: false,
    attempted: false,
    method: 'qdloader-setup',
    error: 'Bundled QDLoader installer script not found.',
    detail:
      'Place the installer folder at assets/tools/drivers/win32-x64/qdl/QUD_CustomInst_1.00.91.7',
  };
}
