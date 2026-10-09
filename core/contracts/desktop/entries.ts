export interface LocalDownloadedFile {
  fileName: string;
  fullPath: string;
  relativePath?: string;
  sizeBytes: number;
  modifiedAt: number;
  publishDate?: string;
  extractedDir: string;
  relativeExtractedDir?: string;
  hasExtractedDir: boolean;
  recipeUrl?: string;
  romMatchIdentifier?: string;
  selectedParameters?: Record<string, string>;
  metadataSource?: string;
  hasRecipeMetadata?: boolean;
}

export type PlayStoreArch = 'arm64' | 'armv7';

export interface PlayStoreSearchResult {
  title: string;
  packageName: string;
  iconUrl?: string;
}

export interface PlayStoreAppDetails {
  title: string;
  packageName: string;
  versionName?: string;
  versionCode?: string;
  developer?: string;
  rating?: string;
  downloads?: string;
  playUrl?: string;
}

export interface PlayStoreDownloadedArtifact {
  fileName: string;
  fullPath: string;
  relativePath?: string;
  sizeBytes: number;
  modifiedAt: number;
}

export interface PlayStoreDownloadGroup {
  id: string;
  packageName: string;
  title?: string;
  iconDataUrl?: string;
  versionCode?: string;
  totalSizeBytes: number;
  modifiedAt: number;
  apkArtifactCount: number;
  extraArtifactCount: number;
  artifacts: PlayStoreDownloadedArtifact[];
}

export interface BackupRestoreAppEntry {
  id: string;
  appName: string;
  packageName?: string;
  iconDataUrl?: string;
  apkRelativePath?: string;
  itemCount?: number;
  sizeBytes?: number;
}

export interface BackupRestoreMediaEntry {
  id: string;
  fileName: string;
  relativePath: string;
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'other';
  thumbnailDataUrl?: string;
  thumbnailPath?: string;
  sizeBytes?: number;
  modifiedAt?: number;
}

export interface BackupRestoreMessageEntry {
  id: string;
  sender: string;
  preview: string;
  thread?: string;
  timestamp?: number;
  messageType?: 'sent' | 'received' | 'unknown';
}

export interface BackupRestoreContactEntry {
  id: string;
  displayName: string;
  phoneNumber?: string;
  email?: string;
}

export interface BackupRestoreFileEntry {
  id: string;
  fileName: string;
  relativePath: string;
  fileType: 'file' | 'directory';
  sizeBytes?: number;
  modifiedAt?: number;
}

export interface BackupRestoreSnapshot {
  id: string;
  title: string;
  sourcePath: string;
  relativeSourcePath?: string;
  createdAt: number;
  sizeBytes?: number;
  deviceName?: string;
  androidVersion?: string;
  categories: string[];
  apps: BackupRestoreAppEntry[];
  media: BackupRestoreMediaEntry[];
  contacts: BackupRestoreContactEntry[];
  messages: BackupRestoreMessageEntry[];
  files: BackupRestoreFileEntry[];
}

export type FirmwareTaskStatus =
  | 'starting'
  | 'downloading'
  | 'paused'
  | 'preparing'
  | 'flashing'
  | 'completed'
  | 'failed'
  | 'canceled';

export type RescueQdlStorage = 'auto' | 'emmc' | 'ufs';

export type RescueFlashTransport = 'fastboot' | 'qdl' | 'unisoc' | 'mediatek';
export type RescueConsoleTone = 'info' | 'verbose' | 'success' | 'warning' | 'error';

export interface DownloadProgressMessage {
  downloadId: string;
  romUrl: string;
  romName: string;
  status: FirmwareTaskStatus;
  dryRun?: boolean;
  flashTransport?: RescueFlashTransport;
  qdlStorage?: RescueQdlStorage;
  qdlSerial?: string;
  savePath?: string;
  downloadedBytes: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  phase?: 'download' | 'prepare' | 'flash';
  stepIndex?: number;
  stepTotal?: number;
  stepLabel?: string;
  commandSource?: string;
  consoleLine?: string;
  consoleTone?: RescueConsoleTone;
  error?: string;
}

export interface AppInfo {
  version: string;
  platform: string;
  channel: string;
}

export interface FrameworkUpdateInfo {
  version: string;
  hash: string;
  updateAvailable: boolean;
  updateReady: boolean;
  error: string;
}

export type ProjectUpdateMode = 'source' | 'packaged';

export type ProjectUpdatePhase =
  | 'preflight'
  | 'fetch'
  | 'sync'
  | 'dependencies'
  | 'build'
  | 'finalize'
  | 'done'
  | 'failed'
  | 'canceled';

export type ProjectUpdateTone = 'info' | 'success' | 'warning' | 'error';

export type ProjectUpdateCredentialStatus =
  | 'ok'
  | 'not-applicable'
  | 'auth-failed'
  | 'network-failed'
  | 'missing-remote'
  | 'unknown';

export interface ProjectUpdateCommit {
  sha: string;
  summary: string;
  author: string;
  date: string;
}

export interface ProjectUpdatePreflight {
  mode: ProjectUpdateMode;
  available: boolean;
  reason?: string;
  currentBranch?: string;
  currentCommit?: string;
  remoteUrl?: string;
  behindCount: number;
  aheadCount: number;
  upToDate: boolean;
  diverged: boolean;
  incomingCommits: ProjectUpdateCommit[];
  dirtyFiles: string[];
  credentialStatus: ProjectUpdateCredentialStatus;
  appVersion: string;
  logPath?: string;
}

export interface ProjectUpdateProgressMessage {
  updateId: string;
  mode: ProjectUpdateMode;
  phase: ProjectUpdatePhase;
  status: 'starting' | 'running' | 'completed' | 'failed' | 'canceled';
  stepIndex?: number;
  stepTotal?: number;
  stepLabel?: string;
  consoleLine?: string;
  consoleTone?: ProjectUpdateTone;
  error?: string;
}

export interface DesktopIntegrationStatus {
  ok: boolean;
  status: 'ok' | 'missing' | 'wrong_wmclass' | 'not_linux';
  error?: string;
}
