/**
 * Restore logic for backup snapshots.
 * Installs APKs from a local snapshot back onto a connected device.
 */
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, posix, relative } from 'node:path';
import type {
  RestoreBackupSnapshotRequest,
  RestoreBackupSnapshotResponse,
} from '../../../../shared/desktop-rpc';
import { notifyTaskCompleted } from '../../../desktop-notifications.ts';
import {
  resetConnectedDeviceConnection,
  withConnectedDeviceConnection,
} from '../../../device/connected-device-facade.ts';
import type { ConnectedDeviceConnection } from '../../../device/device-transport-types.ts';
import {
  asRecord,
  type JsonValue,
  sanitizeDirectoryName,
} from '../../../firmware-package-utils.ts';
import {
  restoreContactsOnDevice,
  restoreMessagesOnDevice,
} from '../on-device/restore-helper/helper-runtime.ts';
import {
  checkAdbConnected,
  runCommand,
  withSharedAdbCommandSession,
} from './connected-backups-adb.ts';
import {
  appendConnectedPreviewLog,
  beginConnectedPreviewProgress,
  failConnectedPreviewProgress,
  isConnectedPreviewCancelled,
} from './connected-backups-progress.ts';
import {
  readContactsRestoreData,
  readMessagesRestoreData,
} from './connected-backups-restore-data.ts';
import { ADB_INSTALL_TIMEOUT_MS, type BackedUpAppRecord } from './connected-backups-shared.ts';
import {
  getBackupRestoreRootPath,
  parseBackupAppsFromManifest,
} from './connected-backups-utils.ts';

function emptyRestoreResponse(
  snapshotId: string,
  input: Partial<RestoreBackupSnapshotResponse> = {},
): RestoreBackupSnapshotResponse {
  return {
    ok: false,
    connected: false,
    snapshotId,
    attemptedApps: 0,
    restoredApps: 0,
    failedApps: 0,
    attemptedMedia: 0,
    restoredMedia: 0,
    failedMedia: 0,
    attemptedContacts: 0,
    restoredContacts: 0,
    failedContacts: 0,
    attemptedMessages: 0,
    restoredMessages: 0,
    failedMessages: 0,
    attemptedFiles: 0,
    restoredFiles: 0,
    failedFiles: 0,
    ...input,
  };
}

const CANCELLED_BY_USER_DETAIL = 'Cancelled by user.';

function throwIfRestoreCancelled() {
  if (isConnectedPreviewCancelled()) {
    throw new Error(CANCELLED_BY_USER_DETAIL);
  }
}

type RestoreFileStats = {
  attempted: number;
  restored: number;
  failed: number;
};

async function collectSnapshotFiles(rootPath: string): Promise<string[]> {
  if (!existsSync(rootPath)) {
    return [];
  }

  const pending = [rootPath];
  const discovered: string[] = [];

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

      if (entry.isFile()) {
        discovered.push(entryPath);
      }
    }
  }

  discovered.sort((left, right) => left.localeCompare(right));
  return discovered;
}

function toSharedStoragePath(categoryRoot: string, absoluteFilePath: string) {
  const relativeFilePath = relative(categoryRoot, absoluteFilePath).replace(/\\/g, '/');
  if (!relativeFilePath || relativeFilePath.startsWith('../')) {
    return null;
  }

  return posix.join('/sdcard', relativeFilePath);
}

