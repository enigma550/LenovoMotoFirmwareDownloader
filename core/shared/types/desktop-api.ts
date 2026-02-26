import type { CatalogCountryOptions } from './catalog-country-options';
import type { CatalogFirmwareLookupResult } from './catalog-firmware-lookup-result';
import type { DeviceInfo } from './device-info';
import type { FirmwareVariant } from './firmware-variant';
import type { ModelCatalogEntry } from './model-catalog-entry';
import type { ReadSupportFirmwareLookupResult } from './read-support-firmware-lookup-result';

export type {
  CatalogCountryOptions,
  CatalogFirmwareLookupResult,
  DeviceInfo,
  FirmwareVariant,
  ModelCatalogEntry,
  ReadSupportFirmwareLookupResult,
};

export interface AuthStartResponse {
  ok: boolean;
  loginUrl?: string;
  error?: string;
}

export interface AuthCompleteResponse {
  ok: boolean;
  code?: string;
  description?: string;
  error?: string;
}

export interface StoredAuthStateResponse {
  ok: boolean;
  hasStoredWustToken: boolean;
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
  fastbootAvailable: boolean;
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

export interface LocalDownloadedFilesResponse {
  ok: boolean;
  files: LocalDownloadedFile[];
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

export interface DesktopIntegrationStatus {
  ok: boolean;
  status: 'ok' | 'missing' | 'wrong_wmclass' | 'not_linux';
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

export interface WindowsQdloaderDriverInstallResponse {
  ok: boolean;
  attempted: boolean;
  method: 'qdloader-setup';
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

export interface WindowsQdloaderDriverStatusResponse {
  ok: boolean;
  installed: boolean;
  detail?: string;
  error?: string;
}

export interface SetDesktopPromptPreferenceRequest {
  ask: boolean;
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
  error?: string;
}

export interface DeleteLocalFileRequest {
  filePath: string;
}

export interface PauseDownloadRequest {
  downloadId: string;
}

export interface ResumeDownloadRequest {
  downloadId: string;
}

export interface AuthCompleteRequest {
  callbackUrlOrToken: string;
}

export interface GetCatalogModelsRequest {
  refresh?: boolean;
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

export interface CancelDownloadRequest {
  downloadId: string;
}

export interface DesktopApi {
  isDesktop: true;
  startAuth: () => Promise<AuthStartResponse>;
  completeAuth: (
    callbackUrlOrToken: AuthCompleteRequest['callbackUrlOrToken'],
  ) => Promise<AuthCompleteResponse>;
  getStoredAuthState: () => Promise<StoredAuthStateResponse>;
  authWithStoredToken: () => Promise<AuthCompleteResponse>;
  ping: () => Promise<BridgePingResponse>;
  getCatalogModels: (
    refresh?: GetCatalogModelsRequest['refresh'],
  ) => Promise<CatalogModelsResponse>;
  lookupConnectedDeviceFirmware: () => Promise<ConnectedLookupResponse>;
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
  extractLocalFirmware: (
    payload: ExtractLocalFirmwareRequest,
  ) => Promise<ExtractLocalFirmwareResponse>;
  attachLocalRecipeFromModel: (
    payload: AttachLocalRecipeFromModelRequest,
  ) => Promise<AttachLocalRecipeResponse>;
  attachLocalRecipeMetadata: (
    payload: AttachLocalRecipeMetadataRequest,
  ) => Promise<AttachLocalRecipeResponse>;
  cancelDownload: (payload: CancelDownloadRequest) => Promise<CancelDownloadResponse>;
  checkDesktopIntegration: () => Promise<DesktopIntegrationStatus>;
  createDesktopIntegration: () => Promise<DesktopIntegrationStatus>;
  getDesktopPromptPreference: () => Promise<boolean>;
  setDesktopPromptPreference: (payload: SetDesktopPromptPreferenceRequest) => Promise<boolean>;
  getAppInfo: () => Promise<AppInfo>;
  listLocalDownloadedFiles: () => Promise<LocalDownloadedFilesResponse>;
  openUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
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

declare global {
  interface Window {
    desktopApi?: DesktopApi;
    openUrl(url: string): Promise<{ ok: boolean; error?: string }>;
  }
}
