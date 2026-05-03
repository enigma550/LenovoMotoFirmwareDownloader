import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rmdir, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { finished } from 'node:stream/promises';
import type {
  DownloadProgressMessage,
  PlayStoreAppDetailsResponse,
  PlayStoreDeleteDownloadRequest,
  PlayStoreDeleteDownloadResponse,
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

type AppStoreDownloadProgressEmitter = (progress: DownloadProgressMessage) => void;

type AppStoreDownloadProgressState = {
  downloadedBytes: number;
  downloadId: string;
  emitProgress?: AppStoreDownloadProgressEmitter;
  packageName: string;
  title: string;
  totalBytes?: number;
};

type FileSnapshotEntry = {
  fileName: string;
  fullPath: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: number;
};

type DownloadedAppMetadata = {
  iconDataUrl?: string;
  packageName: string;
  title?: string;
};

const APP_STORE_METADATA_FILE_NAME = 'app.lmfd.json';
const APP_STORE_ICON_FILE_PREFIX = 'icon.';

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

function getPackageDownloadDirectory(downloadRoot: string, packageName: string) {
  return join(downloadRoot, sanitizeFileName(packageName, 'app'));
}

function isAppStoreSidecarFile(fileName: string) {
  return (
    fileName === APP_STORE_METADATA_FILE_NAME || fileName.startsWith(APP_STORE_ICON_FILE_PREFIX)
  );
}

function isInstallArtifactFile(fileName: string) {
  const normalized = fileName.toLowerCase();
  return normalized.endsWith('.apk') || normalized.endsWith('.obb');
}

function iconExtensionFromResponse(response: Response, sourceUrl: string) {
  const contentType = response.headers.get('content-type')?.toLowerCase() || '';
  if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
    return 'jpg';
  }
  if (contentType.includes('image/webp')) {
    return 'webp';
  }
  if (contentType.includes('image/png')) {
    return 'png';
  }

  const pathExtension = new URL(sourceUrl).pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return pathExtension && ['jpg', 'jpeg', 'png', 'webp'].includes(pathExtension)
    ? pathExtension.replace('jpeg', 'jpg')
    : 'png';
}

function iconMimeTypeFromFileName(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') {
    return 'image/jpeg';
  }
  if (extension === 'webp') {
    return 'image/webp';
  }
  return 'image/png';
}