async function restoreSnapshotFilesToDevice(
  categoryRoot: string,
  timeoutMs: number,
  failureSummaries: string[],
  categoryLabel: 'media' | 'files',
  connection?: ConnectedDeviceConnection,
): Promise<RestoreFileStats> {
  const absoluteFiles = await collectSnapshotFiles(categoryRoot);
  let attempted = 0;
  let restored = 0;
  let failed = 0;

  const restoreBatch = async (activeConnection: ConnectedDeviceConnection) => {
    const sync = await activeConnection.adb.sync();
    try {
      for (const absoluteFilePath of absoluteFiles) {
        throwIfRestoreCancelled();
        const remotePath = toSharedStoragePath(categoryRoot, absoluteFilePath);
        if (!remotePath) {
          continue;
        }

        attempted += 1;
        const relativeFilePath = relative(categoryRoot, absoluteFilePath).replace(/\\/g, '/');
        appendConnectedPreviewLog(
          `Restoring ${categoryLabel} file ${attempted}/${absoluteFiles.length}: ${relativeFilePath}`,
        );

        try {
          await activeConnection.adb.subprocess.noneProtocol.spawnWaitText([
            'mkdir',
            '-p',
            dirname(remotePath),
          ]);
          await sync.write({
            filename: remotePath,
            file: Bun.file(absoluteFilePath).stream() as never,
          });
          throwIfRestoreCancelled();
          restored += 1;
        } catch (error) {
          failed += 1;
          if (failureSummaries.length < 3) {
            const message = error instanceof Error ? error.message : String(error);
            failureSummaries.push(`${relativeFilePath}: ${message || 'Unknown error'}`);
          }
        }
      }
    } finally {
      await sync.dispose().catch(() => {});
    }
  };

  if (connection) {
    await restoreBatch(connection);
  } else {
    await withConnectedDeviceConnection(restoreBatch, {
      timeoutMs,
      label: `restore:push-batch:${categoryLabel}`,
    });
  }

  return { attempted, restored, failed };
}

