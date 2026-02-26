import { existsSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

type WdiSimpleCommandResolution = {
  command: string;
  source: 'bundled' | 'path' | 'custom';
  bundledPath?: string;
};

const executableName = process.platform === 'win32' ? 'wdi-simple.exe' : 'wdi-simple';
const platformArchKey = `${process.platform}-${process.arch}`;

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}

function getBundledCandidates() {
  const execPath = process.execPath;
  const argv0 = process.argv[0] || execPath;

  const packagedAppRoots = uniquePaths([
    join(execPath, '..', '..', 'Resources', 'app'),
    join(dirname(execPath), '..', 'Resources', 'app'),
    join(argv0, '..', '..', 'Resources', 'app'),
    join(dirname(argv0), '..', 'Resources', 'app'),
  ]);

  const packagedCandidates = packagedAppRoots.map((root) =>
    join(root, 'tools', 'wdi', platformArchKey, executableName),
  );

  const developmentCandidate = join(
    process.cwd(),
    'assets',
    'tools',
    'wdi',
    platformArchKey,
    executableName,
  );

  return uniquePaths([...packagedCandidates, developmentCandidate]);
}

function resolveCustomWdiSimpleCommand() {
  const customPath =
    Bun.env.RESCUE_WDI_SIMPLE_PATH ||
    process.env.RESCUE_WDI_SIMPLE_PATH ||
    Bun.env.WDI_SIMPLE_PATH ||
    process.env.WDI_SIMPLE_PATH ||
    '';

  const trimmedPath = customPath.trim();
  if (!trimmedPath) {
    return '';
  }

  return resolve(trimmedPath);
}

function resolveBundledWdiSimplePath() {
  const candidates = getBundledCandidates();
  for (const candidate of candidates) {
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

export async function resolveWdiSimpleCommand(): Promise<WdiSimpleCommandResolution> {
  const customPath = resolveCustomWdiSimpleCommand();
  if (customPath) {
    if (!existsSync(customPath)) {
      throw new Error(`Configured wdi-simple path does not exist: ${customPath}`);
    }

    await ensureExecutableBitIfNeeded(customPath);
    return {
      command: customPath,
      source: 'custom',
      bundledPath: customPath,
    };
  }

  const bundledPath = resolveBundledWdiSimplePath();
  if (bundledPath) {
    await ensureExecutableBitIfNeeded(bundledPath);
    return {
      command: bundledPath,
      source: 'bundled',
      bundledPath,
    };
  }

  return {
    command: executableName,
    source: 'path',
  };
}

export function wdiSimpleCommandDisplayName(command: string) {
  if (!command || command === executableName) {
    return executableName;
  }

  return basename(command);
}
