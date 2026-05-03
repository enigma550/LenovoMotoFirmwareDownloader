/**
 * Request interfaces and the DesktopApi contract.
 * Separated from response/entity types for single-responsibility.
 */

import type { ModelCatalogEntry } from '../../domain/catalog/model';
import type { DeviceInfo } from '../../domain/device/info';
import type {
  AppInfo,
  DesktopIntegrationStatus,
  FrameworkUpdateInfo,
  PlayStoreArch,
  RescueFlashTransport,
  RescueQdlStorage,
} from './entries';
import type {
  AttachLocalRecipeResponse,
  AuthCompleteResponse,
  AuthStartResponse,
  BackupConnectedDeviceResponse,
  BackupRestoreSnapshotsResponse,
  BridgePingResponse,
  CancelDownloadResponse,
  CatalogModelsResponse,
  ConnectedBackupPreviewProgressResponse,
  ConnectedBackupPreviewResponse,
  ConnectedLookupResponse,
  CountryOptionsResponse,
  DeleteBackupSnapshotResponse,
  DownloadFirmwareResponse,
  ExtractLocalFirmwareResponse,
  LocalDownloadedFilesResponse,
  ManualCatalogLookupResponse,
  PendingAuthCallbackResponse,
  PlayStoreAppDetailsResponse,
  PlayStoreDeleteDownloadResponse,
  PlayStoreDownloadResponse,
  PlayStoreDownloadsResponse,
  PlayStoreInstallResponse,
  PlayStoreSearchResponse,
  PlayStoreStatusResponse,
  ReadLocalFileContentResponse,
  ReadSupportHintsResponse,
  ReadSupportLookupResponse,
  RescueLiteFirmwareResponse,
  RestoreBackupSnapshotResponse,
  StoredAuthStateResponse,
  WindowsMtkDriverInstallResponse,
  WindowsQdloaderDriverInstallResponse,
  WindowsQdloaderDriverStatusResponse,
  WindowsSpdDriverInstallResponse,
} from './responses';

export interface SetDesktopPromptPreferenceRequest {
  ask: boolean;
}

export interface BackupConnectedDeviceRequest {
  includeApps?: boolean;
  includeMedia?: boolean;
  includeContacts?: boolean;
  includeMessages?: boolean;
  includeFiles?: boolean;
  maxApps?: number;
  selectedPackages?: string[];
  selectedMediaPaths?: string[];
  selectedContactIds?: string[];
  selectedMessageIds?: string[];
  selectedFilePaths?: string[];
}

export interface RestoreBackupSnapshotRequest {
  snapshotId: string;
  restoreApps?: boolean;
  restoreMedia?: boolean;
  restoreContacts?: boolean;
  restoreMessages?: boolean;
  restoreFiles?: boolean;
}

export interface DeleteBackupSnapshotRequest {
  snapshotId: string;
}

export interface ExtractLocalFirmwareRequest {
  filePath: string;
  fileName: string;
  extractedDir?: string;
}

export interface AttachLocalRecipeFromModelRequest {
  filePath: string;
  fileName: string;
  modelName: string;
  marketName?: string;
  category?: string;
}

export interface AttachLocalRecipeMetadataRequest {
  filePath: string;
  fileName: string;
  recipeUrl: string;
  romName?: string;
  romUrl?: string;
  publishDate?: string;
  romMatchIdentifier?: string;
  selectedParameters?: Record<string, string>;
  source?: string;
}

export interface DeleteLocalFileRequest {
  filePath: string;
}

export interface ReadLocalFileContentRequest {
  filePath: string;
  encoding: 'text' | 'base64';
}

export interface PauseDownloadRequest {
  downloadId: string;
}

export interface ResumeDownloadRequest {
  downloadId: string;
}

export interface PlayStoreSearchRequest {
  query: string;
  limit?: number;
  arch?: PlayStoreArch;
}

export interface PlayStoreAppDetailsRequest {
  packageName: string;
  arch?: PlayStoreArch;
}

export interface PlayStoreDownloadRequest {
  packageName: string;
  title?: string;
  iconUrl?: string;
  arch?: PlayStoreArch;
  includeSplits?: boolean;
  includeExtras?: boolean;
}

export interface PlayStoreInstallRequest {
  packageName: string;
  artifactPaths: string[];
  mode?: 'standard' | 'microg';
}

export interface PlayStoreDeleteDownloadRequest {
  packageName: string;
  artifactPaths: string[];
}

export interface AuthCompleteRequest {
  callbackUrlOrToken: string;
}

