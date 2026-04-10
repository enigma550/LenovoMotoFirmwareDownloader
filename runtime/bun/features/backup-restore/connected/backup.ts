import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  BackupConnectedDeviceRequest,
  BackupConnectedDeviceResponse,
} from '../../../../shared/desktop-rpc';
import { notifyTaskCompleted } from '../../../desktop-notifications.ts';
import {
  resetConnectedDeviceConnection,
  withConnectedDeviceConnection,
} from '../../../device/connected-device-facade.ts';
import {
  checkAdbConnected,
  getConnectedDeviceInfo,
  withSharedAdbCommandSession,
} from './connected-backups-adb.ts';
import { backupAppsToSnapshot } from './connected-backups-apps.ts';
import { backupContactsToSnapshot } from './connected-backups-contacts.ts';
import { backupFilesToSnapshot } from './connected-backups-files.ts';
import { backupMediaToSnapshot } from './connected-backups-media.ts';
import { backupMessagesToSnapshot } from './connected-backups-messages.ts';
import {
  appendConnectedPreviewLog,
  beginConnectedPreviewProgress,
  failConnectedPreviewProgress,
  finishConnectedPreviewProgress,
  isConnectedPreviewCancelled,
} from './connected-backups-progress.ts';
import { MAX_BACKUP_APPS } from './connected-backups-shared.ts';
import {
  buildSnapshotId,
  getBackupRestoreRootPath,
  toRelativeHomePath,
} from './connected-backups-utils.ts';

