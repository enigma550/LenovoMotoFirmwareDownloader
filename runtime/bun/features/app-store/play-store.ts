import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, relative } from 'node:path';
import type {
  PlayStoreAppDetailsResponse,
  PlayStoreDownloadRequest,
  PlayStoreDownloadResponse,
  PlayStoreDownloadsResponse,
  PlayStoreInstallRequest,
  PlayStoreInstallResponse,
  PlayStoreSearchRequest,
  PlayStoreSearchResponse,
  PlayStoreStatusResponse,
} from '../../../shared/desktop-rpc';
import { getAppStoreDownloadDirectory, sanitizeFileName } from '../../firmware-package-utils.ts';
import {
  checkAdbConnected,
  runCommand,
  withSharedAdbCommandSession,
} from '../backup-restore/connected/connected-backups-adb.ts';
import { ADB_INSTALL_TIMEOUT_MS } from '../backup-restore/connected/connected-backups-shared.ts';
import {
  downloadApkMirrorFallbackApp,
  getApkMirrorFallbackAppDetails,
} from './apkmirror-client.ts';
import { GooglePlayClient, PlayStoreHttpError } from './google-play-client.ts';
import { searchGooglePlayWebApps } from './google-play-web-search.ts';
import {
  getPlayStoreAuthProfiles,
  getPlayStoreSession,
  invalidatePlayStoreSession,
  PlayStoreAuthError,
  type PlayStoreSession,
} from './play-store-auth.ts';

type FileSnapshotEntry = {
  fileName: string;
  fullPath: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: number;
};

async function snapshotDownloadedFiles(rootPath: string) {
  const snapshots = new Map<string, FileSnapshotEntry>();
  if (!existsSync(rootPath)) {
    return snapshots;
  }

  const pending = [rootPath];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    if (!currentPath) {
      continue;
    }

    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const info = await stat(entryPath).catch(() => null);
      if (!info) {
        continue;
      }

      snapshots.set(entryPath, {
        fileName: basename(entryPath),
        fullPath: entryPath,
        modifiedAt: info.mtimeMs,
        relativePath: entryPath.replace(/\\/g, '/'),
        sizeBytes: info.size,
      });
    }
  }

  return snapshots;
}

function summarizeDownloadedArtifacts(rootPath: string, snapshots: Map<string, FileSnapshotEntry>) {
  const userHome = homedir();
  return [...snapshots.values()]
    .map((entry) => ({
      fileName: entry.fileName,
      fullPath: entry.fullPath,
      modifiedAt: entry.modifiedAt,
      relativePath: entry.fullPath.startsWith(userHome)
        ? relative(userHome, entry.fullPath).replace(/\\/g, '/')
        : relative(rootPath, entry.fullPath).replace(/\\/g, '/'),
      sizeBytes: entry.sizeBytes,
    }))
    .sort(
      (left, right) =>
        right.modifiedAt - left.modifiedAt || left.fileName.localeCompare(right.fileName),
    );
}

function parsePlayStoreArtifactGroup(fileName: string) {
  const match = fileName.match(/^([A-Za-z0-9._]+)-(\d+)(?:-(.+))?\.([A-Za-z0-9]+)$/);
  if (!match) {
    return null;
  }

  const [, packageName = '', versionCode = '', suffix = '', extension = ''] = match;
  return {
    extension: extension.toLowerCase(),
    packageName,
    suffix: suffix || '',
    versionCode,
  };
}

async function listDownloadedArtifacts(rootPath: string) {
  const snapshots = await snapshotDownloadedFiles(rootPath);
  return summarizeDownloadedArtifacts(rootPath, snapshots);
}

function installArtifactSort(left: string, right: string) {
  const leftName = basename(left).toLowerCase();
  const rightName = basename(right).toLowerCase();
  const leftIsBase = /-\d+\.apk$/i.test(leftName);
  const rightIsBase = /-\d+\.apk$/i.test(rightName);
  if (leftIsBase !== rightIsBase) {
    return leftIsBase ? -1 : 1;
  }
  return leftName.localeCompare(rightName);
}

