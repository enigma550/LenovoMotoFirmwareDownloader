import type {
  BackupRestoreSnapshot,
  ConnectedBackupPreviewProgressResponse,
  ConnectedBackupPreviewResponse,
} from '../../../../shared/desktop-rpc';
import { resetConnectedDeviceConnection } from '../../../device/connected-device-facade.ts';
import {
  checkAdbConnected,
  getConnectedDeviceCacheScope,
  getConnectedDeviceInfo,
  withSharedAdbCommandSession,
} from './connected-backups-adb.ts';
import { scanConnectedAppsPreview } from './connected-backups-apps.ts';
import { scanConnectedContactsPreview } from './connected-backups-contacts.ts';
import { scanConnectedFilesPreview } from './connected-backups-files.ts';
import { setPreviewIconCacheScope } from './connected-backups-icon.ts';
import { scanConnectedMediaPreview } from './connected-backups-media.ts';
import { scanConnectedMessagesPreview } from './connected-backups-messages.ts';
import {
  appendConnectedPreviewLog,
  beginConnectedPreviewProgress,
  failConnectedPreviewProgress,
  finishConnectedPreviewProgress,
  getConnectedPreviewProgressState,
  isConnectedPreviewCancelled,
  requestConnectedPreviewCancellation,
  setCategoryError,
  setConnectedPreviewProgressState,
} from './connected-backups-progress.ts';
import {
  type ConnectedScanResult,
  MAX_PREVIEW_APPS,
  MAX_PREVIEW_CONTACTS,
  MAX_PREVIEW_FILES,
  MAX_PREVIEW_MEDIA,
  MAX_PREVIEW_MESSAGES,
} from './connected-backups-shared.ts';

const CANCELLED_BY_USER_DETAIL = 'Cancelled by user.';

let scanInFlight: Promise<ConnectedBackupPreviewResponse> | null = null;
let activePreviewCancellationController: AbortController | null = null;