export interface GetCatalogModelsRequest {
  refresh?: boolean;
}

export interface LookupConnectedDeviceFirmwareFromDeviceInfoRequest {
  device: DeviceInfo;
  adbAvailable?: boolean;
}

export interface DiscoverCountryOptionsRequest {
  model: ModelCatalogEntry;
}

export interface LookupCatalogManualRequest {
  model: ModelCatalogEntry;
  countryValue?: string;
  allCountries?: boolean;
}

export interface ReadSupportHintsRequest {
  modelName: string;
}

export interface LookupReadSupportByImeiRequest {
  model: ModelCatalogEntry;
  imei: string;
  imei2?: string;
  sn?: string;
  roCarrier?: string;
  channelId?: string;
}

export interface LookupReadSupportBySnRequest {
  model: ModelCatalogEntry;
  sn: string;
  channelId?: string;
}

export interface LookupReadSupportByParamsRequest {
  model: ModelCatalogEntry;
  params: Record<string, string>;
  imei?: string;
  imei2?: string;
  sn?: string;
  channelId?: string;
}

export interface DownloadFirmwareRequest {
  downloadId: string;
  romUrl: string;
  romName: string;
  publishDate?: string;
  romMatchIdentifier?: string;
  selectedParameters?: Record<string, string>;
  recipeUrl?: string;
}

export interface RescueLiteFirmwareRequest {
  downloadId: string;
  romUrl: string;
  romName: string;
  publishDate?: string;
  romMatchIdentifier?: string;
  selectedParameters?: Record<string, string>;
  recipeUrl?: string;
  dataReset: 'yes' | 'no';
  dryRun?: boolean;
  flashTransport?: RescueFlashTransport;
  qdlStorage?: RescueQdlStorage;
  qdlSerial?: string;
}

export interface RescueLiteFirmwareFromLocalRequest {
  downloadId: string;
  filePath: string;
  fileName: string;
  extractedDir?: string;
  publishDate?: string;
  romMatchIdentifier?: string;
  selectedParameters?: Record<string, string>;
  recipeUrl?: string;
  dataReset: 'yes' | 'no';
  dryRun?: boolean;
  flashTransport?: RescueFlashTransport;
  qdlStorage?: RescueQdlStorage;
  qdlSerial?: string;
}

export interface CancelDownloadRequest {
  downloadId: string;
}

