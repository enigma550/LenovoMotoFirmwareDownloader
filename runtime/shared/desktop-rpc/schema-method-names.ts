/**
 * Runtime list of wire-level bun RPC method names, kept next to DesktopRpcSchema
 * so the contract-coverage test can enforce schema ↔ handler-registry sync.
 */
import type { DesktopRpcBunRequests } from './schema.ts';

export const BUN_RPC_METHOD_NAMES = [
  'authStart',
  'authStartInApp',
  'authComplete',
  'consumePendingAuthCallback',
  'getStoredAuthState',
  'authWithStoredToken',
  'ping',
  'getCatalogModels',
  'lookupConnectedDeviceFirmware',
  'lookupConnectedDeviceFirmwareFromDeviceInfo',
  'discoverCountryOptions',
  'lookupCatalogManual',
  'getReadSupportHints',
  'lookupReadSupportByImei',
  'lookupReadSupportBySn',
  'lookupReadSupportByParams',
  'downloadFirmware',
  'rescueLiteFirmware',
  'rescueLiteFirmwareFromLocal',
  'getPlayStoreStatus',
  'listPlayStoreDownloads',
  'searchPlayStoreApps',
  'getPlayStoreAppDetails',
  'downloadPlayStoreApp',
  'deletePlayStoreDownload',
  'installPlayStoreApp',
  'cancelDownload',
  'listLocalDownloadedFiles',
  'listBackupRestoreSnapshots',
  'deleteBackupSnapshot',
  'scanConnectedBackupPreview',
  'getConnectedBackupPreviewProgress',
  'cancelConnectedBackupProcess',
  'backupConnectedDevice',
  'restoreBackupSnapshot',
  'extractLocalFirmware',
  'readLocalFileContent',
  'attachLocalRecipeFromModel',
  'attachLocalRecipeMetadata',
  'checkDesktopIntegration',
  'createDesktopIntegration',
  'getDesktopPromptPreference',
  'setDesktopPromptPreference',
  'getAppInfo',
  'openUrl',
  'switchSoftwareFixProtocolToLmfd',
  'restoreSoftwareFixProtocolHandler',
  'checkFrameworkUpdate',
  'downloadFrameworkUpdate',
  'applyFrameworkUpdate',
  'checkProjectUpdate',
  'startProjectUpdate',
  'cancelProjectUpdate',
  'getProjectUpdateLog',
  'getWindowsQdloaderDriverStatus',
  'installWindowsQdloaderDriver',
  'installWindowsSpdDriver',
  'installWindowsMtkDriver',
  'getLinuxUdevStatus',
  'installLinuxUdevRules',
  'getStorageUsage',
  'cleanExtractedFirmwares',
  'probeFastbootDeviceHealth',
  'deleteLocalFile',
  'pauseDownload',
  'resumeDownload',
] as const;

export type BunRpcMethodName = (typeof BUN_RPC_METHOD_NAMES)[number];

type SchemaRequestMethods = keyof DesktopRpcBunRequests;

// Type-level guard: every schema request must be listed above.
type MissingFromList = Exclude<SchemaRequestMethods, BunRpcMethodName>;
const _schemaMethodsAreListed: MissingFromList extends never ? true : never = true;
void _schemaMethodsAreListed;

// Type-level guard: every listed name must exist in the schema.
type UnknownInList = Exclude<BunRpcMethodName, SchemaRequestMethods>;
const _listMethodsAreInSchema: UnknownInList extends never ? true : never = true;
void _listMethodsAreInSchema;