async function scanConnectedDevicePreviewInternal(
  maxApps: number,
  signal?: AbortSignal,
): Promise<ConnectedScanResult> {
  appendConnectedPreviewLog('Checking connected device via Tango ADB...');
  const connection = await checkAdbConnected(appendConnectedPreviewLog, signal);
  if (!connection.connected) {
    setConnectedPreviewProgressState({
      apps: [],
      media: [],
      contacts: [],
      messages: [],
      files: [],
      categoryErrors: {},
    });
    if (connection.detail !== CANCELLED_BY_USER_DETAIL) {
      failConnectedPreviewProgress(connection.detail);
    }
    return {
      connected: false,
      detail: connection.detail,
      apps: [],
      media: [],
      contacts: [],
      messages: [],
      files: [],
      categoryErrors: {},
      deviceInfo: { model: '', androidVersion: '' },
    };
  }

  appendConnectedPreviewLog(
    'Device connection ok. Reading device, apps, media, contacts, messages and files...',
  );
  let deviceInfo: { model: string; androidVersion: string } = { model: '', androidVersion: '' };
  let apps: import('../../../../shared/desktop-rpc').BackupRestoreAppEntry[] = [];
  let media: import('../../../../shared/desktop-rpc').BackupRestoreMediaEntry[] = [];
  let contacts: import('../../../../shared/desktop-rpc').BackupRestoreContactEntry[] = [];
  let messages: import('../../../../shared/desktop-rpc').BackupRestoreMessageEntry[] = [];
  let files: import('../../../../shared/desktop-rpc').BackupRestoreFileEntry[] = [];

  try {
    await withSharedAdbCommandSession(async () => {
      const cacheScope = await getConnectedDeviceCacheScope({ reuseShared: true })
        .then((value) => {
          setPreviewIconCacheScope(value);
          return value;
        })
        .catch(() => {
          setPreviewIconCacheScope('connected-device');
          return 'connected-device';
        });
      void cacheScope;

      deviceInfo = await getConnectedDeviceInfo({ reuseShared: true });
      setConnectedPreviewProgressState({
        previewDeviceName: deviceInfo.model,
        previewAndroidVersion: deviceInfo.androidVersion,
      });

      apps = await scanConnectedAppsPreview(Math.max(1, maxApps)).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setCategoryError('apps', message);
        appendConnectedPreviewLog(`Apps scan failed: ${message}`);
        return [] as import('../../../../shared/desktop-rpc').BackupRestoreAppEntry[];
      });

      media = await scanConnectedMediaPreview(
        MAX_PREVIEW_MEDIA,
        appendConnectedPreviewLog,
        (mediaItems) => {
          setConnectedPreviewProgressState({
            media: mediaItems.map((entry) => ({ ...entry })),
          });
        },
      ).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setCategoryError('media', message);
        appendConnectedPreviewLog(`Media scan failed: ${message}`);
        return [] as import('../../../../shared/desktop-rpc').BackupRestoreMediaEntry[];
      });

      contacts = await scanConnectedContactsPreview(MAX_PREVIEW_CONTACTS, appendConnectedPreviewLog)
        .then((entries) => {
          setConnectedPreviewProgressState({
            contacts: entries.map((entry) => ({ ...entry })),
          });
          return entries;
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setCategoryError('contacts', message);
          appendConnectedPreviewLog(`Contacts scan failed: ${message}`);
          return [] as import('../../../../shared/desktop-rpc').BackupRestoreContactEntry[];
        });

      messages = await scanConnectedMessagesPreview(MAX_PREVIEW_MESSAGES, appendConnectedPreviewLog)
        .then((entries) => {
          setConnectedPreviewProgressState({
            messages: entries.map((entry) => ({ ...entry })),
          });
          return entries;
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setCategoryError('messages', message);
          appendConnectedPreviewLog(`Messages scan failed: ${message}`);
          return [] as import('../../../../shared/desktop-rpc').BackupRestoreMessageEntry[];
        });

      files = await scanConnectedFilesPreview(MAX_PREVIEW_FILES, appendConnectedPreviewLog)
        .then((entries) => {
          setConnectedPreviewProgressState({
            files: entries.map((entry) => ({ ...entry })),
          });
          return entries;
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setCategoryError('files', message);
          appendConnectedPreviewLog(`Files scan failed: ${message}`);
          return [] as import('../../../../shared/desktop-rpc').BackupRestoreFileEntry[];
        });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setConnectedPreviewProgressState({
      apps: [],
      media: [],
      contacts: [],
      messages: [],
      files: [],
      categoryErrors: {},
    });
    failConnectedPreviewProgress(message);
    return {
      connected: false,
      detail: message,
      apps: [],
      media: [],
      contacts: [],
      messages: [],
      files: [],
      categoryErrors: {},
      deviceInfo: { model: '', androidVersion: '' },
    };
  }
  setConnectedPreviewProgressState({
    previewDeviceName: deviceInfo.model,
    previewAndroidVersion: deviceInfo.androidVersion,
    apps: apps.map((entry) => ({ ...entry })),
    media: media.map((entry) => ({ ...entry })),
    contacts: contacts.map((entry) => ({ ...entry })),
    messages: messages.map((entry) => ({ ...entry })),
    files: files.map((entry) => ({ ...entry })),
  });

  const thumbnailCount = apps.filter((entry) => Boolean(entry.iconDataUrl)).length;
  finishConnectedPreviewProgress(
    `Connected preview finished: ${thumbnailCount}/${apps.length} thumbnails.`,
  );

  const categoryErrors = getConnectedPreviewProgressState().categoryErrors;

  return {
    connected: true,
    detail:
      `Connected device detected (${deviceInfo.model}). ` +
      `Loaded ${apps.length} apps (${thumbnailCount} thumbnails), ${media.length} media files, ${contacts.length} contacts, ${messages.length} messages and ${files.length} files.`,
    apps,
    media,
    contacts,
    messages,
    files,
    categoryErrors: { ...categoryErrors },
    deviceInfo,
  };
}

