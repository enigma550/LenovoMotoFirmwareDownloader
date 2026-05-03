import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  GPLAYDL_VERSION,
  type GplaydlBuildContext,
  loadGplaydlBuildContext,
  PYINSTALLER_VERSION,
} from './gplaydl/config.ts';
import { buildGplaydlInContainer, buildGplaydlOnHost } from './gplaydl/pyinstaller.ts';
import { readJsonFileIfExists, writeJsonFile } from './lib/tool-metadata.ts';

type GplaydlMetadata = {
  arch?: string;
  buildFlavor?: string;
  gplaydlVersion?: string;
  platform?: string;
  pyinstallerVersion?: string;
};

function metadataMatches(metadata: GplaydlMetadata | null, context: GplaydlBuildContext): boolean {
  return (
    metadata?.gplaydlVersion === GPLAYDL_VERSION &&
    metadata?.pyinstallerVersion === PYINSTALLER_VERSION &&
    metadata?.platform === context.target.platform &&
    metadata?.arch === context.target.arch &&
    metadata?.buildFlavor === context.buildFlavor
  );
}

async function ensureExecutableBitIfNeeded(context: GplaydlBuildContext): Promise<void> {
  if (context.target.platform === 'win32') {
    return;
  }

  try {
    await chmod(context.outputBinaryPath, 0o755);
  } catch {
    // Best effort.
  }
}

async function resetBuildDirectories(context: GplaydlBuildContext): Promise<void> {
  await mkdir(context.outputDir, { recursive: true });
  await mkdir(context.buildRoot, { recursive: true });
  await mkdir(context.mplConfigDir, { recursive: true });
  await rm(context.distDir, { force: true, recursive: true });
  await rm(context.workDir, { force: true, recursive: true });
  await rm(context.specDir, { force: true, recursive: true });
}

function createMetadata(
  context: GplaydlBuildContext,
  builtBinaryPath: string,
): Record<string, unknown> {
  return {
    arch: context.target.arch,
    binaryName: context.binaryName,
    buildFlavor: context.buildFlavor,
    containerImage: context.container?.image,
    containerInstallerPython: context.container?.installerPython,
    containerPlatform: context.container?.platform,
    containerPython: context.container?.python,
    containerPythonTarballUrl: context.container?.pythonTarballUrl,
    copiedFrom: builtBinaryPath,
    gplaydlVersion: GPLAYDL_VERSION,
    platform: context.target.platform,
    preparedAt: new Date().toISOString(),
    pyinstallerVersion: PYINSTALLER_VERSION,
    pythonExecutable: context.pythonExecutable,
    source: 'pyinstaller',
  };
}

async function main(): Promise<void> {
  const context = loadGplaydlBuildContext();
  const builtBinaryPath = join(context.distDir, context.binaryName);
  const existingMetadata = await readJsonFileIfExists<GplaydlMetadata>(context.metadataPath);

  if (
    !context.forcePrepare &&
    existsSync(context.outputBinaryPath) &&
    metadataMatches(existingMetadata, context)
  ) {
    console.log(`[GPLAYDL] Bundled sidecar already ready at ${context.outputBinaryPath}`);
    return;
  }

  console.log(
    `[GPLAYDL] Preparing bundled sidecar for ${context.target.key} (${context.buildFlavor})...`,
  );

  await resetBuildDirectories(context);

  if (context.container) {
    buildGplaydlInContainer(context);
  } else {
    buildGplaydlOnHost(context);
  }

  if (!existsSync(builtBinaryPath)) {
    throw new Error(`[GPLAYDL] PyInstaller did not produce ${builtBinaryPath}`);
  }

  await copyFile(builtBinaryPath, context.outputBinaryPath);
  await ensureExecutableBitIfNeeded(context);
  await writeJsonFile(context.metadataPath, createMetadata(context, builtBinaryPath));

  console.log(`[GPLAYDL] Bundled sidecar ready at ${context.outputBinaryPath}`);
}

await main();
