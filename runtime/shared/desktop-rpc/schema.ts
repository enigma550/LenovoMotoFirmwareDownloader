import type { RPCSchema } from 'electrobun';
import type {
  AttachLocalRecipeFromModelRequest,
  AttachLocalRecipeMetadataRequest,
  AttachLocalRecipeResponse,
  AuthCompleteRequest,
  BackupConnectedDeviceRequest,
  BackupConnectedDeviceResponse,
  BackupRestoreSnapshotsResponse,
  BridgePingResponse,
  CancelDownloadRequest,
  ConnectedBackupPreviewProgressResponse,
  ConnectedBackupPreviewResponse,
  DeleteBackupSnapshotRequest,
  DeleteBackupSnapshotResponse,
  DeleteLocalFileRequest,
  DesktopApiResponse,
  DesktopRpcBaseSchema,
  DesktopRpcWebviewSchema,
  DiscoverCountryOptionsRequest,
  DownloadFirmwareRequest,
  ExtractLocalFirmwareRequest,
  ExtractLocalFirmwareResponse,
  GetCatalogModelsRequest,
  LocalDownloadedFilesResponse,
  LookupCatalogManualRequest,
  LookupConnectedDeviceFirmwareFromDeviceInfoRequest,
  LookupReadSupportByImeiRequest,
  LookupReadSupportByParamsRequest,
  LookupReadSupportBySnRequest,
  PauseDownloadRequest,
  ReadLocalFileContentRequest,
  ReadLocalFileContentResponse,
  ReadSupportHintsRequest,
  RescueLiteFirmwareFromLocalRequest,
  RescueLiteFirmwareRequest,
  RestoreBackupSnapshotRequest,
  RestoreBackupSnapshotResponse,
  ResumeDownloadRequest,
  RpcRequest,
  SetDesktopPromptPreferenceRequest,
  WindowsMtkDriverInstallResponse,
  WindowsQdloaderDriverInstallResponse,
  WindowsQdloaderDriverStatusResponse,
  WindowsSpdDriverInstallResponse,
} from './types.ts';

