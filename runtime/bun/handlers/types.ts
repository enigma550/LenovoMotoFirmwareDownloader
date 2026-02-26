import type {
  AttachLocalRecipeFromModelRequest,
  AttachLocalRecipeMetadataRequest,
  AttachLocalRecipeResponse,
  AuthCompleteRequest,
  CancelDownloadRequest,
  DesktopApi,
  DiscoverCountryOptionsRequest,
  DownloadFirmwareRequest,
  DownloadProgressMessage,
  ExtractLocalFirmwareRequest,
  GetCatalogModelsRequest,
  LocalDownloadedFilesResponse,
  LookupCatalogManualRequest,
  LookupReadSupportByImeiRequest,
  LookupReadSupportByParamsRequest,
  LookupReadSupportBySnRequest,
  ReadSupportHintsRequest,
  RescueLiteFirmwareFromLocalRequest,
  RescueLiteFirmwareRequest,
} from '../../shared/rpc.ts';

type RpcPayloadValue = object | string | number | boolean | null | undefined;
type NormalizeRpcResponse<Value> = Value extends RpcPayloadValue
  ? Value
  : undefined extends Value
    ? undefined
    : never;

type DesktopApiMethod = {
  [K in keyof DesktopApi]: DesktopApi[K] extends (
    ...args: infer _Args
  ) => Promise<infer ReturnValue>
    ? NormalizeRpcResponse<ReturnValue> extends never
      ? never
      : K
    : never;
}[keyof DesktopApi];

type RpcResponse<Method extends DesktopApiMethod> = NormalizeRpcResponse<
  Awaited<ReturnType<DesktopApi[Method]>>
>;

type RpcHandler<Params, Response> = undefined extends Params
  ? (params?: Params) => Response | Promise<Response>
  : (params: Params) => Response | Promise<Response>;

type RpcVoidHandler = RpcHandler<undefined, void>;

type UnknownRpcHandler = {
  bivarianceHack(
    params?: RpcPayloadValue,
  ): RpcPayloadValue | Promise<RpcPayloadValue> | ReturnType<RpcVoidHandler>;
}['bivarianceHack'];

export interface BunRpcRequestHandlers {
  [method: string]: UnknownRpcHandler | undefined;
  authStart: RpcHandler<undefined, RpcResponse<'startAuth'>>;
  authComplete: RpcHandler<AuthCompleteRequest, RpcResponse<'completeAuth'>>;
  getStoredAuthState: RpcHandler<undefined, RpcResponse<'getStoredAuthState'>>;
  authWithStoredToken: RpcHandler<undefined, RpcResponse<'authWithStoredToken'>>;
  ping: RpcHandler<undefined, RpcResponse<'ping'>>;
  getCatalogModels: RpcHandler<GetCatalogModelsRequest, RpcResponse<'getCatalogModels'>>;
  lookupConnectedDeviceFirmware: RpcHandler<
    undefined,
    RpcResponse<'lookupConnectedDeviceFirmware'>
  >;
  discoverCountryOptions: RpcHandler<
    DiscoverCountryOptionsRequest,
    RpcResponse<'discoverCountryOptions'>
  >;
  lookupCatalogManual: RpcHandler<LookupCatalogManualRequest, RpcResponse<'lookupCatalogManual'>>;
  getReadSupportHints: RpcHandler<ReadSupportHintsRequest, RpcResponse<'getReadSupportHints'>>;
  lookupReadSupportByImei: RpcHandler<
    LookupReadSupportByImeiRequest,
    RpcResponse<'lookupReadSupportByImei'>
  >;
  lookupReadSupportBySn: RpcHandler<
    LookupReadSupportBySnRequest,
    RpcResponse<'lookupReadSupportBySn'>
  >;
  lookupReadSupportByParams: RpcHandler<
    LookupReadSupportByParamsRequest,
    RpcResponse<'lookupReadSupportByParams'>
  >;
  downloadFirmware: RpcHandler<DownloadFirmwareRequest, RpcResponse<'downloadFirmware'>>;
  rescueLiteFirmware: RpcHandler<RescueLiteFirmwareRequest, RpcResponse<'rescueLiteFirmware'>>;
  rescueLiteFirmwareFromLocal: RpcHandler<
    RescueLiteFirmwareFromLocalRequest,
    RpcResponse<'rescueLiteFirmwareFromLocal'>
  >;
  cancelDownload: RpcHandler<CancelDownloadRequest, RpcResponse<'cancelDownload'>>;
  listLocalDownloadedFiles: RpcHandler<undefined, LocalDownloadedFilesResponse>;
  extractLocalFirmware: RpcHandler<
    ExtractLocalFirmwareRequest,
    RpcResponse<'extractLocalFirmware'>
  >;
  attachLocalRecipeFromModel: RpcHandler<
    AttachLocalRecipeFromModelRequest,
    AttachLocalRecipeResponse
  >;
  attachLocalRecipeMetadata: RpcHandler<
    AttachLocalRecipeMetadataRequest,
    AttachLocalRecipeResponse
  >;
  checkDesktopIntegration: RpcHandler<undefined, RpcResponse<'checkDesktopIntegration'>>;
  createDesktopIntegration: RpcHandler<undefined, RpcResponse<'createDesktopIntegration'>>;
  getDesktopPromptPreference: RpcHandler<undefined, RpcResponse<'getDesktopPromptPreference'>>;
  setDesktopPromptPreference: RpcHandler<
    { ask: boolean },
    RpcResponse<'setDesktopPromptPreference'>
  >;
  getAppInfo: RpcHandler<undefined, RpcResponse<'getAppInfo'>>;
  openUrl: RpcHandler<{ url: string }, { ok: boolean; error?: string }>;
  checkFrameworkUpdate: RpcHandler<undefined, RpcResponse<'checkFrameworkUpdate'>>;
  downloadFrameworkUpdate: RpcHandler<undefined, void>;
  applyFrameworkUpdate: RpcHandler<undefined, void>;
  getWindowsQdloaderDriverStatus: RpcHandler<
    undefined,
    RpcResponse<'getWindowsQdloaderDriverStatus'>
  >;
  installWindowsQdloaderDriver: RpcHandler<undefined, RpcResponse<'installWindowsQdloaderDriver'>>;
  installWindowsSpdDriver: RpcHandler<undefined, RpcResponse<'installWindowsSpdDriver'>>;
  installWindowsMtkDriver: RpcHandler<undefined, RpcResponse<'installWindowsMtkDriver'>>;
  deleteLocalFile: RpcHandler<{ filePath: string }, { ok: boolean; error?: string }>;
  pauseDownload: RpcHandler<{ downloadId: string }, { ok: boolean; error?: string }>;
  resumeDownload: RpcHandler<{ downloadId: string }, RpcResponse<'downloadFirmware'>>;
}

export type DownloadProgressDispatch = (payload: DownloadProgressMessage) => void;

export function toErrorMessage<ErrorValue>(error: ErrorValue) {
  return error instanceof Error ? error.message : String(error);
}
