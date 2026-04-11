import type { DesktopApi } from './requests';

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
    consumePendingAuthCallback: () =>
      invokeRpc('consumePendingAuthCallback') as ReturnType<
        DesktopApi['consumePendingAuthCallback']
      >,
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
    lookupConnectedDeviceFirmwareFromDeviceInfo: (payload) =>
      invokeRpc('lookupConnectedDeviceFirmwareFromDeviceInfo', payload) as ReturnType<
        DesktopApi['lookupConnectedDeviceFirmwareFromDeviceInfo']
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
    getPlayStoreStatus: () =>
      invokeRpc('getPlayStoreStatus') as ReturnType<DesktopApi['getPlayStoreStatus']>,
    listPlayStoreDownloads: () =>
      invokeRpc('listPlayStoreDownloads') as ReturnType<DesktopApi['listPlayStoreDownloads']>,
    searchPlayStoreApps: (payload) =>
      invokeRpc('searchPlayStoreApps', payload) as ReturnType<DesktopApi['searchPlayStoreApps']>,
    getPlayStoreAppDetails: (payload) =>
      invokeRpc('getPlayStoreAppDetails', payload) as ReturnType<
        DesktopApi['getPlayStoreAppDetails']
      >,
    downloadPlayStoreApp: (payload) =>
      invokeRpc('downloadPlayStoreApp', payload) as ReturnType<DesktopApi['downloadPlayStoreApp']>,
    installPlayStoreApp: (payload) =>
      invokeRpc('installPlayStoreApp', payload) as ReturnType<DesktopApi['installPlayStoreApp']>,
    extractLocalFirmware: (payload) =>
      invokeRpc('extractLocalFirmware', payload) as ReturnType<DesktopApi['extractLocalFirmware']>,
    readLocalFileContent: (payload) =>
      invokeRpc('readLocalFileContent', payload) as ReturnType<DesktopApi['readLocalFileContent']>,
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
    listBackupRestoreSnapshots: () =>
      invokeRpc('listBackupRestoreSnapshots') as ReturnType<
        DesktopApi['listBackupRestoreSnapshots']
      >,
    deleteBackupSnapshot: (payload) =>
      invokeRpc('deleteBackupSnapshot', payload) as ReturnType<DesktopApi['deleteBackupSnapshot']>,
    scanConnectedBackupPreview: () =>
      invokeRpc('scanConnectedBackupPreview') as ReturnType<
        DesktopApi['scanConnectedBackupPreview']
      >,
    getConnectedBackupPreviewProgress: () =>
      invokeRpc('getConnectedBackupPreviewProgress') as ReturnType<
        DesktopApi['getConnectedBackupPreviewProgress']
      >,
    cancelConnectedBackupProcess: () =>
      invokeRpc('cancelConnectedBackupProcess') as ReturnType<
        DesktopApi['cancelConnectedBackupProcess']
      >,
    backupConnectedDevice: (payload) =>
      invokeRpc('backupConnectedDevice', payload || {}) as ReturnType<
        DesktopApi['backupConnectedDevice']
      >,
    restoreBackupSnapshot: (payload) =>
      invokeRpc('restoreBackupSnapshot', payload) as ReturnType<
        DesktopApi['restoreBackupSnapshot']
      >,
    openUrl: (url) => invokeRpc('openUrl', { url }) as ReturnType<DesktopApi['openUrl']>,
    switchSoftwareFixProtocolToLmfd: () =>
      invokeRpc('switchSoftwareFixProtocolToLmfd') as ReturnType<
        DesktopApi['switchSoftwareFixProtocolToLmfd']
      >,
    restoreSoftwareFixProtocolHandler: () =>
      invokeRpc('restoreSoftwareFixProtocolHandler') as ReturnType<
        DesktopApi['restoreSoftwareFixProtocolHandler']
      >,
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
