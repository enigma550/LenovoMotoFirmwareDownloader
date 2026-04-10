export const MAX_PREVIEW_APPS = 5_000;
export const MAX_PREVIEW_ICON_CONCURRENCY = 5;
export const MAX_PREVIEW_APK_PARTS_PER_APP = 12;
export const MAX_PREVIEW_MEDIA = 180;
export const MAX_PREVIEW_CONTACTS = 1_000;
export const MAX_PREVIEW_MESSAGES = 5_000;
export const MAX_PREVIEW_FILES = 300;
export const MAX_BACKUP_APPS = MAX_PREVIEW_APPS;
export const MAX_BACKUP_MEDIA = MAX_PREVIEW_MEDIA;
export const MAX_BACKUP_CONTACTS = MAX_PREVIEW_CONTACTS;
export const MAX_BACKUP_MESSAGES = MAX_PREVIEW_MESSAGES;
export const MAX_BACKUP_FILES = MAX_PREVIEW_FILES;
export const MAX_MEDIA_THUMBNAILS = 180;
export const MAX_THUMBNAIL_FILE_SIZE = 5_000_000;
export const MAX_THUMBNAIL_DATA_URL_LENGTH = 500_000;

export const ADB_COMMAND_TIMEOUT_MS = 120_000;
export const ADB_PULL_TIMEOUT_MS = 240_000;
export const ADB_INSTALL_TIMEOUT_MS = 300_000;

export type CommandResult = {
  exitCode: number;
  stdoutText: string;
  stderrText: string;
  timedOut: boolean;
  error?: string;
};

export type ConnectedDeviceInfo = {
  model: string;
  androidVersion: string;
};

export type ConnectedScanResult = {
  connected: boolean;
  detail: string;
  apps: import('../../../../shared/desktop-rpc').BackupRestoreAppEntry[];
  media: import('../../../../shared/desktop-rpc').BackupRestoreMediaEntry[];
  contacts: import('../../../../shared/desktop-rpc').BackupRestoreContactEntry[];
  messages: import('../../../../shared/desktop-rpc').BackupRestoreMessageEntry[];
  files: import('../../../../shared/desktop-rpc').BackupRestoreFileEntry[];
  categoryErrors: Record<string, string>;
  deviceInfo: ConnectedDeviceInfo;
};

export type InstalledPackageInfo = {
  packageName: string;
  primaryApkPath?: string;
};

export type PulledPreviewApk = {
  localApkPath: string;
  remoteApkPath: string;
};

export type BackedUpAppRecord = {
  id: string;
  appName: string;
  packageName: string;
  sizeBytes?: number;
  iconPath?: string;
  apkRelativePath?: string;
  apkRelativePaths?: string[];
};
