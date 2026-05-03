import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BuildArch, BuildPlatform, BuildTarget } from '../lib/build-env.ts';
import { readEnvFlag, readEnvValue, resolveBuildTarget } from '../lib/build-env.ts';
import { commandExists } from '../lib/process.ts';

export const GPLAYDL_VERSION = '2.1.5';
export const PYINSTALLER_VERSION = '6.19.0';
export const LINUX_MANYLINUX_SHARED_PYTHON_VERSION = '3.11.15';

export type GplaydlContainerPlan = {
  image: string;
  installerPython: string;
  platform: 'linux/amd64' | 'linux/arm64';
  python: string;
  pythonSourceDir: string;
  pythonTarballUrl: string;
};

export type GplaydlBuildContext = {
  binaryName: string;
  buildFlavor: string;
  buildRoot: string;
  container: GplaydlContainerPlan | null;
  distDir: string;
  forcePrepare: boolean;
  metadataPath: string;
  mplConfigDir: string;
  outputBinaryPath: string;
  outputDir: string;
  pythonExecutable: string;
  sitePackagesDir: string;
  sourceEntryPath: string;
  specDir: string;
  target: BuildTarget;
  workDir: string;
};

export function binaryNameForPlatform(targetPlatform: BuildPlatform): string {
  return targetPlatform === 'win32' ? 'gplaydl.exe' : 'gplaydl';
}

function resolveLinuxContainerImage(targetArch: BuildArch): string {
  if (targetArch === 'arm64') {
    return 'quay.io/pypa/manylinux2014_aarch64';
  }
  if (targetArch === 'x64') {
    return 'quay.io/pypa/manylinux2014_x86_64';
  }
  throw new Error(`[GPLAYDL] Unsupported Linux target arch for manylinux build: ${targetArch}`);
}

function resolveLinuxContainerPlatform(targetArch: BuildArch): GplaydlContainerPlan['platform'] {
  if (targetArch === 'arm64') return 'linux/arm64';
  if (targetArch === 'x64') return 'linux/amd64';
  throw new Error(`[GPLAYDL] Unsupported Linux target arch for manylinux build: ${targetArch}`);
}

function resolveLinuxContainerPython(targetArch: BuildArch): string {
  if (targetArch === 'arm64' || targetArch === 'x64') {
    return '/work/python-shared/bin/python3';
  }
  throw new Error(`[GPLAYDL] Unsupported Linux target arch for manylinux build: ${targetArch}`);
}

function resolveLinuxContainerInstallerPython(targetArch: BuildArch): string {
  if (targetArch === 'arm64' || targetArch === 'x64') {
    return '/opt/python/cp311-cp311/bin/python';
  }
  throw new Error(`[GPLAYDL] Unsupported Linux target arch for manylinux build: ${targetArch}`);
}

function resolveLinuxContainerPythonTarballUrl(): string {
  return `https://www.python.org/ftp/python/${LINUX_MANYLINUX_SHARED_PYTHON_VERSION}/Python-${LINUX_MANYLINUX_SHARED_PYTHON_VERSION}.tgz`;
}

function resolveLinuxContainerPythonSourceDir(): string {
  return `Python-${LINUX_MANYLINUX_SHARED_PYTHON_VERSION}`;
}

function resolvePythonExecutable(): string {
  return readEnvValue('LMFD_PYTHON', 'python3') || 'python3';
}

function shouldUseLinuxContainer(
  target: BuildTarget,
  options: { forceHostPrepare: boolean; repoRoot: string },
): boolean {
  return (
    target.platform === 'linux' &&
    !options.forceHostPrepare &&
    process.platform === 'linux' &&
    commandExists('podman', options.repoRoot)
  );
}

function resolveContainerPlan(target: BuildTarget): GplaydlContainerPlan {
  return {
    image: resolveLinuxContainerImage(target.arch),
    installerPython: resolveLinuxContainerInstallerPython(target.arch),
    platform: resolveLinuxContainerPlatform(target.arch),
    python: resolveLinuxContainerPython(target.arch),
    pythonSourceDir: resolveLinuxContainerPythonSourceDir(),
    pythonTarballUrl: resolveLinuxContainerPythonTarballUrl(),
  };
}

function resolveBuildFlavor(container: GplaydlContainerPlan | null): string {
  if (!container) {
    return 'host';
  }
  return `podman:${container.image}:cpython-shared-${LINUX_MANYLINUX_SHARED_PYTHON_VERSION}`;
}

export function loadGplaydlBuildContext(repoRoot = process.cwd()): GplaydlBuildContext {
  const target = resolveBuildTarget({ label: 'GPLAYDL' });
  const binaryName = binaryNameForPlatform(target.platform);
  const outputDir = join(repoRoot, 'assets', 'tools', 'gplaydl', target.platform);
  const buildRoot = join(tmpdir(), 'lmfd-gplaydl-build', target.key);
  const forceHostPrepare = readEnvFlag('GPLAYDL_FORCE_HOST_PREPARE');
  const container = shouldUseLinuxContainer(target, { forceHostPrepare, repoRoot })
    ? resolveContainerPlan(target)
    : null;

  return {
    binaryName,
    buildFlavor: resolveBuildFlavor(container),
    buildRoot,
    container,
    distDir: join(buildRoot, 'dist'),
    forcePrepare: readEnvFlag('GPLAYDL_FORCE_PREPARE'),
    metadataPath: join(outputDir, 'release.json'),
    mplConfigDir: join(buildRoot, 'mplconfig'),
    outputBinaryPath: join(outputDir, binaryName),
    outputDir,
    pythonExecutable: resolvePythonExecutable(),
    sitePackagesDir: join(buildRoot, 'site-packages'),
    sourceEntryPath: join(buildRoot, 'site-packages', 'gplaydl', '__main__.py'),
    specDir: join(buildRoot, 'spec'),
    target,
    workDir: join(buildRoot, 'work'),
  };
}