function toConnectedSnapshot(scanResult: ConnectedScanResult): BackupRestoreSnapshot {
  const categories: string[] = [];
  if (scanResult.apps.length > 0) categories.push('apps');
  if (scanResult.media.length > 0) categories.push('media');
  if (scanResult.contacts.length > 0) categories.push('contacts');
  if (scanResult.messages.length > 0) categories.push('messages');
  if (scanResult.files.length > 0) categories.push('files');

  return {
    id: `connected-preview-${Date.now()}`,
    title: scanResult.deviceInfo.model || 'Connected device',
    sourcePath: 'connected://tango-adb',
    relativeSourcePath: 'connected://tango-adb',
    createdAt: Date.now(),
    deviceName: scanResult.deviceInfo.model || undefined,
    androidVersion: scanResult.deviceInfo.androidVersion || undefined,
    categories,
    apps: scanResult.apps,
    media: scanResult.media,
    contacts: scanResult.contacts,
    messages: scanResult.messages,
    files: scanResult.files,
  };
}

export async function scanConnectedBackupPreview(): Promise<ConnectedBackupPreviewResponse> {
  if (scanInFlight) {
    return scanInFlight;
  }

  scanInFlight = (async () => {
    const cancellationController = new AbortController();
    activePreviewCancellationController = cancellationController;
    beginConnectedPreviewProgress(0);
    appendConnectedPreviewLog('Connected preview requested.');

    try {
      const scanResult = await scanConnectedDevicePreviewInternal(
        MAX_PREVIEW_APPS,
        cancellationController.signal,
      );
      if (!scanResult.connected) {
        if (scanResult.detail === CANCELLED_BY_USER_DETAIL) {
          failConnectedPreviewProgress(CANCELLED_BY_USER_DETAIL);
        }
        return {
          ok: false,
          connected: false,
          detail: scanResult.detail,
          error: scanResult.detail,
        };
      }

      return {
        ok: true,
        connected: true,
        detail: scanResult.detail,
        snapshot: toConnectedSnapshot(scanResult),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (
        cancellationController.signal.aborted ||
        isConnectedPreviewCancelled() ||
        detail === CANCELLED_BY_USER_DETAIL
      ) {
        failConnectedPreviewProgress(CANCELLED_BY_USER_DETAIL);
        return {
          ok: false,
          connected: false,
          detail: CANCELLED_BY_USER_DETAIL,
          error: CANCELLED_BY_USER_DETAIL,
        };
      }

      failConnectedPreviewProgress(detail);
      return {
        ok: false,
        connected: false,
        detail,
        error: detail,
      };
    } finally {
      if (activePreviewCancellationController === cancellationController) {
        activePreviewCancellationController = null;
      }
      await resetConnectedDeviceConnection().catch(() => {});
    }
  })();

  try {
    return await scanInFlight;
  } finally {
    scanInFlight = null;
  }
}

export async function getConnectedBackupPreviewProgress(): Promise<ConnectedBackupPreviewProgressResponse> {
  const state = getConnectedPreviewProgressState();
  return {
    ok: true,
    running: state.running,
    runId: state.runId,
    totalApps: state.totalApps,
    completedApps: state.completedApps,
    iconsFound: state.iconsFound,
    failedIcons: state.failedIcons,
    logBaseCount: state.logBaseCount,
    logCount: state.logCount,
    logs: state.logs,
    lastLogLine: state.lastLogLine,
    detail: state.detail,
    currentPackage: state.currentPackage,
    previewDeviceName: state.previewDeviceName,
    previewAndroidVersion: state.previewAndroidVersion,
    apps: state.apps.map((entry) => ({ ...entry })),
    media: state.media.map((entry) => ({ ...entry })),
    contacts: state.contacts.map((entry) => ({ ...entry })),
    messages: state.messages.map((entry) => ({ ...entry })),
    files: state.files.map((entry) => ({ ...entry })),
    categoryErrors: { ...state.categoryErrors },
  };
}

export function cancelConnectedBackupProcess(): {
  ok: boolean;
  detail: string;
} {
  if (!scanInFlight && !getConnectedPreviewProgressState().running) {
    return { ok: true, detail: 'No connected backup process is running.' };
  }

  if (!isConnectedPreviewCancelled()) {
    requestConnectedPreviewCancellation();
  }
  activePreviewCancellationController?.abort();
  void resetConnectedDeviceConnection().catch(() => {});
  return { ok: true, detail: 'Cancellation requested.' };
}
