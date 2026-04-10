import type {
  BackupRestoreSnapshot,
  BackupRestoreSnapshotsResponse,
  ConnectedBackupPreviewProgressResponse,
} from '../../../core/models/desktop-api';

export function resolveSnapshotListState(
  response: BackupRestoreSnapshotsResponse,
  currentActiveSnapshotId: string,
  options: {
    preserveActiveSelection?: boolean;
    preferredSnapshotId?: string;
  } = {},
): {
  backupRootPath: string;
  backupRootRelativePath: string | undefined;
  snapshots: BackupRestoreSnapshot[];
  activeSnapshotId: string;
} {
  const backupRootPath = response.rootPath || '';
  const backupRootRelativePath = response.relativeRootPath;

  if (!response.ok) {
    return {
      backupRootPath,
      backupRootRelativePath,
      snapshots: [],
      activeSnapshotId: '',
    };
  }

  const { snapshots } = response;
  const preferredSnapshotId = options.preferredSnapshotId?.trim() || '';

  if (preferredSnapshotId && snapshots.some((snapshot) => snapshot.id === preferredSnapshotId)) {
    return {
      backupRootPath,
      backupRootRelativePath,
      snapshots,
      activeSnapshotId: preferredSnapshotId,
    };
  }

  if (
    options.preserveActiveSelection &&
    currentActiveSnapshotId &&
    snapshots.some((snapshot) => snapshot.id === currentActiveSnapshotId)
  ) {
    return {
      backupRootPath,
      backupRootRelativePath,
      snapshots,
      activeSnapshotId: currentActiveSnapshotId,
    };
  }

  if (
    currentActiveSnapshotId &&
    snapshots.some((snapshot) => snapshot.id === currentActiveSnapshotId)
  ) {
    return {
      backupRootPath,
      backupRootRelativePath,
      snapshots,
      activeSnapshotId: currentActiveSnapshotId,
    };
  }

  return {
    backupRootPath,
    backupRootRelativePath,
    snapshots,
    activeSnapshotId: snapshots[0]?.id || '',
  };
}

export function buildConnectedPreviewSnapshotFromProgress(
  progress: ConnectedBackupPreviewProgressResponse,
  currentSnapshot: BackupRestoreSnapshot | null,
): BackupRestoreSnapshot | null {
  const apps = progress.apps.length > 0 ? progress.apps : currentSnapshot?.apps || [];
  const media = progress.media.length > 0 ? progress.media : currentSnapshot?.media || [];
  const contacts =
    progress.contacts.length > 0 ? progress.contacts : currentSnapshot?.contacts || [];
  const messages =
    progress.messages.length > 0 ? progress.messages : currentSnapshot?.messages || [];
  const files = progress.files.length > 0 ? progress.files : currentSnapshot?.files || [];
  const deviceName = progress.previewDeviceName?.trim() || currentSnapshot?.deviceName || '';
  const androidVersion =
    progress.previewAndroidVersion?.trim() || currentSnapshot?.androidVersion || '';

  if (!deviceName && apps.length === 0 && media.length === 0 && contacts.length === 0) {
    return null;
  }

  const categories: string[] = [];
  if (apps.length > 0) categories.push('apps');
  if (media.length > 0) categories.push('media');
  if (contacts.length > 0) categories.push('contacts');
  if (messages.length > 0) categories.push('messages');
  if (files.length > 0) categories.push('files');

  return {
    id: currentSnapshot?.id || `connected-preview-live-${progress.runId}`,
    title: deviceName || currentSnapshot?.title || 'Connected device',
    sourcePath: 'connected://tango-adb',
    relativeSourcePath: 'connected://tango-adb',
    createdAt: currentSnapshot?.createdAt || Date.now(),
    deviceName: deviceName || undefined,
    androidVersion: androidVersion || undefined,
    categories,
    apps,
    media,
    contacts,
    messages,
    files,
  };
}

export function buildConnectedPreviewStatusDetail(
  progress: ConnectedBackupPreviewProgressResponse,
  snapshot: BackupRestoreSnapshot,
): string | null {
  const appCount = snapshot.apps.length;
  const totalApps = Math.max(progress.totalApps, appCount);
  if (!progress.running || totalApps <= 0) {
    return null;
  }

  const thumbnailCount = snapshot.apps.filter((app) => Boolean(app.iconDataUrl)).length;
  return `Scanning connected device (${progress.completedApps}/${totalApps} apps, ${thumbnailCount} thumbnails)...`;
}