function summarizeDownloadedGroups(
  artifacts: PlayStoreDownloadResponse['artifacts'],
): PlayStoreDownloadsResponse['downloads'] {
  const groups = new Map<
    string,
    {
      id: string;
      packageName: string;
      versionCode?: string;
      totalSizeBytes: number;
      modifiedAt: number;
      apkArtifactCount: number;
      extraArtifactCount: number;
      artifacts: PlayStoreDownloadResponse['artifacts'];
    }
  >();

  for (const artifact of artifacts) {
    const parsed = parsePlayStoreArtifactGroup(artifact.fileName);
    const packageName = parsed?.packageName || artifact.fileName.replace(/\.[^.]+$/, '');
    const versionCode = parsed?.versionCode;
    const groupKey = versionCode ? `${packageName}@${versionCode}` : packageName;
    const current =
      groups.get(groupKey) ||
      ({
        apkArtifactCount: 0,
        artifacts: [],
        extraArtifactCount: 0,
        id: groupKey,
        modifiedAt: 0,
        packageName,
        totalSizeBytes: 0,
        versionCode,
      } satisfies PlayStoreDownloadsResponse['downloads'][number]);

    current.totalSizeBytes += artifact.sizeBytes || 0;
    current.modifiedAt = Math.max(current.modifiedAt, artifact.modifiedAt || 0);
    if (artifact.fileName.toLowerCase().endsWith('.apk')) {
      current.apkArtifactCount += 1;
    } else {
      current.extraArtifactCount += 1;
    }
    current.artifacts.push(artifact);
    groups.set(groupKey, current);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      artifacts: group.artifacts.sort((left, right) =>
        installArtifactSort(left.fileName, right.fileName),
      ),
    }))
    .sort(
      (left, right) =>
        right.modifiedAt - left.modifiedAt || left.packageName.localeCompare(right.packageName),
    );
}

function defaultArch(arch: PlayStoreSearchRequest['arch']) {
  return arch === 'armv7' ? 'armv7' : 'arm64';
}

async function normalizeInstallArtifactPaths(artifactPaths: string[]) {
  const uniqueByHash = new Set<string>();
  const normalized: string[] = [];

  for (const artifactPath of artifactPaths.sort(installArtifactSort)) {
    if (!artifactPath.toLowerCase().endsWith('.apk')) {
      continue;
    }

    const content = await readFile(artifactPath).catch(() => null);
    if (!content) {
      continue;
    }

    const fingerprint = createHash('sha256').update(content).digest('hex');
    if (uniqueByHash.has(fingerprint)) {
      continue;
    }

    uniqueByHash.add(fingerprint);
    normalized.push(artifactPath);
  }

  return normalized;
}

async function checkInstalledPackage(packageName: string) {
  const result = await runCommand(
    'adb',
    ['shell', 'pm', 'path', packageName],
    ADB_INSTALL_TIMEOUT_MS,
  );
  if (result.exitCode !== 0) {
    return false;
  }

  return /^package:/im.test(result.stdoutText);
}

async function installViaMicroG(packageName: string, artifactPaths: string[]) {
  const hasMicroGVending = await checkInstalledPackage('com.android.vending');
  if (!hasMicroGVending) {
    return {
      error:
        'microG install requires a com.android.vending-compatible package on the device. It was not detected.',
      installMode: 'microg' as const,
      installedArtifactCount: artifactPaths.length,
      ok: false,
      packageName,
    } satisfies PlayStoreInstallResponse;
  }

  const installArgs =
    artifactPaths.length > 1
      ? ['install-multiple', '-r', '-i', 'com.android.vending', ...artifactPaths]
      : ['install', '-r', '-i', 'com.android.vending', artifactPaths[0] || ''];

  const installResult = await runCommand('adb', installArgs, ADB_INSTALL_TIMEOUT_MS);
  if (installResult.exitCode !== 0) {
    return {
      error:
        installResult.stderrText.trim() ||
        installResult.stdoutText.trim() ||
        installResult.error ||
        'microG-compatible install failed.',
      installMode: 'microg' as const,
      installedArtifactCount: artifactPaths.length,
      ok: false,
      packageName,
    } satisfies PlayStoreInstallResponse;
  }

  return {
    detail:
      installResult.stdoutText.trim() ||
      'Installed using the com.android.vending-compatible installer identity.',
    installMode: 'microg' as const,
    installedArtifactCount: artifactPaths.length,
    ok: true,
    packageName,
  } satisfies PlayStoreInstallResponse;
}

function isRetryableAuthFailure(error: unknown) {
  if (error instanceof PlayStoreAuthError) {
    return true;
  }
  return error instanceof PlayStoreHttpError && (error.status === 401 || error.status === 403);
}