export interface DesktopApi {
  isDesktop: true;
  startAuth: () => Promise<AuthStartResponse>;
  completeAuth: (
    callbackUrlOrToken: AuthCompleteRequest['callbackUrlOrToken'],
  ) => Promise<AuthCompleteResponse>;
  consumePendingAuthCallback: () => Promise<PendingAuthCallbackResponse>;
  getStoredAuthState: () => Promise<StoredAuthStateResponse>;
  authWithStoredToken: () => Promise<AuthCompleteResponse>;
  ping: () => Promise<BridgePingResponse>;
  getCatalogModels: (
    refresh?: GetCatalogModelsRequest['refresh'],
  ) => Promise<CatalogModelsResponse>;
  lookupConnectedDeviceFirmware: () => Promise<ConnectedLookupResponse>;
  lookupConnectedDeviceFirmwareFromDeviceInfo: (
    payload: LookupConnectedDeviceFirmwareFromDeviceInfoRequest,
  ) => Promise<ConnectedLookupResponse>;
  discoverCountryOptions: (
    model: DiscoverCountryOptionsRequest['model'],
  ) => Promise<CountryOptionsResponse>;
  lookupCatalogManual: (
    model: LookupCatalogManualRequest['model'],
    countryValue?: LookupCatalogManualRequest['countryValue'],
    allCountries?: LookupCatalogManualRequest['allCountries'],
  ) => Promise<ManualCatalogLookupResponse>;
  getReadSupportHints: (
    modelName: ReadSupportHintsRequest['modelName'],
  ) => Promise<ReadSupportHintsResponse>;
  lookupReadSupportByImei: (
    payload: LookupReadSupportByImeiRequest,
  ) => Promise<ReadSupportLookupResponse>;
  lookupReadSupportBySn: (
    payload: LookupReadSupportBySnRequest,
  ) => Promise<ReadSupportLookupResponse>;
  lookupReadSupportByParams: (
    payload: LookupReadSupportByParamsRequest,
  ) => Promise<ReadSupportLookupResponse>;
  downloadFirmware: (payload: DownloadFirmwareRequest) => Promise<DownloadFirmwareResponse>;
  rescueLiteFirmware: (payload: RescueLiteFirmwareRequest) => Promise<RescueLiteFirmwareResponse>;
  rescueLiteFirmwareFromLocal: (
    payload: RescueLiteFirmwareFromLocalRequest,
  ) => Promise<RescueLiteFirmwareResponse>;
  getPlayStoreStatus: () => Promise<PlayStoreStatusResponse>;
  listPlayStoreDownloads: () => Promise<PlayStoreDownloadsResponse>;
  searchPlayStoreApps: (payload: PlayStoreSearchRequest) => Promise<PlayStoreSearchResponse>;
  getPlayStoreAppDetails: (
    payload: PlayStoreAppDetailsRequest,
  ) => Promise<PlayStoreAppDetailsResponse>;
  downloadPlayStoreApp: (payload: PlayStoreDownloadRequest) => Promise<PlayStoreDownloadResponse>;
  deletePlayStoreDownload: (
    payload: PlayStoreDeleteDownloadRequest,
  ) => Promise<PlayStoreDeleteDownloadResponse>;
  installPlayStoreApp: (payload: PlayStoreInstallRequest) => Promise<PlayStoreInstallResponse>;
  extractLocalFirmware: (
    payload: ExtractLocalFirmwareRequest,
  ) => Promise<ExtractLocalFirmwareResponse>;
  readLocalFileContent: (
    payload: ReadLocalFileContentRequest,
  ) => Promise<ReadLocalFileContentResponse>;
  attachLocalRecipeFromModel: (
    payload: AttachLocalRecipeFromModelRequest,
  ) => Promise<AttachLocalRecipeResponse>;
  attachLocalRecipeMetadata: (
    payload: AttachLocalRecipeMetadataRequest,
  ) => Promise<AttachLocalRecipeResponse>;
  cancelDownload: (payload: CancelDownloadRequest) => Promise<CancelDownloadResponse>;
  listLocalDownloadedFiles: () => Promise<LocalDownloadedFilesResponse>;
  listBackupRestoreSnapshots: () => Promise<BackupRestoreSnapshotsResponse>;
  deleteBackupSnapshot: (
    payload: DeleteBackupSnapshotRequest,
  ) => Promise<DeleteBackupSnapshotResponse>;
  scanConnectedBackupPreview: () => Promise<ConnectedBackupPreviewResponse>;
  getConnectedBackupPreviewProgress: () => Promise<ConnectedBackupPreviewProgressResponse>;
  cancelConnectedBackupProcess: () => Promise<{ ok: boolean; detail: string }>;
  backupConnectedDevice: (
    payload?: BackupConnectedDeviceRequest,
  ) => Promise<BackupConnectedDeviceResponse>;
  restoreBackupSnapshot: (
    payload: RestoreBackupSnapshotRequest,
  ) => Promise<RestoreBackupSnapshotResponse>;
  checkDesktopIntegration: () => Promise<DesktopIntegrationStatus>;
  createDesktopIntegration: () => Promise<DesktopIntegrationStatus>;
  getDesktopPromptPreference: () => Promise<{
    ok: boolean;
    ask: boolean;
    error?: string;
  }>;
  setDesktopPromptPreference: (
    payload: SetDesktopPromptPreferenceRequest,
  ) => Promise<{ ok: boolean; ask: boolean; error?: string }>;
  getAppInfo: () => Promise<AppInfo>;
  openUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
  switchSoftwareFixProtocolToLmfd: () => Promise<{ ok: boolean; error?: string }>;
  restoreSoftwareFixProtocolHandler: () => Promise<{ ok: boolean; error?: string }>;
  checkFrameworkUpdate: () => Promise<FrameworkUpdateInfo>;
  downloadFrameworkUpdate: () => Promise<void>;
  applyFrameworkUpdate: () => Promise<void>;
  getWindowsQdloaderDriverStatus: () => Promise<WindowsQdloaderDriverStatusResponse>;
  installWindowsQdloaderDriver: () => Promise<WindowsQdloaderDriverInstallResponse>;
  installWindowsSpdDriver: () => Promise<WindowsSpdDriverInstallResponse>;
  installWindowsMtkDriver: () => Promise<WindowsMtkDriverInstallResponse>;
  deleteLocalFile: (payload: DeleteLocalFileRequest) => Promise<{ ok: boolean; error?: string }>;
  pauseDownload: (payload: PauseDownloadRequest) => Promise<{ ok: boolean; error?: string }>;
  resumeDownload: (payload: ResumeDownloadRequest) => Promise<DownloadFirmwareResponse>;
}
