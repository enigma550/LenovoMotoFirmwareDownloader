/**
 * Response interfaces returned by the Desktop API (RPC responses).
 * Separated from request/entity types for single-responsibility.
 */
import type { CatalogCountryOptions } from '../../domain/catalog/country-options';
import type { ModelCatalogEntry } from '../../domain/catalog/model';
import type { DeviceInfo } from '../../domain/device/info';
import type { CatalogFirmwareLookupResult } from '../../domain/firmware/catalog-lookup-result';
import type { ReadSupportFirmwareLookupResult } from '../../domain/firmware/read-support-lookup-result';
import type { FirmwareVariant } from '../../domain/firmware/variant';
import type {
  BackupRestoreAppEntry,
  BackupRestoreContactEntry,
  BackupRestoreFileEntry,
  BackupRestoreMediaEntry,
  BackupRestoreMessageEntry,
  BackupRestoreSnapshot,
  FirmwareTaskStatus,
  LocalDownloadedFile,
  PlayStoreAppDetails,
  PlayStoreDownloadedArtifact,
  PlayStoreDownloadGroup,
  PlayStoreSearchResult,
  RescueFlashTransport,
  RescueQdlStorage,
} from './entries';

export interface AuthStartResponse {
  ok: boolean;
  loginUrl?: string;
  openedInExternalBrowser?: boolean;
  error?: string;
}

export interface AuthCompleteResponse {
  ok: boolean;
  code?: string;
  description?: string;
  error?: string;
}

export interface PendingAuthCallbackResponse {
  ok: boolean;
  callbackUrlOrToken?: string;
  error?: string;
}

export interface StoredAuthStateResponse {
  ok: boolean;
  hasStoredAuthorizationToken: boolean;
  error?: string;
}

export interface CatalogModelsResponse {
  ok: boolean;
  models: ModelCatalogEntry[];
  usedLmsaRefresh?: boolean;
  error?: string;
}

interface ConnectedLookupAttempt {
  mode: 'IMEI' | 'SN';
  code: string;
  description: string;
  romUrl?: string;
}

export interface ConnectedLookupResponse {
  ok: boolean;
  adbAvailable: boolean;
  device?: DeviceInfo;
  attempts: ConnectedLookupAttempt[];
  variants: FirmwareVariant[];
  error?: string;
}

export interface CountryOptionsResponse {
  ok: boolean;
  data?: CatalogCountryOptions;
  error?: string;
}

export interface ManualCatalogLookupResponse {
  ok: boolean;
  data?: CatalogFirmwareLookupResult;
  error?: string;
}

export interface ReadSupportHintsResponse {
  ok: boolean;
  data?: {
    code: string;
    description: string;
    platform: string;
    requiredParameters: string[];
  };
  error?: string;
}

export interface ReadSupportLookupResponse {
  ok: boolean;
  data?: ReadSupportFirmwareLookupResult;
  error?: string;
}

export interface DownloadFirmwareResponse {
  ok: boolean;
  downloadId: string;
  status?: FirmwareTaskStatus;
  savePath?: string;
  fileName?: string;
  bytesDownloaded?: number;
  totalBytes?: number;
  error?: string;
}

export interface RescueLiteFirmwareResponse extends DownloadFirmwareResponse {
  workDir?: string;
  dryRun?: boolean;
  reusedPackage?: boolean;
  reusedExtraction?: boolean;
  flashTransport?: RescueFlashTransport;
  qdlStorage?: RescueQdlStorage;
  qdlSerial?: string;
  commandSource?: string;
  commandPlan?: string[];
}

export interface LocalDownloadedFilesResponse {
  ok: boolean;
  files: LocalDownloadedFile[];
  error?: string;
}

export interface PlayStoreStatusResponse {
  ok: boolean;
  available: boolean;
  backend?: 'aurora-dispenser';
  authProfileSource?: 'env' | 'file' | 'dispenser';
  authProfilePath?: string;
  authProfileCount?: number;
  toolPath?: string;
  toolSource?: 'bundled' | 'system' | 'custom';
  downloadRoot?: string;
  error?: string;
}

export interface PlayStoreSearchResponse {
  ok: boolean;
  results: PlayStoreSearchResult[];
  error?: string;
}

