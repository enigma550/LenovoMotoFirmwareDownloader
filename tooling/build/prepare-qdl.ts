import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BuildArch, BuildPlatform } from './lib/build-env.ts';
import { resolveBuildTarget } from './lib/build-env.ts';
import { runCommand } from './lib/process.ts';

const REPO_ROOT = process.cwd();
const QDL_REPO_WEB = 'https://github.com/linux-msm/qdl';
const QDL_REPO_API = 'https://api.github.com/repos/linux-msm/qdl';
const QDL_RELEASE_TAG = (Bun.env.QDL_RELEASE_TAG || process.env.QDL_RELEASE_TAG || 'latest').trim();
const SKIP_PREPARE =
  (Bun.env.QDL_SKIP_PREPARE || process.env.QDL_SKIP_PREPARE || '').trim().toLowerCase() === '1';
const MAX_RELEASE_CHECKS = 3;
const DOWNLOAD_ATTEMPTS = 1;

if (SKIP_PREPARE) {
  console.log('[QDL] Skipping QDL prepare because QDL_SKIP_PREPARE=1');
  process.exit(0);
}

function resolveAssetName(targetPlatform: BuildPlatform, targetArch: BuildArch) {
  if (targetPlatform === 'darwin') {
    return targetArch === 'arm64' ? 'qdl-binary-macos-arm64.zip' : 'qdl-binary-macos-intel.zip';
  }

  if (targetPlatform === 'win32') {
    return `qdl-binary-windows-${targetArch}.zip`;
  }

  if (targetPlatform === 'linux') {
    return `qdl-binary-ubuntu-24-${targetArch}.zip`;
  }

  throw new Error(`[QDL] Unsupported platform for asset resolution: ${targetPlatform}`);
}

