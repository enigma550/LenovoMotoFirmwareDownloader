import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const REPO_ROOT = process.cwd();

function normalizeTargetPlatform() {
  const rawOs = (Bun.env.ELECTROBUN_OS || process.env.ELECTROBUN_OS || process.platform).trim();
  if (rawOs === 'mac' || rawOs === 'darwin') return 'darwin';
  if (rawOs === 'win' || rawOs === 'windows' || rawOs === 'win32') {
    return 'win32';
  }
  if (rawOs === 'linux') return 'linux';
  throw new Error(`[FFMPEG] Unsupported target OS: ${rawOs}`);
}

function normalizeTargetArch() {
  const rawArch = (Bun.env.ELECTROBUN_ARCH || process.env.ELECTROBUN_ARCH || process.arch)
    .trim()
    .toLowerCase();
  if (rawArch === 'x64' || rawArch === 'amd64') return 'x64';
  if (rawArch === 'arm64' || rawArch === 'aarch64') return 'arm64';
  if (rawArch === 'x86' || rawArch === 'ia32') return 'ia32';
  throw new Error(`[FFMPEG] Unsupported target arch: ${rawArch}`);
}

function ffmpegBinaryNameForPlatform(targetPlatform: string) {
  return targetPlatform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function hasSystemFfmpegInPath() {
  try {
    const result = Bun.spawnSync(['ffmpeg', '-version'], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function resolveStaticFfmpegPath() {
  try {
    const ffmpegStaticModule = (await import('ffmpeg-static')) as Record<string, unknown>;
    const staticPathCandidate = ffmpegStaticModule.default ?? ffmpegStaticModule;
    const staticPath = typeof staticPathCandidate === 'string' ? staticPathCandidate.trim() : '';
    if (!staticPath || !existsSync(staticPath)) {
      return '';
    }
    return resolve(staticPath);
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
  const targetPlatform = normalizeTargetPlatform();
  const targetArch = normalizeTargetArch();
  const platformArchKey = `${targetPlatform}-${targetArch}`;
  const binaryName = ffmpegBinaryNameForPlatform(targetPlatform);

  console.log(`[FFMPEG] Preparing fallback binary for ${platformArchKey} (${binaryName})...`);

  const staticFfmpegPath = await resolveStaticFfmpegPath();
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
        arch: targetArch,
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