async function withPlayStoreClient<T>(
  arch: PlayStoreSearchRequest['arch'],
  action: (client: GooglePlayClient, session: PlayStoreSession) => Promise<T>,
) {
  const selectedArch = defaultArch(arch);
  const profiles = await getPlayStoreAuthProfiles();
  const maxAttempts = Math.max(1, profiles.accounts.length);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const forceRefresh = attempt > 0;
    const session = await getPlayStoreSession(selectedArch, forceRefresh);
    const client = new GooglePlayClient(session);
    try {
      return await action(client, session);
    } catch (error) {
      lastError = error;
      if (!isRetryableAuthFailure(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      invalidatePlayStoreSession(selectedArch);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function downloadPlayStoreFile(options: {
  cookies: string;
  destinationPath: string;
  session: PlayStoreSession;
  url: string;
}) {
  const headers = new Headers();
  headers.set('Cookie', options.cookies);
  headers.set('User-Agent', options.session.userAgent);

  const response = await fetch(options.url, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`APK download failed with HTTP ${response.status}.`);
  }

  const temporaryPath = `${options.destinationPath}.tmp`;
  await unlink(temporaryPath).catch(() => undefined);
  await Bun.write(temporaryPath, response);
  await rename(temporaryPath, options.destinationPath);
}

async function downloadAuroraPlayStoreApp(options: {
  downloadRoot: string;
  packageName: string;
  payload: PlayStoreDownloadRequest;
}) {
  await withPlayStoreClient(options.payload.arch, async (client, session) => {
    const app = await client.details(options.packageName);
    if (!app.versionCode) {
      throw new Error(`Google Play did not return a version code for ${options.packageName}.`);
    }
    if (app.priceMicros > 0n) {
      throw new Error('Only public/free Play Store apps are supported.');
    }

    const files = await client.purchaseDownloadFiles({
      includeExtras: options.payload.includeExtras !== false,
      includeSplits: options.payload.includeSplits !== false,
      offerType: app.offerType,
      packageName: options.packageName,
      versionCode: app.versionCode,
    });

    for (const file of files) {
      const destinationPath = join(
        options.downloadRoot,
        sanitizeFileName(file.fileName, 'app.apk'),
      );
      await downloadPlayStoreFile({
        cookies: file.cookies,
        destinationPath,
        session,
        url: file.url,
      });
    }
  });
}

async function downloadWithApkMirrorFallback(options: {
  auroraError: unknown;
  downloadRoot: string;
  packageName: string;
  payload: PlayStoreDownloadRequest;
}) {
  try {
    await downloadApkMirrorFallbackApp({
      arch: options.payload.arch,
      downloadRoot: options.downloadRoot,
      packageName: options.packageName,
    });
  } catch (fallbackError) {
    throw new Error(
      `Aurora download failed: ${errorMessage(options.auroraError, 'Unknown error')}. ` +
        `APKMirror fallback failed: ${errorMessage(fallbackError, 'Unknown error')}.`,
    );
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : String(error || fallback);
}

async function fillMissingDetailsFromApkMirror(
  details: NonNullable<PlayStoreAppDetailsResponse['data']>,
) {
  if (details.versionCode && details.versionName) {
    return details;
  }

  const fallback = await getApkMirrorFallbackAppDetails(details.packageName).catch(() => null);
  if (!fallback) {
    return details;
  }

  return {
    ...fallback,
    ...details,
    developer: details.developer || fallback.developer,
    downloads: details.downloads || fallback.downloads,
    playUrl: details.playUrl || fallback.playUrl,
    title: details.title && details.title !== details.packageName ? details.title : fallback.title,
    versionCode: details.versionCode || fallback.versionCode,
    versionName: details.versionName || fallback.versionName,
  };
}

export async function getPlayStoreStatus(): Promise<PlayStoreStatusResponse> {
  const profiles = await getPlayStoreAuthProfiles();
  const downloadRoot = getAppStoreDownloadDirectory();
  const sourceCount =
    profiles.source === 'dispenser' ? profiles.dispensers.length : profiles.accounts.length;

  return {
    authProfileCount: sourceCount,
    authProfilePath: profiles.sourcePath,
    authProfileSource: profiles.source,
    backend: 'aurora-dispenser',
    available: sourceCount > 0,
    downloadRoot,
    error: sourceCount > 0 ? undefined : profiles.error,
    ok: true,
  };
}

export async function listPlayStoreDownloads(): Promise<PlayStoreDownloadsResponse> {
  const downloadRoot = getAppStoreDownloadDirectory();
  if (!existsSync(downloadRoot)) {
    return {
      downloadRoot,
      downloads: [],
      ok: true,
    };
  }

  try {
    const artifacts = await listDownloadedArtifacts(downloadRoot);
    return {
      downloadRoot,
      downloads: summarizeDownloadedGroups(artifacts),
      ok: true,
    };
  } catch (error) {
    return {
      downloadRoot,
      downloads: [],
      error: errorMessage(error, 'Could not read Play Store downloads.'),
      ok: false,
    };
  }
}

export async function searchPlayStoreApps(
  payload: PlayStoreSearchRequest,
): Promise<PlayStoreSearchResponse> {
  const query = payload.query.trim();
  if (!query) {
    return {
      error: 'Enter a search query first.',
      ok: false,
      results: [],
    };
  }

  try {
    const results = await searchGooglePlayWebApps(
      query,
      Math.max(1, Math.min(payload.limit || 12, 30)),
    );
    return {
      ok: true,
      results,
    };
  } catch (error) {
    return {
      error: errorMessage(error, 'Search failed.'),
      ok: false,
      results: [],
    };
  }
}

export async function getPlayStoreAppDetails(payload: {
  packageName: string;
  arch?: PlayStoreSearchRequest['arch'];
}): Promise<PlayStoreAppDetailsResponse> {
  const packageName = payload.packageName.trim();
  if (!packageName) {
    return {
      error: 'Missing package name.',
      ok: false,
    };
  }

  try {
    const details = await withPlayStoreClient(payload.arch, async (client) => {
      return (await client.details(packageName)).details;
    });
    return {
      data: await fillMissingDetailsFromApkMirror(details),
      ok: true,
    };
  } catch (error) {
    try {
      return {
        data: await getApkMirrorFallbackAppDetails(packageName),
        ok: true,
      };
    } catch (fallbackError) {
      return {
        error:
          `${errorMessage(error, 'Could not load app details.')} ` +
          `APKMirror fallback failed: ${errorMessage(fallbackError, 'Could not load fallback details.')}`,
        ok: false,
      };
    }
  }
}

export async function downloadPlayStoreApp(
  payload: PlayStoreDownloadRequest,
): Promise<PlayStoreDownloadResponse> {
  const packageName = payload.packageName.trim();
  const downloadRoot = getAppStoreDownloadDirectory();
  if (!packageName) {
    return {
      artifacts: [],
      downloadRoot,
      error: 'Missing package name.',
      ok: false,
      packageName: '',
    };
  }

  try {
    await mkdir(downloadRoot, { recursive: true });
    const before = await snapshotDownloadedFiles(downloadRoot);

    try {
      await downloadAuroraPlayStoreApp({ downloadRoot, packageName, payload });
    } catch (auroraError) {
      await downloadWithApkMirrorFallback({ auroraError, downloadRoot, packageName, payload });
    }

    const after = await snapshotDownloadedFiles(downloadRoot);
    const changed = new Map<string, FileSnapshotEntry>();
    for (const [pathValue, entry] of after.entries()) {
      const previous = before.get(pathValue);
      if (
        !previous ||
        previous.modifiedAt !== entry.modifiedAt ||
        previous.sizeBytes !== entry.sizeBytes
      ) {
        changed.set(pathValue, entry);
      }
    }

    return {
      artifacts: summarizeDownloadedArtifacts(downloadRoot, changed),
      downloadRoot,
      ok: true,
      packageName,
    };
  } catch (error) {
    return {
      artifacts: [],
      downloadRoot,
      error: errorMessage(error, 'Download failed.'),
      ok: false,
      packageName,
    };
  }
}

export async function installPlayStoreApp(
  payload: PlayStoreInstallRequest,
): Promise<PlayStoreInstallResponse> {
  const packageName = payload.packageName.trim();
  const installMode = payload.mode === 'microg' ? 'microg' : 'standard';
  const artifactPaths = await normalizeInstallArtifactPaths(
    payload.artifactPaths
      .map((artifactPath: string) => artifactPath.trim())
      .filter((artifactPath: string) => artifactPath.length > 0 && existsSync(artifactPath))
      .sort(installArtifactSort),
  );

  if (!packageName) {
    return {
      error: 'Missing package name.',
      installMode,
      installedArtifactCount: 0,
      ok: false,
      packageName: '',
    };
  }

  if (artifactPaths.length === 0) {
    return {
      error: 'No downloaded APK files were provided for installation.',
      installMode,
      installedArtifactCount: 0,
      ok: false,
      packageName,
    };
  }

  const connection = await checkAdbConnected();
  if (!connection.connected) {
    return {
      error: connection.detail,
      installMode,
      installedArtifactCount: 0,
      ok: false,
      packageName,
    };
  }

  if (installMode === 'microg') {
    return withSharedAdbCommandSession(() => installViaMicroG(packageName, artifactPaths));
  }

  const installArgs =
    artifactPaths.length > 1
      ? ['install-multiple', '-r', ...artifactPaths]
      : ['install', '-r', artifactPaths[0] || ''];

  const result = await withSharedAdbCommandSession(() =>
    runCommand('adb', installArgs, ADB_INSTALL_TIMEOUT_MS),
  );

  if (result.exitCode !== 0) {
    return {
      error:
        result.stderrText.trim() || result.stdoutText.trim() || result.error || 'Install failed.',
      installMode,
      installedArtifactCount: artifactPaths.length,
      ok: false,
      packageName,
    };
  }

  return {
    detail: result.stdoutText.trim() || 'Install completed.',
    installMode,
    installedArtifactCount: artifactPaths.length,
    ok: true,
    packageName,
  };
}
