import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { BuildPlatform } from './lib/build-env.ts';
import { resolveBuildTarget } from './lib/build-env.ts';
import { commandExists } from './lib/process.ts';

const REPO_ROOT = process.cwd();

function ffmpegBinaryNameForPlatform(targetPlatform: BuildPlatform) {
  return targetPlatform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function hasSystemFfmpegInPath() {
  return commandExists('ffmpeg', REPO_ROOT);
}

async function resolveStaticFfmpegPath(targetPlatform: BuildPlatform) {
  try {
    const ffmpegStaticModule = (await import('ffmpeg-static')) as Record<string, unknown>;
    const staticPathCandidate = ffmpegStaticModule.default ?? ffmpegStaticModule;
    const staticPath = typeof staticPathCandidate === 'string' ? staticPathCandidate.trim() : '';
    if (!staticPath) {
      return '';
    }

    const resolvedPath = resolve(staticPath);
    if (existsSync(resolvedPath)) {
      return resolvedPath;
    }

    // Some local Windows installs of ffmpeg-static expose an .exe path while
    // the downloaded binary is present without the extension.
    if (resolvedPath.endsWith('.exe')) {
      const extensionlessPath = resolvedPath.slice(0, -4);
      if (existsSync(extensionlessPath)) {
        return extensionlessPath;
      }
    }

    const exePath = `${resolvedPath}.exe`;
    if (existsSync(exePath)) {
      return exePath;
    }

    const siblingBaseName = ffmpegBinaryNameForPlatform(targetPlatform).replace(/\.exe$/i, '');
    const siblingCandidates = [
      join(dirname(resolvedPath), siblingBaseName),
      join(dirname(resolvedPath), `${siblingBaseName}.exe`),
    ];
    for (const candidate of siblingCandidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return '';
  } catch {
    return '';
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
  const target = resolveBuildTarget({ allowIa32: true, label: 'FFMPEG' });
  const targetPlatform = target.platform;
  const platformArchKey = target.key;
  const binaryName = ffmpegBinaryNameForPlatform(targetPlatform);

  console.log(`[FFMPEG] Preparing fallback binary for ${platformArchKey} (${binaryName})...`);

  const staticFfmpegPath = await resolveStaticFfmpegPath(targetPlatform);
  if (!staticFfmpegPath) {
    if (hasSystemFfmpegInPath()) {
      console.warn(
        `[FFMPEG] Could not resolve ffmpeg-static binary for ${platformArchKey}. Falling back to system ffmpeg in PATH only.`,
      );
      return;
    }
    console.warn(`[FFMPEG] Could not resolve ffmpeg-static binary for ${platformArchKey}.`);
    return;
  }

  const outputDir = join(REPO_ROOT, 'assets', 'tools', 'ffmpeg', platformArchKey);
  const outputBinaryPath = join(outputDir, binaryName);
  await mkdir(outputDir, { recursive: true });
  await copyFile(staticFfmpegPath, outputBinaryPath);
  await ensureExecutableBitIfNeeded(targetPlatform, outputBinaryPath);

  await writeFile(
    join(outputDir, 'release.json'),
    JSON.stringify(
      {
        source: 'ffmpeg-static',
        platform: targetPlatform,
        arch: target.arch,
        binaryName,
        copiedFrom: staticFfmpegPath,
        copiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`[FFMPEG] Bundled fallback ready at ${outputBinaryPath}`);
}

await main();