export interface PlayStoreAppDetailsResponse {
  ok: boolean;
  data?: PlayStoreAppDetails;
  error?: string;
}

export interface PlayStoreDownloadResponse {
  ok: boolean;
  packageName: string;
  downloadRoot?: string;
  artifacts: PlayStoreDownloadedArtifact[];
  error?: string;
}

export interface PlayStoreDownloadsResponse {
  ok: boolean;
  downloadRoot?: string;
  downloads: PlayStoreDownloadGroup[];
  error?: string;
}

export interface PlayStoreInstallResponse {
  ok: boolean;
  packageName: string;
  installedArtifactCount: number;
  installMode?: 'standard' | 'microg';
  detail?: string;
  error?: string;
}

export interface BackupRestoreSnapshotsResponse {
  ok: boolean;
  rootPath: string;
  relativeRootPath?: string;
  snapshots: BackupRestoreSnapshot[];
  error?: string;
}

export interface DeleteBackupSnapshotResponse {
  ok: boolean;
  snapshotId: string;
  detail?: string;
  error?: string;
}

export interface ConnectedBackupPreviewResponse {
  ok: boolean;
  connected: boolean;
  detail?: string;
  snapshot?: BackupRestoreSnapshot;
  error?: string;
}

export interface ConnectedBackupPreviewProgressResponse {
  ok: boolean;
  running: boolean;
  runId: number;
  totalApps: number;
  completedApps: number;
  iconsFound: number;
  failedIcons: number;
  logBaseCount: number;
  logCount: number;
  logs: string[];
  lastLogLine?: string;
  detail?: string;
  currentPackage?: string;
  previewDeviceName?: string;
  previewAndroidVersion?: string;
  apps: BackupRestoreAppEntry[];
  media: BackupRestoreMediaEntry[];
  contacts: BackupRestoreContactEntry[];
  messages: BackupRestoreMessageEntry[];
  files: BackupRestoreFileEntry[];
  categoryErrors?: Record<string, string>;
  error?: string;
}

export interface BackupConnectedDeviceResponse {
  ok: boolean;
  connected: boolean;
  snapshotId?: string;
  snapshotPath?: string;
  relativeSnapshotPath?: string;
  categoryErrors?: Record<string, string>;
  detail?: string;
  error?: string;
}

export interface RestoreBackupSnapshotResponse {
  ok: boolean;
  connected: boolean;
  snapshotId: string;
  attemptedApps: number;
  restoredApps: number;
  failedApps: number;
  attemptedMedia: number;
  restoredMedia: number;
  failedMedia: number;
  attemptedContacts: number;
  restoredContacts: number;
  failedContacts: number;
  attemptedMessages: number;
  restoredMessages: number;
  failedMessages: number;
  attemptedFiles: number;
  restoredFiles: number;
  failedFiles: number;
  detail?: string;
  error?: string;
}

export interface ExtractLocalFirmwareResponse {
  ok: boolean;
  filePath: string;
  fileName: string;
  extractedDir?: string;
  reusedExtraction?: boolean;
  error?: string;
}

export interface ReadLocalFileContentResponse {
  ok: boolean;
  filePath: string;
  encoding: 'text' | 'base64';
  content?: string;
  error?: string;
}

export interface AttachLocalRecipeResponse {
  ok: boolean;
  filePath: string;
  recipeUrl?: string;
  code?: string;
  description?: string;
  error?: string;
}

export interface BridgePingResponse {
  ok: boolean;
  serverTime?: number;
  error?: string;
}

export interface CancelDownloadResponse {
  ok: boolean;
  downloadId: string;
  status: 'canceling' | 'not_found';
  error?: string;
}

export interface WindowsQdloaderDriverInstallResponse {
  ok: boolean;
  attempted: boolean;
  method: 'qdloader-setup';
  detail?: string;
  error?: string;
}

export interface WindowsQdloaderDriverStatusResponse {
  ok: boolean;
  installed: boolean;
  detail?: string;
  error?: string;
}

export interface WindowsSpdDriverInstallResponse {
  ok: boolean;
  attempted: boolean;
  method: 'spd-setup';
  detail?: string;
  error?: string;
}

export interface WindowsMtkDriverInstallResponse {
  ok: boolean;
  attempted: boolean;
  method: 'mtk-setup';
  detail?: string;
  error?: string;
}