async function readIconDataUrl(iconPath: string) {
  const content = await readFile(iconPath).catch(() => null);
  if (!content) {
    return undefined;
  }

  return `data:${iconMimeTypeFromFileName(iconPath)};base64,${content.toString('base64')}`;
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

async function loadDownloadedAppMetadata(
  artifacts: PlayStoreDownloadResponse['artifacts'],
): Promise<Map<string, DownloadedAppMetadata>> {
  const metadata = new Map<string, DownloadedAppMetadata>();
  const iconsByDirectory = new Map<string, PlayStoreDownloadResponse['artifacts'][number]>();

  for (const artifact of artifacts) {
    if (artifact.fileName.startsWith(APP_STORE_ICON_FILE_PREFIX)) {
      iconsByDirectory.set(dirname(artifact.fullPath), artifact);
      continue;
    }

    if (artifact.fileName !== APP_STORE_METADATA_FILE_NAME) {
      continue;
    }

    const raw = await readFile(artifact.fullPath, 'utf8').catch(() => '');
    const parsed = raw
      ? await Promise.resolve()
          .then(() => JSON.parse(raw) as Partial<DownloadedAppMetadata> & { iconFileName?: string })
          .catch(() => null)
      : null;
    if (!parsed) {
      continue;
    }

    const packageName = parsed?.packageName?.trim();
    if (!packageName) {
      continue;
    }

    const iconPath = parsed.iconFileName
      ? join(dirname(artifact.fullPath), parsed.iconFileName)
      : iconsByDirectory.get(dirname(artifact.fullPath))?.fullPath;
    metadata.set(packageName, {
      iconDataUrl: iconPath ? await readIconDataUrl(iconPath) : undefined,
      packageName,
      title: parsed.title?.trim() || undefined,
    });
  }

  for (const [directory, iconArtifact] of iconsByDirectory.entries()) {
    const packageName = basename(directory);
    if (!packageName || metadata.has(packageName)) {
      continue;
    }

    metadata.set(packageName, {
      iconDataUrl: await readIconDataUrl(iconArtifact.fullPath),
      packageName,
    });
  }

  return metadata;
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
  metadata = new Map<string, DownloadedAppMetadata>(),
): PlayStoreDownloadsResponse['downloads'] {
  const groups = new Map<
    string,
    {
      id: string;
      iconDataUrl?: string;
      packageName: string;
      title?: string;
      versionCode?: string;
      totalSizeBytes: number;
      modifiedAt: number;
      apkArtifactCount: number;
      extraArtifactCount: number;
      artifacts: PlayStoreDownloadResponse['artifacts'];
    }
  >();

  for (const artifact of artifacts) {
    if (isAppStoreSidecarFile(artifact.fileName) || !isInstallArtifactFile(artifact.fileName)) {
      continue;
    }

    const parsed = parsePlayStoreArtifactGroup(artifact.fileName);
    const packageName = parsed?.packageName || artifact.fileName.replace(/\.[^.]+$/, '');
    const versionCode = parsed?.versionCode;
    const groupKey = versionCode ? `${packageName}@${versionCode}` : packageName;
    const appMetadata = metadata.get(packageName);
    const current =
      groups.get(groupKey) ||
      ({
        apkArtifactCount: 0,
        artifacts: [],
        extraArtifactCount: 0,
        iconDataUrl: appMetadata?.iconDataUrl,
        id: groupKey,
        modifiedAt: 0,
        packageName,
        title: appMetadata?.title,
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

function appStoreDownloadId(packageName: string) {
  return `app-store:${packageName}`;
}

function emitAppStoreDownloadProgress(
  progress: AppStoreDownloadProgressState | undefined,
  status: DownloadProgressMessage['status'],
  patch: Partial<Pick<AppStoreDownloadProgressState, 'downloadedBytes' | 'title' | 'totalBytes'>> &
    Pick<Partial<DownloadProgressMessage>, 'error' | 'savePath'> = {},
) {
  if (!progress?.emitProgress) {
    return;
  }

  if (typeof patch.downloadedBytes === 'number') {
    progress.downloadedBytes = patch.downloadedBytes;
  }
  if (typeof patch.totalBytes === 'number' && Number.isFinite(patch.totalBytes)) {
    progress.totalBytes = patch.totalBytes;
  }
  if (patch.title) {
    progress.title = patch.title;
  }

  progress.emitProgress({
    commandSource: 'app-store',
    downloadId: progress.downloadId,
    downloadedBytes: progress.downloadedBytes,
    error: patch.error,
    phase: 'download',
    romName: progress.title,
    romUrl: progress.packageName,
    savePath: patch.savePath,
    status,
    totalBytes: progress.totalBytes,
  });
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
  onProgress?: (downloadedBytes: number, totalBytes?: number) => void;
  session: PlayStoreSession;
  totalBytes?: number;
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

  const responseTotalBytes = Number(response.headers.get('content-length') || 0);
  const totalBytes =
    options.totalBytes && options.totalBytes > 0
      ? options.totalBytes
      : responseTotalBytes > 0
        ? responseTotalBytes
        : undefined;
  const temporaryPath = `${options.destinationPath}.tmp`;
  await unlink(temporaryPath).catch(() => undefined);

  if (!response.body) {
    await Bun.write(temporaryPath, response);
    options.onProgress?.(totalBytes || 0, totalBytes);
    await rename(temporaryPath, options.destinationPath);
    return;
  }

  const reader = response.body.getReader();
  const writer = createWriteStream(temporaryPath);
  let downloadedBytes = 0;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }

      const buffer = Buffer.from(chunk.value);
      if (!writer.write(buffer)) {
        await once(writer, 'drain');
      }
      downloadedBytes += buffer.byteLength;
      options.onProgress?.(downloadedBytes, totalBytes);
    }
  } finally {
    writer.end();
    await finished(writer);
    reader.releaseLock();
  }

  await rename(temporaryPath, options.destinationPath);
}

async function saveDownloadedAppSidecars(options: {
  downloadDirectory: string;
  iconUrl?: string;
  packageName: string;
  title?: string;
}) {
  await mkdir(options.downloadDirectory, { recursive: true });

  let iconFileName: string | undefined;
  const iconUrl = options.iconUrl?.trim();
  if (iconUrl) {
    const response = await fetch(iconUrl).catch(() => null);
    if (response?.ok) {
      const iconExtension = iconExtensionFromResponse(response, iconUrl);
      iconFileName = `${APP_STORE_ICON_FILE_PREFIX}${iconExtension}`;
      const iconPath = join(options.downloadDirectory, iconFileName);
      const temporaryIconPath = `${iconPath}.tmp`;
      await unlink(temporaryIconPath).catch(() => undefined);
      await Bun.write(temporaryIconPath, response);
      await rename(temporaryIconPath, iconPath);
    }
  }

  const metadataPath = join(options.downloadDirectory, APP_STORE_METADATA_FILE_NAME);
  await Bun.write(
    metadataPath,
    JSON.stringify(
      {
        iconFileName,
        iconSourceUrl: iconUrl || undefined,
        packageName: options.packageName,
        title: options.title?.trim() || options.packageName,
      },
      null,
      2,
    ),
  );
}

async function downloadAuroraPlayStoreApp(options: {
  downloadRoot: string;
  packageName: string;
  payload: PlayStoreDownloadRequest;
  progress?: AppStoreDownloadProgressState;
}) {
  await withPlayStoreClient(options.payload.arch, async (client, session) => {
    const app = await client.details(options.packageName);
    emitAppStoreDownloadProgress(options.progress, 'starting', {
      downloadedBytes: 0,
      title: app.details.title || options.packageName,
    });
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

    const knownTotalBytes = files.reduce(
      (total, file) => total + (Number.isFinite(file.sizeBytes) ? file.sizeBytes : 0),
      0,
    );
    const totalBytes = knownTotalBytes > 0 ? knownTotalBytes : undefined;
    let downloadedBeforeFile = 0;
    emitAppStoreDownloadProgress(options.progress, 'downloading', {
      downloadedBytes: 0,
      totalBytes,
    });

    for (const file of files) {
      const destinationPath = join(
        options.downloadRoot,
        sanitizeFileName(file.fileName, 'app.apk'),
      );
      let lastFileDownloadedBytes = 0;
      await downloadPlayStoreFile({
        cookies: file.cookies,
        destinationPath,
        onProgress: (fileDownloadedBytes, fileTotalBytes) => {
          lastFileDownloadedBytes = fileDownloadedBytes;
          emitAppStoreDownloadProgress(options.progress, 'downloading', {
            downloadedBytes: downloadedBeforeFile + fileDownloadedBytes,
            totalBytes: totalBytes || fileTotalBytes,
          });
        },
        session,
        totalBytes: file.sizeBytes,
        url: file.url,
      });
      downloadedBeforeFile += file.sizeBytes || lastFileDownloadedBytes;
    }
  });
}

async function downloadWithApkMirrorFallback(options: {
  auroraError: unknown;
  downloadRoot: string;
  packageName: string;
  payload: PlayStoreDownloadRequest;
  progress?: AppStoreDownloadProgressState;
}) {
  try {
    emitAppStoreDownloadProgress(options.progress, 'downloading', {
      downloadedBytes: 0,
      totalBytes: undefined,
    });
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

function isPathInsideDirectory(rootPath: string, filePath: string) {
  const normalizedRoot = resolve(rootPath);
  const normalizedFilePath = resolve(filePath);
  return (
    normalizedFilePath === normalizedRoot ||
    normalizedFilePath.startsWith(`${normalizedRoot}${sep}`)
  );
}

async function removeEmptyDownloadParents(rootPath: string, filePath: string) {
  const normalizedRoot = resolve(rootPath);
  let currentDirectory = dirname(resolve(filePath));

  while (
    currentDirectory !== normalizedRoot &&
    isPathInsideDirectory(normalizedRoot, currentDirectory)
  ) {
    const entries = await readdir(currentDirectory).catch(() => []);
    if (entries.length > 0) {
      break;
    }

    await rmdir(currentDirectory).catch(() => undefined);
    currentDirectory = dirname(currentDirectory);
  }
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
    const metadata = await loadDownloadedAppMetadata(artifacts);
    return {
      downloadRoot,
      downloads: summarizeDownloadedGroups(artifacts, metadata),
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
  emitProgress?: AppStoreDownloadProgressEmitter,
): Promise<PlayStoreDownloadResponse> {
  const packageName = payload.packageName.trim();
  const downloadRoot = getAppStoreDownloadDirectory();
  const packageDownloadRoot = packageName
    ? getPackageDownloadDirectory(downloadRoot, packageName)
    : downloadRoot;
  const progress: AppStoreDownloadProgressState | undefined = packageName
    ? {
        downloadedBytes: 0,
        downloadId: appStoreDownloadId(packageName),
        emitProgress,
        packageName,
        title: payload.title?.trim() || packageName,
      }
    : undefined;

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
    await mkdir(packageDownloadRoot, { recursive: true });
    const before = await snapshotDownloadedFiles(downloadRoot);
    emitAppStoreDownloadProgress(progress, 'starting', { downloadedBytes: 0 });

    try {
      await downloadAuroraPlayStoreApp({
        downloadRoot: packageDownloadRoot,
        packageName,
        payload,
        progress,
      });
    } catch (auroraError) {
      await downloadWithApkMirrorFallback({
        auroraError,
        downloadRoot: packageDownloadRoot,
        packageName,
        payload,
        progress,
      });
    }

    await saveDownloadedAppSidecars({
      downloadDirectory: packageDownloadRoot,
      iconUrl: payload.iconUrl,
      packageName,
      title: progress?.title || payload.title,
    });

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
    const artifacts = summarizeDownloadedArtifacts(downloadRoot, changed).filter(
      (artifact) =>
        !isAppStoreSidecarFile(artifact.fileName) && isInstallArtifactFile(artifact.fileName),
    );
    const downloadedBytes =
      progress?.totalBytes ||
      artifacts.reduce((total, artifact) => total + (artifact.sizeBytes || 0), 0);
    emitAppStoreDownloadProgress(progress, 'completed', {
      downloadedBytes,
      savePath: artifacts[0]?.fullPath,
      totalBytes: downloadedBytes,
    });

    return {
      artifacts,
      downloadRoot,
      ok: true,
      packageName,
    };
  } catch (error) {
    emitAppStoreDownloadProgress(progress, 'failed', {
      error: errorMessage(error, 'Download failed.'),
    });
    return {
      artifacts: [],
      downloadRoot,
      error: errorMessage(error, 'Download failed.'),
      ok: false,
      packageName,
    };
  }
}

export async function deletePlayStoreDownload(
  payload: PlayStoreDeleteDownloadRequest,
): Promise<PlayStoreDeleteDownloadResponse> {
  const packageName = payload.packageName.trim();
  const downloadRoot = getAppStoreDownloadDirectory();
  const artifactPaths = Array.from(
    new Set(payload.artifactPaths.map((artifactPath) => artifactPath.trim()).filter(Boolean)),
  );

  if (!packageName) {
    return {
      deletedArtifactCount: 0,
      error: 'Missing package name.',
      ok: false,
      packageName: '',
    };
  }

  if (artifactPaths.length === 0) {
    return {
      deletedArtifactCount: 0,
      error: 'No downloaded APK files were provided for deletion.',
      ok: false,
      packageName,
    };
  }

  try {
    let deletedArtifactCount = 0;
    const touchedDirectories = new Set<string>();
    for (const artifactPath of artifactPaths) {
      if (!isPathInsideDirectory(downloadRoot, artifactPath)) {
        throw new Error(
          `Refusing to delete a file outside the App Store download directory: ${artifactPath}`,
        );
      }

      touchedDirectories.add(dirname(artifactPath));
      const info = await stat(artifactPath).catch(() => null);
      if (!info?.isFile()) {
        continue;
      }

      await unlink(artifactPath);
      deletedArtifactCount += 1;
      await removeEmptyDownloadParents(downloadRoot, artifactPath);
    }

    for (const directory of touchedDirectories) {
      const entries = await readdir(directory).catch(() => []);
      for (const entry of entries) {
        if (isAppStoreSidecarFile(entry)) {
          await unlink(join(directory, entry)).catch(() => undefined);
        }
      }
      await rmdir(directory).catch(() => undefined);
      await removeEmptyDownloadParents(downloadRoot, join(directory, 'deleted'));
    }

    return {
      deletedArtifactCount,
      ok: true,
      packageName,
    };
  } catch (error) {
    return {
      deletedArtifactCount: 0,
      error: errorMessage(error, 'Delete failed.'),
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