export async function backupConnectedDevice(
  payload: BackupConnectedDeviceRequest = {},
): Promise<BackupConnectedDeviceResponse> {
  const includeApps = payload.includeApps !== false;
  const includeMedia = payload.includeMedia === true;
  const includeContacts = payload.includeContacts === true;
  const includeMessages = payload.includeMessages === true;
  const includeFiles = payload.includeFiles === true;
  const maxApps = Math.min(MAX_BACKUP_APPS, Math.max(1, payload.maxApps ?? MAX_BACKUP_APPS));
  const selectedPackages = new Set(
    (payload.selectedPackages || [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  const hasSelectedMediaPaths = Array.isArray(payload.selectedMediaPaths);
  const selectedMediaPaths = new Set(
    (payload.selectedMediaPaths || [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  const hasSelectedContactIds = Array.isArray(payload.selectedContactIds);
  const selectedContactIds = new Set(
    (payload.selectedContactIds || [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  const hasSelectedMessageIds = Array.isArray(payload.selectedMessageIds);
  const selectedMessageIds = new Set(
    (payload.selectedMessageIds || [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  const hasSelectedFilePaths = Array.isArray(payload.selectedFilePaths);
  const selectedFilePaths = new Set(
    (payload.selectedFilePaths || [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  if (includeApps && payload.selectedPackages && selectedPackages.size === 0) {
    return {
      ok: false,
      connected: true,
      error: 'No apps selected for backup.',
      detail: 'Choose at least one app before starting backup.',
    };
  }

  beginConnectedPreviewProgress(0);
  appendConnectedPreviewLog('Backup requested.');

  try {
    appendConnectedPreviewLog('Checking connected device...');
    const connection = await checkAdbConnected(appendConnectedPreviewLog);
    if (!connection.connected) {
      failConnectedPreviewProgress(connection.detail);
      return {
        ok: false,
        connected: false,
        detail: connection.detail,
        error: connection.detail,
      };
    }

    const backupRootPath = getBackupRestoreRootPath();
    await mkdir(backupRootPath, { recursive: true });

    const snapshotId = buildSnapshotId();
    const snapshotPath = join(backupRootPath, snapshotId);
    await mkdir(snapshotPath, { recursive: true });
    appendConnectedPreviewLog(`Created snapshot directory: ${snapshotId}`);

    const {
      deviceInfo,
      backedUpApps,
      backedUpMedia,
      backedUpContacts,
      backedUpMessages,
      backedUpFiles,
    } = await withSharedAdbCommandSession(() =>
      withConnectedDeviceConnection(
        async () => {
          const deviceInfo = await getConnectedDeviceInfo({ reuseShared: true });
          appendConnectedPreviewLog(
            `Connected device detected (${deviceInfo.model || 'Unknown device'}, Android ${deviceInfo.androidVersion || 'unknown'}).`,
          );
          if (isConnectedPreviewCancelled()) {
            failConnectedPreviewProgress('Backup cancelled by user.');
            throw new Error('Backup cancelled by user.');
          }

          appendConnectedPreviewLog(includeApps ? 'Backing up apps...' : 'Skipping apps.');
          const backedUpApps = await backupAppsToSnapshot({
            snapshotPath,
            maxApps,
            includeApps,
            selectedPackages: selectedPackages.size > 0 ? selectedPackages : undefined,
          });
          if (isConnectedPreviewCancelled()) {
            failConnectedPreviewProgress('Backup cancelled by user.');
            throw new Error('Backup cancelled by user.');
          }

          appendConnectedPreviewLog(includeMedia ? 'Backing up media...' : 'Skipping media.');
          const backedUpMedia = await backupMediaToSnapshot({
            snapshotPath,
            includeMedia,
            selectedRelativePaths: hasSelectedMediaPaths ? selectedMediaPaths : undefined,
            appendLog: appendConnectedPreviewLog,
          });
          if (isConnectedPreviewCancelled()) {
            failConnectedPreviewProgress('Backup cancelled by user.');
            throw new Error('Backup cancelled by user.');
          }

          appendConnectedPreviewLog(
            includeContacts ? 'Backing up contacts...' : 'Skipping contacts.',
          );
          const backedUpContacts = await backupContactsToSnapshot({
            snapshotPath,
            includeContacts,
            selectedIds: hasSelectedContactIds ? selectedContactIds : undefined,
            appendLog: appendConnectedPreviewLog,
          });
          if (isConnectedPreviewCancelled()) {
            failConnectedPreviewProgress('Backup cancelled by user.');
            throw new Error('Backup cancelled by user.');
          }

          appendConnectedPreviewLog(
            includeMessages ? 'Backing up messages...' : 'Skipping messages.',
          );
          const backedUpMessages = await backupMessagesToSnapshot({
            snapshotPath,
            includeMessages,
            selectedIds: hasSelectedMessageIds ? selectedMessageIds : undefined,
            appendLog: appendConnectedPreviewLog,
          });
          if (isConnectedPreviewCancelled()) {
            failConnectedPreviewProgress('Backup cancelled by user.');
            throw new Error('Backup cancelled by user.');
          }

          appendConnectedPreviewLog(includeFiles ? 'Backing up files...' : 'Skipping files.');
          const backedUpFiles = await backupFilesToSnapshot({
            snapshotPath,
            includeFiles,
            selectedRelativePaths: hasSelectedFilePaths ? selectedFilePaths : undefined,
            appendLog: appendConnectedPreviewLog,
          });
          if (isConnectedPreviewCancelled()) {
            failConnectedPreviewProgress('Backup cancelled by user.');
            throw new Error('Backup cancelled by user.');
          }

          return {
            deviceInfo,
            backedUpApps,
            backedUpMedia,
            backedUpContacts,
            backedUpMessages,
            backedUpFiles,
          };
        },
        { label: 'backup:snapshot-session' },
      ),
    );

    const categories: string[] = [];
    if (backedUpApps.length > 0) categories.push('apps');
    if (backedUpMedia.length > 0) categories.push('media');
    if (backedUpContacts.length > 0) categories.push('contacts');
    if (backedUpMessages.length > 0) categories.push('messages');
    if (backedUpFiles.length > 0) categories.push('files');

    const manifest = {
      title: `${deviceInfo.model || 'Connected device'} backup`,
      createdAt: Date.now(),
      deviceName: deviceInfo.model || undefined,
      androidVersion: deviceInfo.androidVersion || undefined,
      categories,
      apps: backedUpApps.map((entry) => ({
        id: entry.id,
        appName: entry.appName,
        packageName: entry.packageName,
        sizeBytes: entry.sizeBytes,
        iconPath: entry.iconPath,
        apkRelativePath: entry.apkRelativePath,
        apkRelativePaths: entry.apkRelativePaths,
      })),
      media: backedUpMedia,
      contacts: backedUpContacts,
      messages: backedUpMessages,
      files: backedUpFiles,
    };

    appendConnectedPreviewLog('Writing backup manifest...');
    await writeFile(join(snapshotPath, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    const detailParts: string[] = [];
    if (includeApps) detailParts.push(`Backed up ${backedUpApps.length} apps`);
    if (includeMedia) detailParts.push(`Backed up ${backedUpMedia.length} media files`);
    if (includeContacts) detailParts.push(`Backed up ${backedUpContacts.length} contacts`);
    if (includeMessages) detailParts.push(`Backed up ${backedUpMessages.length} messages`);
    if (includeFiles) detailParts.push(`Backed up ${backedUpFiles.length} files`);
    if (detailParts.length === 0) {
      detailParts.push('No backup categories selected');
    }

    const detail = `${detailParts.join('. ')}.`;
    finishConnectedPreviewProgress(`Backup completed: ${detail}`);
    notifyTaskCompleted({
      title: 'Backup completed',
      body: detail,
      subtitle: snapshotId,
    });

    return {
      ok: true,
      connected: true,
      snapshotId,
      snapshotPath,
      relativeSnapshotPath: toRelativeHomePath(snapshotPath),
      detail,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    failConnectedPreviewProgress(detail);
    return {
      ok: false,
      connected: false,
      detail,
      error: detail,
    };
  } finally {
    if (process.platform !== 'win32') {
      await resetConnectedDeviceConnection().catch(() => {});
    }
  }
}
