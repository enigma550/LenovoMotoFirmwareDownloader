import { existsSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

type QdlCommandResolution = {
  command: string;
  source: 'bundled' | 'path' | 'custom';
  bundledPath?: string;
};

const qdlExecutableName = process.platform === 'win32' ? 'qdl.exe' : 'qdl';
const platformArchKey = `${process.platform}-${process.arch}`;

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}

function getBundledQdlCandidates() {
  const execPath = process.execPath;
  const argv0 = process.argv[0] || execPath;

  const packagedAppRoots = uniquePaths([
    join(execPath, '..', '..', 'Resources', 'app'),
    join(dirname(execPath), '..', 'Resources', 'app'),
    join(argv0, '..', '..', 'Resources', 'app'),
    join(dirname(argv0), '..', 'Resources', 'app'),
  ]);

  const packagedCandidates = packagedAppRoots.map((root) =>
    join(root, 'tools', 'qdl', platformArchKey, qdlExecutableName),
  );

  const developmentCandidate = join(
    process.cwd(),
    'assets',
    'tools',
    'qdl',
    platformArchKey,
    qdlExecutableName,
  );

  return uniquePaths([...packagedCandidates, developmentCandidate]);
}

function resolveCustomQdlCommand() {
  const customPath =
    Bun.env.RESCUE_QDL_PATH ||
    process.env.RESCUE_QDL_PATH ||
    Bun.env.QDL_PATH ||
    process.env.QDL_PATH ||
    '';

  const trimmedPath = customPath.trim();
  if (!trimmedPath) {
    return '';
  }

  return resolve(trimmedPath);
}

function resolveBundledQdlPath() {
  const bundledCandidates = getBundledQdlCandidates();
  for (const candidate of bundledCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return '';
}

async function ensureExecutableBitIfNeeded(filePath: string) {
  if (process.platform === 'win32') {
    return;
  }

  try {
    await chmod(filePath, 0o755);
  } catch {
    // Best effort. If chmod fails we still attempt execution.
  }
}

export async function resolveQdlCommand(): Promise<QdlCommandResolution> {
  const customQdlPath = resolveCustomQdlCommand();
  if (customQdlPath) {
    if (!existsSync(customQdlPath)) {
      throw new Error(`Configured qdl path does not exist: ${customQdlPath}`);
    }
    await ensureExecutableBitIfNeeded(customQdlPath);
    return {
      command: customQdlPath,
      source: 'custom',
      bundledPath: customQdlPath,
    };
  }

  const bundledPath = resolveBundledQdlPath();
  if (bundledPath) {
    await ensureExecutableBitIfNeeded(bundledPath);
    return {
      command: bundledPath,
      source: 'bundled',
      bundledPath,
    };
  }

  return {
    command: 'qdl',
    source: 'path',
  };
}

export function qdlCommandDisplayName(command: string) {
  if (!command || command === 'qdl') {
    return 'qdl';
  }
  return basename(command);
}
