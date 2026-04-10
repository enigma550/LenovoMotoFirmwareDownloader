/**
 * Connected device app scanning (preview) and backup.
 * Follows the same scanner pattern as connected-backups-media.ts, etc.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { BackupRestoreAppEntry } from '../../../../shared/desktop-rpc';
import { sanitizeDirectoryName } from '../../../firmware-package-utils.ts';
import {
  getInstalledPackages,
  getInstalledPackagesWithPrimaryApkPaths,
  getPackageApkPaths,
  pullSingleRemoteApk,
  runCommand,
} from './connected-backups-adb.ts';
import {
  getCachedPreviewIcon,
  getIconFromLocalApkPaths,
  setCachedPreviewIcon,
  streamIconsForPackages,
} from './connected-backups-icon.ts';
import {
  appendConnectedPreviewLog,
  beginConnectedPreviewProgress,
  finishConnectedPreviewProgress,
  getConnectedPreviewProgressState,
  isConnectedPreviewCancelled,
  setConnectedPreviewProgressState,
} from './connected-backups-progress.ts';
import {
  ADB_PULL_TIMEOUT_MS,
  type BackedUpAppRecord,
  MAX_PREVIEW_APK_PARTS_PER_APP,
} from './connected-backups-shared.ts';
import { getPathBaseName, packageDisplayName } from './connected-backups-utils.ts';

const APK_SIZE_CONCURRENCY = 1;

function buildBackupApkFileName(index: number, remoteApkPath: string) {
  const baseName = getPathBaseName(remoteApkPath).replace(/[^a-zA-Z0-9_.-]+/g, '-');
  const stableSuffix = remoteApkPath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-28);
  return `apk-${index + 1}-${baseName || 'part'}.${stableSuffix || 'apk'}.apk`;
}

async function pullAllAppApksForBackup(packageName: string, packageDir: string, timeoutMs: number) {
  const remoteApkPaths = await getPackageApkPaths(packageName);
  if (remoteApkPaths.length === 0) {
    return [] as string[];
  }

  const localApkPaths: string[] = [];
  for (const [index, remoteApkPath] of remoteApkPaths.entries()) {
    const localApkPath = join(packageDir, buildBackupApkFileName(index, remoteApkPath));
    const pulled = await pullSingleRemoteApk(remoteApkPath, localApkPath, timeoutMs);
    if (!pulled) {
      continue;
    }
    localApkPaths.push(localApkPath);
  }

  return localApkPaths;
}

async function getRemoteFileSizeSum(remotePaths: string[]) {
  if (remotePaths.length === 0) {
    return 0;
  }

  const statCommands: string[][] = [
    ['shell', 'stat', '-c', '%s', ...remotePaths],
    ['shell', 'toybox', 'stat', '-c', '%s', ...remotePaths],
  ];

  for (const command of statCommands) {
    const result = await runCommand('adb', command, 120_000);
    if (result.exitCode !== 0) {
      continue;
    }

    const sizes = result.stdoutText
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((sizeBytes) => Number.isFinite(sizeBytes) && sizeBytes >= 0);

    if (sizes.length > 0) {
      return sizes.reduce((sum, sizeBytes) => sum + sizeBytes, 0);
    }
  }

  return 0;
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex] as T, currentIndex);
    }
  });
  await Promise.all(runners);
}

async function loadInstalledApkSizes(
  packageInfos: Array<{ packageName: string; primaryApkPath?: string }>,
  onResolved: (packageName: string, sizeBytes: number) => void,
) {
  const sizeByPackage = new Map<string, number>();

  await mapWithConcurrency(packageInfos, APK_SIZE_CONCURRENCY, async (packageInfo) => {
    const remoteApkPaths = await getPackageApkPaths(packageInfo.packageName);
    const candidatePaths =
      remoteApkPaths.length > 0
        ? remoteApkPaths.slice(0, MAX_PREVIEW_APK_PARTS_PER_APP)
        : packageInfo.primaryApkPath
          ? [packageInfo.primaryApkPath]
          : [];
    const sizeBytes = await getRemoteFileSizeSum(candidatePaths);
    sizeByPackage.set(packageInfo.packageName, sizeBytes);
    onResolved(packageInfo.packageName, sizeBytes);
  });

  return sizeByPackage;
}

export async function scanConnectedAppsPreview(maxApps: number): Promise<BackupRestoreAppEntry[]> {
  const packageInfos = await getInstalledPackagesWithPrimaryApkPaths();
  if (packageInfos.length === 0) {
    beginConnectedPreviewProgress(0);
    finishConnectedPreviewProgress('No third-party apps found for connected preview.');
    return [];
  }

  const selectedPackageInfos = packageInfos.slice(0, maxApps);
  beginConnectedPreviewProgress(selectedPackageInfos.length);
  appendConnectedPreviewLog(
    `Starting scan for ${selectedPackageInfos.length} apps with progressive icon loading.`,
  );

  const appEntries: BackupRestoreAppEntry[] = selectedPackageInfos.map((packageInfo) => ({
    id: `app-${packageInfo.packageName}`,
    appName: packageDisplayName(packageInfo.packageName),
    packageName: packageInfo.packageName,
  }));
  const indexByPackage = new Map<string, number>(
    selectedPackageInfos.map((packageInfo, index) => [packageInfo.packageName, index]),
  );

  const publishAppEntries = () => {
    setConnectedPreviewProgressState({
      apps: appEntries.map((entry) => ({ ...entry })),
    });
  };

  const markCompleted = (packageName: string, iconFound: boolean) => {
    const progress = getConnectedPreviewProgressState();
    setConnectedPreviewProgressState({
      currentPackage: packageName,
      completedApps: progress.completedApps + 1,
      iconsFound: progress.iconsFound + (iconFound ? 1 : 0),
      failedIcons: progress.failedIcons + (iconFound ? 0 : 1),
    });
  };

  publishAppEntries();

  const pendingPackageNames: string[] = [];
  for (const [index, packageInfo] of selectedPackageInfos.entries()) {
    if (isConnectedPreviewCancelled()) {
      break;
    }

    const packageName = packageInfo.packageName;
    appendConnectedPreviewLog(
      `[${index + 1}/${selectedPackageInfos.length}] queued ${packageName}`,
    );

    const cachedIcon = getCachedPreviewIcon(packageName);
    if (cachedIcon?.iconDataUrl || cachedIcon?.appLabel) {
      const currentEntry = appEntries[index];
      if (!currentEntry) {
        continue;
      }

      appEntries[index] = {
        ...currentEntry,
        appName: cachedIcon.appLabel || currentEntry.appName,
        iconDataUrl: cachedIcon.iconDataUrl,
      };
      markCompleted(packageName, Boolean(cachedIcon.iconDataUrl));
      publishAppEntries();
      appendConnectedPreviewLog(`icon cache hit: ${packageName}`);
      continue;
    }

    pendingPackageNames.push(packageName);
  }

  const streamedPackages = new Set<string>();
  try {
    await streamIconsForPackages(
      pendingPackageNames,
      async ({ packageName, icon }) => {
        if (isConnectedPreviewCancelled() || streamedPackages.has(packageName)) {
          return;
        }

        streamedPackages.add(packageName);
        const index = indexByPackage.get(packageName);
        const currentEntry = index === undefined ? null : appEntries[index];
        if (!currentEntry || index === undefined) {
          return;
        }

        if (icon.dataUrl || icon.appLabel) {
          setCachedPreviewIcon(packageName, {
            iconDataUrl: icon.dataUrl,
            appLabel: icon.appLabel,
          });
        }

        appEntries[index] = {
          ...currentEntry,
          appName: icon.appLabel || currentEntry.appName,
          iconDataUrl: icon.dataUrl,
        };
        markCompleted(packageName, Boolean(icon.dataUrl));
        publishAppEntries();
        appendConnectedPreviewLog(
          icon.dataUrl
            ? `icon resolved for ${packageName}${icon.sourceEntryPath ? ` -> ${icon.sourceEntryPath}` : ''}`
            : `no icon resolved for ${packageName}`,
        );
      },
      appendConnectedPreviewLog,
    );
  } catch (error) {
    appendConnectedPreviewLog(
      `icon stream failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (const packageName of pendingPackageNames) {
    if (streamedPackages.has(packageName) || isConnectedPreviewCancelled()) {
      continue;
    }

    markCompleted(packageName, false);
    publishAppEntries();
    appendConnectedPreviewLog(`no icon resolved for ${packageName}`);
  }

  const progress = getConnectedPreviewProgressState();
  appendConnectedPreviewLog(
    `scan complete: ${progress.iconsFound}/${selectedPackageInfos.length} icons resolved`,
  );

  await loadInstalledApkSizes(selectedPackageInfos, (packageName, sizeBytes) => {
    const index = indexByPackage.get(packageName);
    const currentEntry = index === undefined ? null : appEntries[index];
    if (!currentEntry || index === undefined) {
      return;
    }

    appEntries[index] = {
      ...currentEntry,
      sizeBytes,
    };
    publishAppEntries();
  }).catch((error) => {
    appendConnectedPreviewLog(
      `app size estimate failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new Map<string, number>();
  });

  return appEntries;
}

export async function backupAppsToSnapshot(options: {
  snapshotPath: string;
  maxApps: number;
  includeApps: boolean;
  selectedPackages?: Set<string>;
}) {
  if (!options.includeApps) {
    return [] as BackedUpAppRecord[];
  }

  const packages = await getInstalledPackages();
  if (packages.length === 0) {
    return [] as BackedUpAppRecord[];
  }

  const appsDir = join(options.snapshotPath, 'apps');
  await mkdir(appsDir, { recursive: true });
  const backedUpApps: BackedUpAppRecord[] = [];

  const candidatePackages =
    options.selectedPackages && options.selectedPackages.size > 0
      ? packages.filter((packageName) => options.selectedPackages?.has(packageName))
      : packages;

  for (const packageName of candidatePackages.slice(0, options.maxApps)) {
    const packageDir = join(appsDir, sanitizeDirectoryName(packageName));
    await mkdir(packageDir, { recursive: true });

    const localApkPaths = await pullAllAppApksForBackup(
      packageName,
      packageDir,
      ADB_PULL_TIMEOUT_MS,
    );
    if (localApkPaths.length === 0) {
      continue;
    }

    let sizeBytes: number | undefined;
    try {
      let sumBytes = 0;
      for (const localApkPath of localApkPaths) {
        sumBytes += (await stat(localApkPath)).size;
      }
      sizeBytes = sumBytes;
    } catch {
      // Ignore metadata failures.
    }

    let iconPath: string | undefined;
    const icon = await getIconFromLocalApkPaths({
      packageName,
      localApkPaths,
    });

    if (icon.bytes && icon.extension) {
      const iconFileName = `icon${icon.extension}`;
      const iconFilePath = join(packageDir, iconFileName);
      await writeFile(iconFilePath, icon.bytes);
      iconPath = relative(options.snapshotPath, iconFilePath);
    }

    backedUpApps.push({
      id: `app-${packageName}`,
      appName: icon.appLabel || packageDisplayName(packageName),
      packageName,
      sizeBytes,
      iconPath,
      apkRelativePath: relative(options.snapshotPath, localApkPaths[0] || ''),
      apkRelativePaths: localApkPaths.map((localApkPath) =>
        relative(options.snapshotPath, localApkPath),
      ),
    });
  }

  return backedUpApps;
}