function shouldRetryStatus(status: number) {
  return (
    status === 403 ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function wait(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function buildGitHubHeaders(accept: string) {
  const headers: Record<string, string> = {
    ['Accept']: accept,
    'User-Agent': 'LMFD-qdl-prep',
  };

  const token =
    Bun.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN || Bun.env.GH_TOKEN || process.env.GH_TOKEN;
  if (token?.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  return headers;
}

type GitHubReleaseAsset = Record<string, unknown>;
type GitHubRelease = Record<string, unknown>;

interface QdlReleaseSelection {
  tag: string;
  assetName: string;
  downloadUrl: string;
}

function readReleaseTag(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function findReleaseAsset(release: GitHubRelease, targetAssetName: string) {
  const releaseAssets = release['assets'];
  if (!Array.isArray(releaseAssets)) return null;

  for (const asset of releaseAssets as GitHubReleaseAsset[]) {
    const assetName = typeof asset.name === 'string' ? asset.name.trim() : '';
    const browserDownloadUrl = asset['browser_download_url'];
    const downloadUrl = typeof browserDownloadUrl === 'string' ? browserDownloadUrl.trim() : '';
    if (!assetName || !downloadUrl) continue;
    if (assetName === targetAssetName) {
      return {
        assetName,
        downloadUrl,
      };
    }
  }

  return null;
}

async function fetchWithRetry(options: {
  url: string;
  headers: Record<string, string>;
  label: string;
  attempts?: number;
}) {
  const attempts =
    Number.isFinite(options.attempts) && (options.attempts ?? 0) > 0
      ? Math.trunc(options.attempts as number)
      : 1;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(options.url, {
        headers: options.headers,
        redirect: 'follow',
      });

      if (response.ok) {
        return response;
      }

      const summary = `${response.status} ${response.statusText}`.trim();
      const retryable = shouldRetryStatus(response.status);
      if (!retryable || attempt >= attempts) {
        throw new Error(`[QDL] ${options.label} failed (${summary}) at ${options.url}`);
      }

      const delayMs = attempt * 3000;
      console.warn(
        `[QDL] ${options.label} failed (${summary}), retrying in ${Math.round(delayMs / 1000)}s ` +
          `(attempt ${attempt}/${attempts})...`,
      );
      await wait(delayMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= attempts) {
        break;
      }

      const delayMs = attempt * 3000;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[QDL] ${options.label} request error (${message}), retrying in ${Math.round(delayMs / 1000)}s ` +
          `(attempt ${attempt}/${attempts})...`,
      );
      await wait(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`[QDL] ${options.label} failed after ${attempts} attempts.`);
}

async function findFileRecursive(rootDir: string, fileName: string): Promise<string> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileRecursive(fullPath, fileName);
      if (nested) {
        return nested;
      }
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return fullPath;
    }
  }

  return '';
}

async function selectQdlReleaseForAsset(targetAssetName: string): Promise<QdlReleaseSelection> {
  const apiHeaders = buildGitHubHeaders('application/vnd.github+json');
  if (QDL_RELEASE_TAG !== 'latest') {
    const byTagResponse = await fetchWithRetry({
      url: `${QDL_REPO_API}/releases/tags/${encodeURIComponent(QDL_RELEASE_TAG)}`,
      headers: apiHeaders,
      label: `resolve release ${QDL_RELEASE_TAG}`,
      attempts: DOWNLOAD_ATTEMPTS,
    });
    const byTagJson = (await byTagResponse.json()) as GitHubRelease;
    const selectedAsset = findReleaseAsset(byTagJson, targetAssetName);
    if (!selectedAsset) {
      throw new Error(
        `[QDL] Release ${QDL_RELEASE_TAG} does not contain required asset ${targetAssetName}.`,
      );
    }

    return {
      tag: readReleaseTag(byTagJson['tag_name']) || QDL_RELEASE_TAG,
      assetName: selectedAsset.assetName,
      downloadUrl: selectedAsset.downloadUrl,
    };
  }

  const releasesResponse = await fetchWithRetry({
    url: `${QDL_REPO_API}/releases?per_page=${MAX_RELEASE_CHECKS}`,
    headers: apiHeaders,
    label: 'list recent releases',
    attempts: DOWNLOAD_ATTEMPTS,
  });
  const releasesJson = (await releasesResponse.json()) as unknown;
  if (!Array.isArray(releasesJson) || releasesJson.length === 0) {
    throw new Error('[QDL] Could not retrieve release list from GitHub.');
  }

  const checkedTags: string[] = [];
  for (const release of releasesJson.slice(0, MAX_RELEASE_CHECKS) as GitHubRelease[]) {
    const releaseTag = readReleaseTag(release['tag_name']);
    if (!releaseTag) continue;
    checkedTags.push(releaseTag);

    const selectedAsset = findReleaseAsset(release, targetAssetName);
    if (!selectedAsset) {
      console.warn(
        `[QDL] Release ${releaseTag} has no ${targetAssetName}, checking older release...`,
      );
      continue;
    }

    return {
      tag: releaseTag,
      assetName: selectedAsset.assetName,
      downloadUrl: selectedAsset.downloadUrl,
    };
  }

  throw new Error(
    `[QDL] No compatible ${targetAssetName} asset found in the latest ${MAX_RELEASE_CHECKS} releases` +
      (checkedTags.length ? ` (${checkedTags.join(', ')})` : '.'),
  );
}

async function downloadQdlAsset(selection: QdlReleaseSelection) {
  const downloadUrl = selection.downloadUrl;

  const response = await fetchWithRetry({
    url: downloadUrl,
    headers: buildGitHubHeaders('application/octet-stream'),
    label: `download ${selection.assetName} from ${selection.tag}`,
    attempts: Number.isFinite(DOWNLOAD_ATTEMPTS) ? DOWNLOAD_ATTEMPTS : 4,
  });

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error(`[QDL] Downloaded asset is empty: ${downloadUrl}`);
  }

  return {
    bytes,
    downloadUrl,
  };
}

async function main() {
  const target = resolveBuildTarget({ label: 'QDL' });
  const targetPlatform = target.platform;
  const targetArch = target.arch;
  const platformArchKey = target.key;
  const targetAssetName = resolveAssetName(targetPlatform, targetArch);
  const executableName = targetPlatform === 'win32' ? 'qdl.exe' : 'qdl';

  console.log(
    `[QDL] Preparing bundled qdl for ${platformArchKey} (requested: ${QDL_RELEASE_TAG})...`,
  );

  const tempBaseDir = join(
    tmpdir(),
    `lmfd-qdl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  );
  const tempZipPath = join(tempBaseDir, targetAssetName);
  const tempExtractDir = join(tempBaseDir, 'extract');

  await mkdir(tempExtractDir, { recursive: true });

  const selectedRelease = await selectQdlReleaseForAsset(targetAssetName);
  console.log(
    `[QDL] Downloading ${selectedRelease.assetName} from release ${selectedRelease.tag} (${QDL_REPO_WEB})...`,
  );
  const downloaded = await downloadQdlAsset(selectedRelease);
  await writeFile(tempZipPath, downloaded.bytes);

  if (targetPlatform === 'win32') {
    const escapedZipPath = tempZipPath.replace(/'/g, "''");
    const escapedExtractDir = tempExtractDir.replace(/'/g, "''");
    const psCommand = [
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `$zipPath = '${escapedZipPath}'`,
      `$extractDir = '${escapedExtractDir}'`,
      "if (Test-Path -LiteralPath $extractDir) { Remove-Item -LiteralPath (Join-Path $extractDir '*') -Recurse -Force -ErrorAction SilentlyContinue }",
      '[System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractDir)',
    ].join('; ');
    runCommand({
      args: ['-NoProfile', '-Command', psCommand],
      command: 'powershell',
      label: 'QDL',
      stderr: 'pipe',
      stdout: 'pipe',
    });
  } else {
    runCommand({
      args: ['-o', tempZipPath, '-d', tempExtractDir],
      command: 'unzip',
      label: 'QDL',
      stderr: 'pipe',
      stdout: 'pipe',
    });
  }

  const discoveredExecutable = await findFileRecursive(tempExtractDir, executableName);
  if (!discoveredExecutable) {
    throw new Error(`[QDL] Extracted archive does not contain ${executableName}.`);
  }

  const outputDir = resolve(REPO_ROOT, 'assets', 'tools', 'qdl', platformArchKey);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  await cp(tempExtractDir, outputDir, { recursive: true, force: true });

  const bundledExecutablePath = join(outputDir, executableName);
  if (!existsSync(bundledExecutablePath)) {
    const extractedExecutableBuffer = await readFile(discoveredExecutable);
    await writeFile(bundledExecutablePath, new Uint8Array(extractedExecutableBuffer));
  }

  if (targetPlatform !== 'win32') {
    await chmod(bundledExecutablePath, 0o755);
  }

  await writeFile(
    join(outputDir, 'release.json'),
    JSON.stringify(
      {
        source: 'linux-msm/qdl',
        requestedRelease: QDL_RELEASE_TAG,
        release: selectedRelease.tag,
        asset: selectedRelease.assetName,
        downloadedAt: new Date().toISOString(),
        downloadUrl: downloaded.downloadUrl,
      },
      null,
      2,
    ),
  );

  await writeFile(join(outputDir, '.gitkeep'), '');

  await rm(tempBaseDir, { recursive: true, force: true });

  console.log(`[QDL] Bundled qdl ready at ${bundledExecutablePath}`);
}

await main();
