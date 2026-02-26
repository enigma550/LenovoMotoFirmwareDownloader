import type { ElectrobunRPCSchema, RPCSchema } from 'electrobun';
import type {
  AttachLocalRecipeFromModelRequest,
  AttachLocalRecipeMetadataRequest,
  AttachLocalRecipeResponse,
  AuthCompleteRequest,
  BridgePingResponse,
  CancelDownloadRequest,
  DeleteLocalFileRequest,
  DesktopApi,
  DiscoverCountryOptionsRequest,
  DownloadFirmwareRequest,
  DownloadProgressMessage,
  ExtractLocalFirmwareRequest,
  ExtractLocalFirmwareResponse,
  GetCatalogModelsRequest,
  LocalDownloadedFilesResponse,
  LookupCatalogManualRequest,
  LookupReadSupportByImeiRequest,
  LookupReadSupportByParamsRequest,
  LookupReadSupportBySnRequest,
  PauseDownloadRequest,
  ReadSupportHintsRequest,
  RescueLiteFirmwareFromLocalRequest,
  RescueLiteFirmwareRequest,
  ResumeDownloadRequest,
  SetDesktopPromptPreferenceRequest,
  WindowsEdlDriverInstallResponse,
} from '../../core/shared/types/desktop-api.ts';

export type {
  AttachLocalRecipeFromModelRequest,
  AttachLocalRecipeMetadataRequest,
  AttachLocalRecipeResponse,
  AuthCompleteRequest,
  AuthCompleteResponse,
  AuthStartResponse,
  BridgePingResponse,
  CancelDownloadRequest,
  CancelDownloadResponse,
  CatalogCountryOptions,
  CatalogFirmwareLookupResult,
  CatalogModelsResponse,
  ConnectedLookupResponse,
  CountryOptionsResponse,
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
  LookupReadSupportByImeiRequest,
  LookupReadSupportByParamsRequest,
  LookupReadSupportBySnRequest,
  ManualCatalogLookupResponse,
  ModelCatalogEntry,
  ReadSupportFirmwareLookupResult,
  ReadSupportHintsRequest,
  ReadSupportHintsResponse,
  ReadSupportLookupResponse,
  RescueFlashTransport,
  RescueLiteFirmwareFromLocalRequest,
  RescueLiteFirmwareRequest,
  RescueLiteFirmwareResponse,
  RescueQdlStorage,
  StoredAuthStateResponse,
  WindowsEdlDriverInstallResponse,
} from '../../core/shared/types/desktop-api.ts';

type RpcRequest<Params, Response> = {
  params: Params;
  response: Response;
};

type DesktopApiMethod = {
  [Method in keyof DesktopApi]: DesktopApi[Method] extends (...args: infer _Args) => unknown
    ? Method
    : never;
}[keyof DesktopApi];

type DesktopApiResponse<Method extends DesktopApiMethod> = Awaited<ReturnType<DesktopApi[Method]>>;

export type DesktopRpcSchema = ElectrobunRPCSchema & {
  bun: RPCSchema<{
    requests: {
      authStart: RpcRequest<undefined, DesktopApiResponse<'startAuth'>>;
      authComplete: RpcRequest<AuthCompleteRequest, DesktopApiResponse<'completeAuth'>>;
      getStoredAuthState: RpcRequest<undefined, DesktopApiResponse<'getStoredAuthState'>>;
      authWithStoredToken: RpcRequest<undefined, DesktopApiResponse<'authWithStoredToken'>>;
      ping: RpcRequest<undefined, BridgePingResponse>;
      getCatalogModels: RpcRequest<GetCatalogModelsRequest, DesktopApiResponse<'getCatalogModels'>>;
      lookupConnectedDeviceFirmware: RpcRequest<
        undefined,
        DesktopApiResponse<'lookupConnectedDeviceFirmware'>
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
      extractLocalFirmware: RpcRequest<ExtractLocalFirmwareRequest, ExtractLocalFirmwareResponse>;
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
      installWindowsEdlDriver: RpcRequest<undefined, WindowsEdlDriverInstallResponse>;
      deleteLocalFile: RpcRequest<DeleteLocalFileRequest, DesktopApiResponse<'deleteLocalFile'>>;
      pauseDownload: RpcRequest<PauseDownloadRequest, DesktopApiResponse<'pauseDownload'>>;
      resumeDownload: RpcRequest<ResumeDownloadRequest, DesktopApiResponse<'resumeDownload'>>;
    };
  }>;
  webview: RPCSchema<{
    requests: Record<PropertyKey, never>;
    messages: {
      downloadProgress: DownloadProgressMessage;
    };
  }>;
};
