import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const GPLAYDL_VERSION = '2.1.5';
const PYINSTALLER_VERSION = '6.19.0';

function normalizeTargetPlatform() {
  const rawOs = (Bun.env.ELECTROBUN_OS || process.env.ELECTROBUN_OS || process.platform).trim();
  if (rawOs === 'mac' || rawOs === 'darwin') return 'darwin';
  if (rawOs === 'win' || rawOs === 'windows' || rawOs === 'win32') return 'win32';
  if (rawOs === 'linux') return 'linux';
  throw new Error(`[GPLAYDL] Unsupported target OS: ${rawOs}`);
}

function normalizeTargetArch() {
  const rawArch = (Bun.env.ELECTROBUN_ARCH || process.env.ELECTROBUN_ARCH || process.arch)
    .trim()
    .toLowerCase();
  if (rawArch === 'x64' || rawArch === 'amd64') return 'x64';
  if (rawArch === 'arm64' || rawArch === 'aarch64') return 'arm64';
  throw new Error(`[GPLAYDL] Unsupported target arch: ${rawArch}`);
}

function binaryNameForPlatform(targetPlatform: string) {
  return targetPlatform === 'win32' ? 'gplaydl.exe' : 'gplaydl';
}

function resolvePythonExecutable() {
  return (Bun.env.LMFD_PYTHON || process.env.LMFD_PYTHON || 'python3').trim() || 'python3';
}

async function readExistingMetadata(metadataPath: string) {
  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    const text = await readFile(metadataPath, 'utf8');
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function runCommand(command: string, args: string[], env: Record<string, string>) {
  const result = Bun.spawnSync([command, ...args], {
    cwd: REPO_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
    env,
  });

  if (result.exitCode !== 0) {
    throw new Error(`[GPLAYDL] Command failed: ${command} ${args.join(' ')}`);
  }
}

async function ensureExecutableBitIfNeeded(targetPlatform: string, filePath: string) {
  if (targetPlatform === 'win32') {
    return;
  }

  try {
    await chmod(filePath, 0o755);
  } catch {
    // Best effort.
  }
}

async function main() {
  const targetPlatform = normalizeTargetPlatform();
  const targetArch = normalizeTargetArch();
  const binaryName = binaryNameForPlatform(targetPlatform);
  const outputDir = join(REPO_ROOT, 'assets', 'tools', 'gplaydl', targetPlatform);
  const outputBinaryPath = join(outputDir, binaryName);
  const metadataPath = join(outputDir, 'release.json');
  const forcePrepare =
    (Bun.env.GPLAYDL_FORCE_PREPARE || process.env.GPLAYDL_FORCE_PREPARE || '').trim() === '1';

  const existingMetadata = await readExistingMetadata(metadataPath);
  const metadataMatches =
    existingMetadata?.['gplaydlVersion'] === GPLAYDL_VERSION &&
    existingMetadata?.['pyinstallerVersion'] === PYINSTALLER_VERSION &&
    existingMetadata?.['platform'] === targetPlatform &&
    existingMetadata?.['arch'] === targetArch;

  if (!forcePrepare && existsSync(outputBinaryPath) && metadataMatches) {
    console.log(`[GPLAYDL] Bundled sidecar already ready at ${outputBinaryPath}`);
    return;
  }

  const pythonExecutable = resolvePythonExecutable();
  const buildRoot = join(tmpdir(), 'lmfd-gplaydl-build', `${targetPlatform}-${targetArch}`);
  const sitePackagesDir = join(buildRoot, 'site-packages');
  const distDir = join(buildRoot, 'dist');
  const workDir = join(buildRoot, 'work');
  const specDir = join(buildRoot, 'spec');
  const mplConfigDir = join(buildRoot, 'mplconfig');
  const sourceEntryPath = join(sitePackagesDir, 'gplaydl', '__main__.py');
  const builtBinaryPath = join(distDir, binaryName);

  console.log(`[GPLAYDL] Preparing bundled sidecar for ${targetPlatform}-${targetArch}...`);

  await mkdir(outputDir, { recursive: true });
  await mkdir(buildRoot, { recursive: true });
  await mkdir(mplConfigDir, { recursive: true });
  await rm(distDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
  await rm(specDir, { recursive: true, force: true });

  runCommand(
    pythonExecutable,
    [
      '-m',
      'pip',
      'install',
      '--upgrade',
      '--target',
      sitePackagesDir,
      `pyinstaller==${PYINSTALLER_VERSION}`,
      `gplaydl==${GPLAYDL_VERSION}`,
    ],
    {
      ...process.env,
      ['PYTHONNOUSERSITE']: '1',
    } as Record<string, string>,
  );

  if (!existsSync(sourceEntryPath)) {
    throw new Error(`[GPLAYDL] Could not locate gplaydl entrypoint at ${sourceEntryPath}`);
  }

  runCommand(
    pythonExecutable,
    [
      '-m',
      'PyInstaller',
      '--noconfirm',
      '--clean',
      '--onefile',
      sourceEntryPath,
      '--name',
      'gplaydl',
      '--distpath',
      distDir,
      '--workpath',
      workDir,
      '--specpath',
      specDir,
      '--exclude-module',
      'IPython',
      '--exclude-module',
      'matplotlib',
      '--exclude-module',
      'numpy',
      '--exclude-module',
      'tkinter',
    ],
    {
      ...process.env,
      ['PYTHONPATH']: sitePackagesDir,
      ['PYTHONNOUSERSITE']: '1',
      ['MPLCONFIGDIR']: mplConfigDir,
    } as Record<string, string>,
  );

  if (!existsSync(builtBinaryPath)) {
    throw new Error(`[GPLAYDL] PyInstaller did not produce ${builtBinaryPath}`);
  }

  await copyFile(builtBinaryPath, outputBinaryPath);
  await ensureExecutableBitIfNeeded(targetPlatform, outputBinaryPath);

  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        source: 'pyinstaller',
        platform: targetPlatform,
        arch: targetArch,
        binaryName,
        gplaydlVersion: GPLAYDL_VERSION,
        pyinstallerVersion: PYINSTALLER_VERSION,
        pythonExecutable,
        copiedFrom: builtBinaryPath,
        preparedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`[GPLAYDL] Bundled sidecar ready at ${outputBinaryPath}`);
}

await main();