export type DesktopRpcSchema = DesktopRpcBaseSchema & {
  bun: RPCSchema<{
    requests: {
      authStart: RpcRequest<undefined, DesktopApiResponse<'startAuth'>>;
      authComplete: RpcRequest<AuthCompleteRequest, DesktopApiResponse<'completeAuth'>>;
      consumePendingAuthCallback: RpcRequest<
        undefined,
        DesktopApiResponse<'consumePendingAuthCallback'>
      >;
      getStoredAuthState: RpcRequest<undefined, DesktopApiResponse<'getStoredAuthState'>>;
      authWithStoredToken: RpcRequest<undefined, DesktopApiResponse<'authWithStoredToken'>>;
      ping: RpcRequest<undefined, BridgePingResponse>;
      getCatalogModels: RpcRequest<GetCatalogModelsRequest, DesktopApiResponse<'getCatalogModels'>>;
      lookupConnectedDeviceFirmware: RpcRequest<
        undefined,
        DesktopApiResponse<'lookupConnectedDeviceFirmware'>
      >;
      lookupConnectedDeviceFirmwareFromDeviceInfo: RpcRequest<
        LookupConnectedDeviceFirmwareFromDeviceInfoRequest,
        DesktopApiResponse<'lookupConnectedDeviceFirmwareFromDeviceInfo'>
      >;
      discoverCountryOptions: RpcRequest<
        DiscoverCountryOptionsRequest,
        DesktopApiResponse<'discoverCountryOptions'>
      >;
      lookupCatalogManual: RpcRequest<
        LookupCatalogManualRequest,
        DesktopApiResponse<'lookupCatalogManual'>
      >;
      getReadSupportHints: RpcRequest<
        ReadSupportHintsRequest,
        DesktopApiResponse<'getReadSupportHints'>
      >;
      lookupReadSupportByImei: RpcRequest<
        LookupReadSupportByImeiRequest,
        DesktopApiResponse<'lookupReadSupportByImei'>
      >;
      lookupReadSupportBySn: RpcRequest<
        LookupReadSupportBySnRequest,
        DesktopApiResponse<'lookupReadSupportBySn'>
      >;
      lookupReadSupportByParams: RpcRequest<
        LookupReadSupportByParamsRequest,
        DesktopApiResponse<'lookupReadSupportByParams'>
      >;
      downloadFirmware: RpcRequest<DownloadFirmwareRequest, DesktopApiResponse<'downloadFirmware'>>;
      rescueLiteFirmware: RpcRequest<
        RescueLiteFirmwareRequest,
        DesktopApiResponse<'rescueLiteFirmware'>
      >;
      rescueLiteFirmwareFromLocal: RpcRequest<
        RescueLiteFirmwareFromLocalRequest,
        DesktopApiResponse<'rescueLiteFirmwareFromLocal'>
      >;
      cancelDownload: RpcRequest<CancelDownloadRequest, DesktopApiResponse<'cancelDownload'>>;
      listLocalDownloadedFiles: RpcRequest<undefined, LocalDownloadedFilesResponse>;
      listBackupRestoreSnapshots: RpcRequest<undefined, BackupRestoreSnapshotsResponse>;
      deleteBackupSnapshot: RpcRequest<DeleteBackupSnapshotRequest, DeleteBackupSnapshotResponse>;
      scanConnectedBackupPreview: RpcRequest<undefined, ConnectedBackupPreviewResponse>;
      getConnectedBackupPreviewProgress: RpcRequest<
        undefined,
        ConnectedBackupPreviewProgressResponse
      >;
      cancelConnectedBackupProcess: RpcRequest<undefined, { ok: boolean; detail: string }>;
      backupConnectedDevice: RpcRequest<
        BackupConnectedDeviceRequest,
        BackupConnectedDeviceResponse
      >;
      restoreBackupSnapshot: RpcRequest<
        RestoreBackupSnapshotRequest,
        RestoreBackupSnapshotResponse
      >;
      extractLocalFirmware: RpcRequest<ExtractLocalFirmwareRequest, ExtractLocalFirmwareResponse>;
      readLocalFileContent: RpcRequest<ReadLocalFileContentRequest, ReadLocalFileContentResponse>;
      attachLocalRecipeFromModel: RpcRequest<
        AttachLocalRecipeFromModelRequest,
        AttachLocalRecipeResponse
      >;
      attachLocalRecipeMetadata: RpcRequest<
        AttachLocalRecipeMetadataRequest,
        AttachLocalRecipeResponse
      >;
      checkDesktopIntegration: RpcRequest<undefined, DesktopApiResponse<'checkDesktopIntegration'>>;
      createDesktopIntegration: RpcRequest<
        undefined,
        DesktopApiResponse<'createDesktopIntegration'>
      >;
      getDesktopPromptPreference: RpcRequest<
        undefined,
        DesktopApiResponse<'getDesktopPromptPreference'>
      >;
      setDesktopPromptPreference: RpcRequest<
        SetDesktopPromptPreferenceRequest,
        DesktopApiResponse<'setDesktopPromptPreference'>
      >;
      getAppInfo: RpcRequest<undefined, DesktopApiResponse<'getAppInfo'>>;
      openUrl: RpcRequest<{ url: string }, DesktopApiResponse<'openUrl'>>;
      downloadFrameworkUpdate: RpcRequest<undefined, DesktopApiResponse<'downloadFrameworkUpdate'>>;
      applyFrameworkUpdate: RpcRequest<undefined, DesktopApiResponse<'applyFrameworkUpdate'>>;
      getWindowsQdloaderDriverStatus: RpcRequest<undefined, WindowsQdloaderDriverStatusResponse>;
      installWindowsQdloaderDriver: RpcRequest<undefined, WindowsQdloaderDriverInstallResponse>;
      installWindowsSpdDriver: RpcRequest<undefined, WindowsSpdDriverInstallResponse>;
      installWindowsMtkDriver: RpcRequest<undefined, WindowsMtkDriverInstallResponse>;
      deleteLocalFile: RpcRequest<DeleteLocalFileRequest, DesktopApiResponse<'deleteLocalFile'>>;
      pauseDownload: RpcRequest<PauseDownloadRequest, DesktopApiResponse<'pauseDownload'>>;
      resumeDownload: RpcRequest<ResumeDownloadRequest, DesktopApiResponse<'resumeDownload'>>;
    };
  }>;
  webview: DesktopRpcWebviewSchema;
};
