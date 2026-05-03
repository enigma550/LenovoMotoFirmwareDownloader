import type { ElectrobunRPCSchema, RPCSchema } from 'electrobun';
import type { DesktopApi, DownloadProgressMessage } from '../../../core/contracts/desktop/index.ts';

export type {
  AttachLocalRecipeFromModelRequest,
  AttachLocalRecipeMetadataRequest,
  AttachLocalRecipeResponse,
  AuthCompleteRequest,
  AuthCompleteResponse,
  AuthStartResponse,
  BackupConnectedDeviceRequest,
  BackupConnectedDeviceResponse,
  BackupRestoreAppEntry,
  BackupRestoreContactEntry,
  BackupRestoreFileEntry,
  BackupRestoreMediaEntry,
  BackupRestoreMessageEntry,
  BackupRestoreSnapshot,
  BackupRestoreSnapshotsResponse,
  BridgePingResponse,
  CancelDownloadRequest,
  CancelDownloadResponse,
  CatalogCountryOptions,
  CatalogFirmwareLookupResult,
  CatalogModelsResponse,
  ConnectedBackupPreviewProgressResponse,
  ConnectedBackupPreviewResponse,
  ConnectedLookupResponse,
  CountryOptionsResponse,
  DeleteBackupSnapshotRequest,
  DeleteBackupSnapshotResponse,
  DeleteLocalFileRequest,
  DesktopApi,
  DeviceInfo,
  DiscoverCountryOptionsRequest,
  DownloadFirmwareRequest,
  DownloadFirmwareResponse,
  DownloadProgressMessage,
  ExtractLocalFirmwareRequest,
  ExtractLocalFirmwareResponse,
  FirmwareTaskStatus,
  FirmwareVariant,
  GetCatalogModelsRequest,
  LocalDownloadedFile,
  LocalDownloadedFilesResponse,
  LookupCatalogManualRequest,
  LookupConnectedDeviceFirmwareFromDeviceInfoRequest,
  LookupReadSupportByImeiRequest,
  LookupReadSupportByParamsRequest,
  LookupReadSupportBySnRequest,
  ManualCatalogLookupResponse,
  ModelCatalogEntry,
  PauseDownloadRequest,
  PendingAuthCallbackResponse,
  PlayStoreAppDetails,
  PlayStoreAppDetailsRequest,
  PlayStoreAppDetailsResponse,
  PlayStoreArch,
  PlayStoreDeleteDownloadRequest,
  PlayStoreDeleteDownloadResponse,
  PlayStoreDownloadedArtifact,
  PlayStoreDownloadGroup,
  PlayStoreDownloadRequest,
  PlayStoreDownloadResponse,
  PlayStoreDownloadsResponse,
  PlayStoreInstallRequest,
  PlayStoreInstallResponse,
  PlayStoreSearchRequest,
  PlayStoreSearchResponse,
  PlayStoreSearchResult,
  PlayStoreStatusResponse,
  ReadLocalFileContentRequest,
  ReadLocalFileContentResponse,
  ReadSupportFirmwareLookupResult,
  ReadSupportHintsRequest,
  ReadSupportHintsResponse,
  ReadSupportLookupResponse,
  RescueFlashTransport,
  RescueLiteFirmwareFromLocalRequest,
  RescueLiteFirmwareRequest,
  RescueLiteFirmwareResponse,
  RescueQdlStorage,
  RestoreBackupSnapshotRequest,
  RestoreBackupSnapshotResponse,
  ResumeDownloadRequest,
  SetDesktopPromptPreferenceRequest,
  StoredAuthStateResponse,
  WindowsMtkDriverInstallResponse,
  WindowsQdloaderDriverInstallResponse,
  WindowsQdloaderDriverStatusResponse,
  WindowsSpdDriverInstallResponse,
} from '../../../core/contracts/desktop/index.ts';

export type RpcRequest<Params, Response> = {
  params: Params;
  response: Response;
};

export type RpcPayloadValue = object | string | number | boolean | null | undefined;
export type NormalizeRpcResponse<Value> = Value extends RpcPayloadValue
  ? Value
  : undefined extends Value
    ? undefined
    : never;

export type DesktopApiMethod = {
  [Method in keyof DesktopApi]: DesktopApi[Method] extends (
    ...args: infer _Args
  ) => Promise<infer ReturnValue>
    ? NormalizeRpcResponse<ReturnValue> extends never
      ? never
      : Method
    : never;
}[keyof DesktopApi];

export type DesktopApiResponse<Method extends DesktopApiMethod> = NormalizeRpcResponse<
  Awaited<ReturnType<DesktopApi[Method]>>
>;

export type DesktopRpcWebviewSchema = RPCSchema<{
  requests: Record<PropertyKey, never>;
  messages: {
    downloadProgress: DownloadProgressMessage;
  };
}>;

export type DesktopRpcBaseSchema = ElectrobunRPCSchema;