export async function restoreBackupSnapshot(
  payload: RestoreBackupSnapshotRequest,
): Promise<RestoreBackupSnapshotResponse> {
  beginConnectedPreviewProgress(0);
  appendConnectedPreviewLog('Restore requested.');
  const snapshotId = payload.snapshotId?.trim() || '';
  if (!snapshotId) {
    const response = emptyRestoreResponse('', {
      error: 'Missing snapshot id.',
      detail: 'Select a snapshot before restore.',
    });
    failConnectedPreviewProgress(response.detail || response.error || 'Restore failed.');
    return response;
  }

  appendConnectedPreviewLog('Checking connected device...');
  await resetConnectedDeviceConnection().catch(() => {});
  throwIfRestoreCancelled();
  const connection = await checkAdbConnected();
  if (!connection.connected) {
    const response = emptyRestoreResponse(snapshotId, {
      error: connection.detail,
      detail: connection.detail,
    });
    failConnectedPreviewProgress(response.detail || response.error || 'Restore failed.');
    return response;
  }
  appendConnectedPreviewLog('Connected device ready for restore.');
  throwIfRestoreCancelled();

  const backupRootPath = getBackupRestoreRootPath();
  const snapshotPath = join(backupRootPath, snapshotId);
  if (!existsSync(snapshotPath)) {
    const response = emptyRestoreResponse(snapshotId, {
      connected: true,
      error: 'Snapshot folder not found.',
      detail: snapshotPath,
    });
    failConnectedPreviewProgress(response.detail || response.error || 'Restore failed.');
    return response;
  }
  appendConnectedPreviewLog(`Using snapshot: ${snapshotId}`);

  const shouldRestoreApps = payload.restoreApps !== false;
  const shouldRestoreMedia = payload.restoreMedia === true;
  const shouldRestoreContacts = payload.restoreContacts === true;
  const shouldRestoreMessages = payload.restoreMessages === true;
  const shouldRestoreFiles = payload.restoreFiles === true;

  let manifestApps: BackedUpAppRecord[] = [];
  const manifestPath = join(snapshotPath, 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = (await Bun.file(manifestPath).json()) as JsonValue;
      const record = asRecord(manifest);
      manifestApps = parseBackupAppsFromManifest(record?.apps);
    } catch {
      // Ignore malformed manifest and fallback to folder scan.
    }
  }

  const fallbackAppsDir = join(snapshotPath, 'apps');
  if (manifestApps.length === 0 && existsSync(fallbackAppsDir)) {
    const packageDirs = await readdir(fallbackAppsDir, { withFileTypes: true });
    const discoveredApps: BackedUpAppRecord[] = [];
    for (const entry of packageDirs) {
      if (!entry.isDirectory()) {
        continue;
      }

      const appDirPath = join(fallbackAppsDir, entry.name);
      const appDirEntries = await readdir(appDirPath, {
        withFileTypes: true,
      }).catch(() => []);
      const apkRelativePaths = appDirEntries
        .filter((fileEntry) => fileEntry.isFile() && fileEntry.name.toLowerCase().endsWith('.apk'))
        .map((fileEntry) => join('apps', entry.name, fileEntry.name));
      const fallbackApkRelativePath = apkRelativePaths[0] || join('apps', entry.name, 'base.apk');

      discoveredApps.push({
        id: `app-${entry.name}`,
        appName: entry.name,
        packageName: entry.name,
        apkRelativePath: fallbackApkRelativePath,
        apkRelativePaths,
      });
    }
    manifestApps = discoveredApps;
  }

  let attemptedApps = 0;
  let restoredApps = 0;
  let failedApps = 0;
  let attemptedMedia = 0;
  let restoredMedia = 0;
  let failedMedia = 0;
  let attemptedContacts = 0;
  let restoredContacts = 0;
  let failedContacts = 0;
  let attemptedMessages = 0;
  let restoredMessages = 0;
  let failedMessages = 0;
  let attemptedFiles = 0;
  let restoredFiles = 0;
  let failedFiles = 0;
  const failureSummaries: string[] = [];

  try {
    await withSharedAdbCommandSession(async () => {
      if (shouldRestoreApps) {
        appendConnectedPreviewLog(
          `Restoring apps from snapshot (${manifestApps.length} entries)...`,
        );
        for (const app of manifestApps) {
          throwIfRestoreCancelled();
          const fallbackRelativeApk = join(
            'apps',
            sanitizeDirectoryName(app.packageName),
            'base.apk',
          );
          const apkRelativePaths =
            app.apkRelativePaths && app.apkRelativePaths.length > 0
              ? app.apkRelativePaths
              : app.apkRelativePath
                ? [app.apkRelativePath]
                : [fallbackRelativeApk];
          const apkAbsolutePaths = apkRelativePaths
            .map((apkRelativePath) => join(snapshotPath, apkRelativePath))
            .filter((apkAbsolutePath) => existsSync(apkAbsolutePath));
          if (apkAbsolutePaths.length === 0) {
            continue;
          }

          attemptedApps += 1;
          appendConnectedPreviewLog(
            `Restoring app ${attemptedApps}/${manifestApps.length}: ${app.packageName}`,
          );
          const installArgs =
            apkAbsolutePaths.length > 1
              ? ['install-multiple', '-r', ...apkAbsolutePaths]
              : ['install', '-r', apkAbsolutePaths[0] || ''];
          const installResult = await runCommand('adb', installArgs, ADB_INSTALL_TIMEOUT_MS);
          throwIfRestoreCancelled();
          if (installResult.exitCode === 0) {
            restoredApps += 1;
          } else {
            failedApps += 1;
            if (failureSummaries.length < 3) {
              const reason =
                installResult.stderrText.trim() ||
                installResult.stdoutText.trim() ||
                'Unknown error';
              failureSummaries.push(`${app.packageName}: ${reason}`);
            }
          }
        }
      }

      const shouldRestoreContent =
        shouldRestoreMedia || shouldRestoreContacts || shouldRestoreMessages || shouldRestoreFiles;

      if (shouldRestoreContent) {
        await withConnectedDeviceConnection(
          async (connection) => {
            if (shouldRestoreMedia) {
              throwIfRestoreCancelled();
              const mediaResult = await restoreSnapshotFilesToDevice(
                join(snapshotPath, 'media'),
                ADB_INSTALL_TIMEOUT_MS,
                failureSummaries,
                'media',
                connection,
              );
              attemptedMedia = mediaResult.attempted;
              restoredMedia = mediaResult.restored;
              failedMedia = mediaResult.failed;
            }

            if (shouldRestoreContacts) {
              throwIfRestoreCancelled();
              appendConnectedPreviewLog('Restoring contacts...');
              const contacts = await readContactsRestoreData(snapshotPath);
              throwIfRestoreCancelled();
              const contactsResult = await restoreContactsOnDevice(contacts, connection);
              throwIfRestoreCancelled();
              attemptedContacts = contactsResult.attempted;
              restoredContacts = contactsResult.restored;
              failedContacts = contactsResult.failed;
              if (contactsResult.detailLines.length > 0 && failureSummaries.length < 3) {
                failureSummaries.push(
                  ...contactsResult.detailLines.slice(0, 3 - failureSummaries.length),
                );
              }
            }

            if (shouldRestoreMessages) {
              throwIfRestoreCancelled();
              appendConnectedPreviewLog('Restoring messages...');
              const messages = await readMessagesRestoreData(snapshotPath);
              throwIfRestoreCancelled();
              const messagesResult = await restoreMessagesOnDevice(messages, connection);
              throwIfRestoreCancelled();
              attemptedMessages = messagesResult.attempted;
              restoredMessages = messagesResult.restored;
              failedMessages = messagesResult.failed;
              if (messagesResult.detailLines.length > 0 && failureSummaries.length < 3) {
                failureSummaries.push(
                  ...messagesResult.detailLines.slice(0, 3 - failureSummaries.length),
                );
              }
            }

            if (shouldRestoreFiles) {
              throwIfRestoreCancelled();
              const filesResult = await restoreSnapshotFilesToDevice(
                join(snapshotPath, 'files'),
                ADB_INSTALL_TIMEOUT_MS,
                failureSummaries,
                'files',
                connection,
              );
              attemptedFiles = filesResult.attempted;
              restoredFiles = filesResult.restored;
              failedFiles = filesResult.failed;
            }
          },
          {
            label: 'restore:content-batch',
          },
        );
      }
    });

    const attemptedTotal =
      attemptedApps + attemptedMedia + attemptedContacts + attemptedMessages + attemptedFiles;
    if (attemptedTotal === 0) {
      return emptyRestoreResponse(snapshotId, {
        ok: false,
        connected: true,
        detail: 'No restorable apps, media, contacts, messages or files were found in snapshot.',
        error: 'No snapshot data to restore.',
      });
    }

    const ok =
      failedApps === 0 &&
      failedMedia === 0 &&
      failedContacts === 0 &&
      failedMessages === 0 &&
      failedFiles === 0;
    const detailParts: string[] = [];
    if (shouldRestoreApps) {
      detailParts.push(`Restored ${restoredApps}/${attemptedApps} apps`);
    }
    if (shouldRestoreMedia) {
      detailParts.push(`Restored ${restoredMedia}/${attemptedMedia} media files`);
    }
    if (shouldRestoreContacts) {
      detailParts.push(`Restored ${restoredContacts}/${attemptedContacts} contacts`);
    }
    if (shouldRestoreMessages) {
      detailParts.push(`Restored ${restoredMessages}/${attemptedMessages} messages`);
    }
    if (shouldRestoreFiles) {
      detailParts.push(`Restored ${restoredFiles}/${attemptedFiles} files`);
    }
    const detail = ok
      ? `Restore completed. ${detailParts.join('. ')}.`
      : `Restore finished with failures. ${detailParts.join('. ')}.`;

    if (ok) {
      notifyTaskCompleted({
        title: 'Restore completed',
        body: detailParts.join('. '),
        subtitle: snapshotId,
      });
    }
    return emptyRestoreResponse(snapshotId, {
      ok,
      connected: true,
      attemptedApps,
      restoredApps,
      failedApps,
      attemptedMedia,
      restoredMedia,
      failedMedia,
      attemptedContacts,
      restoredContacts,
      failedContacts,
      attemptedMessages,
      restoredMessages,
      failedMessages,
      attemptedFiles,
      restoredFiles,
      failedFiles,
      detail,
      error:
        ok || failureSummaries.length === 0
          ? ok
            ? undefined
            : 'Some restore items failed.'
          : `Some restore items failed: ${failureSummaries.join(' | ')}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === CANCELLED_BY_USER_DETAIL) {
      return emptyRestoreResponse(snapshotId, {
        ok: false,
        connected: true,
        detail: CANCELLED_BY_USER_DETAIL,
        error: CANCELLED_BY_USER_DETAIL,
        attemptedApps,
        restoredApps,
        failedApps,
        attemptedMedia,
        restoredMedia,
        failedMedia,
        attemptedContacts,
        restoredContacts,
        failedContacts,
        attemptedMessages,
        restoredMessages,
        failedMessages,
        attemptedFiles,
        restoredFiles,
        failedFiles,
      });
    }

    failConnectedPreviewProgress(message);
    return emptyRestoreResponse(snapshotId, {
      ok: false,
      connected: true,
      detail: message,
      error: message,
      attemptedApps,
      restoredApps,
      failedApps,
      attemptedMedia,
      restoredMedia,
      failedMedia,
      attemptedContacts,
      restoredContacts,
      failedContacts,
      attemptedMessages,
      restoredMessages,
      failedMessages,
      attemptedFiles,
      restoredFiles,
      failedFiles,
    });
  }
}
