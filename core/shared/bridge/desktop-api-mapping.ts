import type { DesktopApi } from '../types/desktop-api.ts';

type DesktopRpcPayload = object | string | number | boolean | null;

export type DesktopRpcInvoker = (
  method: string,
  params?: DesktopRpcPayload,
) => Promise<DesktopRpcPayload>;

export function createDesktopApiFromInvoker(invokeRpc: DesktopRpcInvoker): DesktopApi {
  return {
    isDesktop: true,
    startAuth: () => invokeRpc('authStart') as ReturnType<DesktopApi['startAuth']>,
    completeAuth: (callbackUrlOrToken) =>
      invokeRpc('authComplete', { callbackUrlOrToken }) as ReturnType<DesktopApi['completeAuth']>,
    getStoredAuthState: () =>
      invokeRpc('getStoredAuthState') as ReturnType<DesktopApi['getStoredAuthState']>,
    authWithStoredToken: () =>
      invokeRpc('authWithStoredToken') as ReturnType<DesktopApi['authWithStoredToken']>,
    ping: () => invokeRpc('ping') as ReturnType<DesktopApi['ping']>,
    getCatalogModels: (refresh = false) =>
      invokeRpc('getCatalogModels', { refresh }) as ReturnType<DesktopApi['getCatalogModels']>,
    lookupConnectedDeviceFirmware: () =>
      invokeRpc('lookupConnectedDeviceFirmware') as ReturnType<
        DesktopApi['lookupConnectedDeviceFirmware']
      >,
    discoverCountryOptions: (model) =>
      invokeRpc('discoverCountryOptions', { model }) as ReturnType<
        DesktopApi['discoverCountryOptions']
      >,
    lookupCatalogManual: (model, countryValue, allCountries) =>
      invokeRpc('lookupCatalogManual', {
        model,
        countryValue,
        allCountries,
      }) as ReturnType<DesktopApi['lookupCatalogManual']>,
    getReadSupportHints: (modelName) =>
      invokeRpc('getReadSupportHints', { modelName }) as ReturnType<
        DesktopApi['getReadSupportHints']
      >,
    lookupReadSupportByImei: (payload) =>
      invokeRpc('lookupReadSupportByImei', payload) as ReturnType<
        DesktopApi['lookupReadSupportByImei']
      >,
    lookupReadSupportBySn: (payload) =>
      invokeRpc('lookupReadSupportBySn', payload) as ReturnType<
        DesktopApi['lookupReadSupportBySn']
      >,
    lookupReadSupportByParams: (payload) =>
      invokeRpc('lookupReadSupportByParams', payload) as ReturnType<
        DesktopApi['lookupReadSupportByParams']
      >,
    downloadFirmware: (payload) =>
      invokeRpc('downloadFirmware', payload) as ReturnType<DesktopApi['downloadFirmware']>,
    rescueLiteFirmware: (payload) =>
      invokeRpc('rescueLiteFirmware', payload) as ReturnType<DesktopApi['rescueLiteFirmware']>,
    rescueLiteFirmwareFromLocal: (payload) =>
      invokeRpc('rescueLiteFirmwareFromLocal', payload) as ReturnType<
        DesktopApi['rescueLiteFirmwareFromLocal']
      >,
    extractLocalFirmware: (payload) =>
      invokeRpc('extractLocalFirmware', payload) as ReturnType<DesktopApi['extractLocalFirmware']>,
    attachLocalRecipeFromModel: (payload) =>
      invokeRpc('attachLocalRecipeFromModel', payload) as ReturnType<
        DesktopApi['attachLocalRecipeFromModel']
      >,
    attachLocalRecipeMetadata: (payload) =>
      invokeRpc('attachLocalRecipeMetadata', payload) as ReturnType<
        DesktopApi['attachLocalRecipeMetadata']
      >,
    cancelDownload: (payload) =>
      invokeRpc('cancelDownload', payload) as ReturnType<DesktopApi['cancelDownload']>,
    checkDesktopIntegration: () =>
      invokeRpc('checkDesktopIntegration') as ReturnType<DesktopApi['checkDesktopIntegration']>,
    createDesktopIntegration: () =>
      invokeRpc('createDesktopIntegration') as ReturnType<DesktopApi['createDesktopIntegration']>,
    getDesktopPromptPreference: () =>
      invokeRpc('getDesktopPromptPreference') as ReturnType<
        DesktopApi['getDesktopPromptPreference']
      >,
    setDesktopPromptPreference: (payload) =>
      invokeRpc('setDesktopPromptPreference', payload) as ReturnType<
        DesktopApi['setDesktopPromptPreference']
      >,
    getAppInfo: () => invokeRpc('getAppInfo') as ReturnType<DesktopApi['getAppInfo']>,
    listLocalDownloadedFiles: () =>
      invokeRpc('listLocalDownloadedFiles') as ReturnType<DesktopApi['listLocalDownloadedFiles']>,
    openUrl: (url) => invokeRpc('openUrl', { url }) as ReturnType<DesktopApi['openUrl']>,
    checkFrameworkUpdate: () =>
      invokeRpc('checkFrameworkUpdate') as ReturnType<DesktopApi['checkFrameworkUpdate']>,
    downloadFrameworkUpdate: () => invokeRpc('downloadFrameworkUpdate').then(() => undefined),
    applyFrameworkUpdate: () => invokeRpc('applyFrameworkUpdate').then(() => undefined),
    getWindowsQdloaderDriverStatus: () =>
      invokeRpc('getWindowsQdloaderDriverStatus') as ReturnType<
        DesktopApi['getWindowsQdloaderDriverStatus']
      >,
    installWindowsQdloaderDriver: () =>
      invokeRpc('installWindowsQdloaderDriver') as ReturnType<
        DesktopApi['installWindowsQdloaderDriver']
      >,
    installWindowsSpdDriver: () =>
      invokeRpc('installWindowsSpdDriver') as ReturnType<DesktopApi['installWindowsSpdDriver']>,
    installWindowsMtkDriver: () =>
      invokeRpc('installWindowsMtkDriver') as ReturnType<DesktopApi['installWindowsMtkDriver']>,
    deleteLocalFile: (payload) =>
      invokeRpc('deleteLocalFile', payload) as ReturnType<DesktopApi['deleteLocalFile']>,
    pauseDownload: (payload) =>
      invokeRpc('pauseDownload', payload) as ReturnType<DesktopApi['pauseDownload']>,
    resumeDownload: (payload) =>
      invokeRpc('resumeDownload', payload) as ReturnType<DesktopApi['resumeDownload']>,
  };
}
