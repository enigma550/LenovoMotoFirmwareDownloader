/**
 * Desktop Response Mapper — barrel + auth/download/driver/system mappers.
 *
 * Split into focused submodules:
 *   - mapper-utils.ts            — Shared reader functions, types, constants
 *   - backup-response.mapper.ts  — Backup & Restore response mappers
 *   - catalog-response.mapper.ts — Catalog, Lookup, ReadSupport response mappers
 *
 * This file keeps auth, download, driver, and system mappers,
 * and re-exports everything from the submodules for backward compatibility.
 */
import type {
  AppInfo,
  AttachLocalRecipeResponse,
  AuthCompleteResponse,
  AuthStartResponse,
  BridgePingResponse,
  CancelDownloadResponse,
  DesktopIntegrationStatus,
  DownloadFirmwareResponse,
  DownloadProgressMessage,
  ExtractLocalFirmwareResponse,
  FrameworkUpdateInfo,
  PendingAuthCallbackResponse,
  PlayStoreAppDetailsResponse,
  PlayStoreDownloadResponse,
  PlayStoreDownloadsResponse,
  PlayStoreInstallResponse,
  PlayStoreSearchResponse,
  PlayStoreStatusResponse,
  ReadLocalFileContentResponse,
  RescueLiteFirmwareResponse,
  StoredAuthStateResponse,
  WindowsMtkDriverInstallResponse,
  WindowsQdloaderDriverInstallResponse,
  WindowsQdloaderDriverStatusResponse,
  WindowsSpdDriverInstallResponse,
} from '../models/desktop-api';
import {
  asRecord,
  type MapperValue,
  mapSimpleOkResponse,
  phaseValues,
  readBoolean,
  readFirmwareTaskStatus,
  readNumber,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readRescueStorage,
  readRescueTransport,
  readString,
  windowsMtkDriverInstallMethods,
  windowsQdloaderDriverInstallMethods,
  windowsSpdDriverInstallMethods,
} from './mapper-utils';

export {
  mapBackupConnectedDeviceResponse,
  mapBackupRestoreSnapshotsResponse,
  mapConnectedBackupPreviewProgressResponse,
  mapConnectedBackupPreviewResponse,
  mapDeleteBackupSnapshotResponse,
  mapLocalDownloadedFilesResponse,
  mapRestoreBackupSnapshotResponse,
} from './backup-response.mapper';
export {
  mapCatalogModelsResponse,
  mapConnectedLookupResponse,
  mapCountryOptionsResponse,
  mapManualCatalogLookupResponse,
  mapReadSupportHintsResponse,
  mapReadSupportLookupResponse,
} from './catalog-response.mapper';
// Re-export everything from submodules for backward compatibility
export { mapSimpleOkResponse } from './mapper-utils';

// --- Driver install mappers ---

export function mapWindowsQdloaderDriverInstallResponse(
  payload: MapperValue,
): WindowsQdloaderDriverInstallResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const methodValue = record?.['method'];
  const method =
    typeof methodValue === 'string' &&
    windowsQdloaderDriverInstallMethods.has(
      methodValue as WindowsQdloaderDriverInstallResponse['method'],
    )
      ? (methodValue as WindowsQdloaderDriverInstallResponse['method'])
      : 'qdloader-setup';

  return {
    ...base,
    attempted: record ? readBoolean(record, 'attempted', false) : false,
    method,
    detail: record ? readOptionalString(record, 'detail') : undefined,
  };
}

export function mapWindowsSpdDriverInstallResponse(
  payload: MapperValue,
): WindowsSpdDriverInstallResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const methodValue = record?.['method'];
  const method =
    typeof methodValue === 'string' &&
    windowsSpdDriverInstallMethods.has(methodValue as WindowsSpdDriverInstallResponse['method'])
      ? (methodValue as WindowsSpdDriverInstallResponse['method'])
      : 'spd-setup';

  return {
    ...base,
    attempted: record ? readBoolean(record, 'attempted', false) : false,
    method,
    detail: record ? readOptionalString(record, 'detail') : undefined,
  };
}

export function mapWindowsMtkDriverInstallResponse(
  payload: MapperValue,
): WindowsMtkDriverInstallResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const methodValue = record?.['method'];
  const method =
    typeof methodValue === 'string' &&
    windowsMtkDriverInstallMethods.has(methodValue as WindowsMtkDriverInstallResponse['method'])
      ? (methodValue as WindowsMtkDriverInstallResponse['method'])
      : 'mtk-setup';

  return {
    ...base,
    attempted: record ? readBoolean(record, 'attempted', false) : false,
    method,
    detail: record ? readOptionalString(record, 'detail') : undefined,
  };
}

export function mapWindowsQdloaderDriverStatusResponse(
  payload: MapperValue,
): WindowsQdloaderDriverStatusResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    installed: record ? readBoolean(record, 'installed', false) : false,
    detail: record ? readOptionalString(record, 'detail') : undefined,
  };
}

// --- Auth mappers ---

export function mapAuthStartResponse(payload: MapperValue): AuthStartResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    loginUrl: record ? readOptionalString(record, 'loginUrl') : undefined,
    openedInExternalBrowser: record
      ? readOptionalBoolean(record, 'openedInExternalBrowser')
      : undefined,
  };
}

export function mapAuthCompleteResponse(payload: MapperValue): AuthCompleteResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    code: record ? readOptionalString(record, 'code') : undefined,
    description: record ? readOptionalString(record, 'description') : undefined,
  };
}

export function mapPendingAuthCallbackResponse(payload: MapperValue): PendingAuthCallbackResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    callbackUrlOrToken: record ? readOptionalString(record, 'callbackUrlOrToken') : undefined,
  };
}

export function mapStoredAuthStateResponse(payload: MapperValue): StoredAuthStateResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    hasStoredAuthorizationToken: record
      ? readBoolean(record, 'hasStoredAuthorizationToken', false)
      : false,
  };
}

function mapPlayStoreArtifactArray(value: MapperValue): PlayStoreDownloadResponse['artifacts'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asRecord(item))
    .filter((item): item is NonNullable<ReturnType<typeof asRecord>> => Boolean(item))
    .map((item) => ({
      fileName: readString(item, 'fileName'),
      fullPath: readString(item, 'fullPath'),
      relativePath: readOptionalString(item, 'relativePath'),
      sizeBytes: readNumber(item, 'sizeBytes', 0),
      modifiedAt: readNumber(item, 'modifiedAt', 0),
    }))
    .filter((item) => item.fileName.length > 0 && item.fullPath.length > 0);
}

export function mapPlayStoreStatusResponse(payload: MapperValue): PlayStoreStatusResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    available: record ? readBoolean(record, 'available', false) : false,
    toolPath: record ? readOptionalString(record, 'toolPath') : undefined,
    toolSource: (() => {
      const value = record ? readOptionalString(record, 'toolSource') : undefined;
      return value === 'bundled' || value === 'system' || value === 'custom' ? value : undefined;
    })(),
    downloadRoot: record ? readOptionalString(record, 'downloadRoot') : undefined,
  };
}

export function mapPlayStoreSearchResponse(payload: MapperValue): PlayStoreSearchResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const results = Array.isArray(record?.['results'])
    ? record['results']
        .map((item) => asRecord(item))
        .filter((item): item is NonNullable<ReturnType<typeof asRecord>> => Boolean(item))
        .map((item) => ({
          title: readString(item, 'title'),
          packageName: readString(item, 'packageName'),
        }))
        .filter((item) => item.packageName.length > 0)
    : [];

  return {
    ...base,
    results,
  };
}

export function mapPlayStoreAppDetailsResponse(payload: MapperValue): PlayStoreAppDetailsResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const data = asRecord(record?.['data']);

  return {
    ...base,
    data: data
      ? {
          title: readString(data, 'title'),
          packageName: readString(data, 'packageName'),
          versionName: readOptionalString(data, 'versionName'),
          versionCode: readOptionalString(data, 'versionCode'),
          developer: readOptionalString(data, 'developer'),
          rating: readOptionalString(data, 'rating'),
          downloads: readOptionalString(data, 'downloads'),
          playUrl: readOptionalString(data, 'playUrl'),
        }
      : undefined,
  };
}

export function mapPlayStoreDownloadResponse(payload: MapperValue): PlayStoreDownloadResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    packageName: record ? readString(record, 'packageName') : '',
    downloadRoot: record ? readOptionalString(record, 'downloadRoot') : undefined,
    artifacts: mapPlayStoreArtifactArray(record?.['artifacts']),
  };
}

export function mapPlayStoreDownloadsResponse(payload: MapperValue): PlayStoreDownloadsResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const downloadsValue = Array.isArray(record?.['downloads']) ? record['downloads'] : [];
  const downloads: PlayStoreDownloadsResponse['downloads'] = [];

  for (const value of downloadsValue) {
    const group = asRecord(value);
    if (!group) {
      continue;
    }

    downloads.push({
      id: readString(group, 'id'),
      packageName: readString(group, 'packageName'),
      versionCode: readOptionalString(group, 'versionCode'),
      totalSizeBytes: readNumber(group, 'totalSizeBytes', 0),
      modifiedAt: readNumber(group, 'modifiedAt', 0),
      apkArtifactCount: readNumber(group, 'apkArtifactCount', 0),
      extraArtifactCount: readNumber(group, 'extraArtifactCount', 0),
      artifacts: mapPlayStoreArtifactArray(group['artifacts']),
    });
  }

  return {
    ...base,
    downloadRoot: record ? readOptionalString(record, 'downloadRoot') : undefined,
    downloads,
  };
}

export function mapPlayStoreInstallResponse(payload: MapperValue): PlayStoreInstallResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    packageName: record ? readString(record, 'packageName') : '',
    installedArtifactCount: record ? readNumber(record, 'installedArtifactCount', 0) : 0,
    installMode: (() => {
      const value = record ? readOptionalString(record, 'installMode') : undefined;
      return value === 'standard' || value === 'microg' ? value : undefined;
    })(),
    detail: record ? readOptionalString(record, 'detail') : undefined,
  };
}

export function mapBridgePingResponse(payload: MapperValue): BridgePingResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    serverTime: record ? readOptionalNumber(record, 'serverTime') : undefined,
  };
}

// --- Download / Rescue mappers ---

export function mapDownloadFirmwareResponse(payload: MapperValue): DownloadFirmwareResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    downloadId: record ? readString(record, 'downloadId') : '',
    status: readFirmwareTaskStatus(record?.['status']),
    savePath: record ? readOptionalString(record, 'savePath') : undefined,
    fileName: record ? readOptionalString(record, 'fileName') : undefined,
    bytesDownloaded: record ? readOptionalNumber(record, 'bytesDownloaded') : undefined,
    totalBytes: record ? readOptionalNumber(record, 'totalBytes') : undefined,
  };
}

export function mapRescueLiteFirmwareResponse(payload: MapperValue): RescueLiteFirmwareResponse {
  const base = mapDownloadFirmwareResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    workDir: record ? readOptionalString(record, 'workDir') : undefined,
    dryRun: record ? readOptionalBoolean(record, 'dryRun') : undefined,
    reusedPackage: record ? readOptionalBoolean(record, 'reusedPackage') : undefined,
    reusedExtraction: record ? readOptionalBoolean(record, 'reusedExtraction') : undefined,
    flashTransport: readRescueTransport(record?.['flashTransport']),
    qdlStorage: readRescueStorage(record?.['qdlStorage']),
    qdlSerial: record ? readOptionalString(record, 'qdlSerial') : undefined,
    commandSource: record ? readOptionalString(record, 'commandSource') : undefined,
    commandPlan: Array.isArray(record?.['commandPlan'])
      ? record['commandPlan'].filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

// --- Local file / extract mappers ---

export function mapExtractLocalFirmwareResponse(
  payload: MapperValue,
): ExtractLocalFirmwareResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    filePath: record ? readString(record, 'filePath') : '',
    fileName: record ? readString(record, 'fileName') : '',
    extractedDir: record ? readOptionalString(record, 'extractedDir') : undefined,
    reusedExtraction: record ? readOptionalBoolean(record, 'reusedExtraction') : undefined,
  };
}

export function mapReadLocalFileContentResponse(
  payload: MapperValue,
): ReadLocalFileContentResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    filePath: record ? readString(record, 'filePath') : '',
    encoding:
      record?.['encoding'] === 'text' || record?.['encoding'] === 'base64'
        ? record['encoding']
        : 'base64',
    content: record ? readOptionalString(record, 'content') : undefined,
  };
}

export function mapAttachLocalRecipeResponse(payload: MapperValue): AttachLocalRecipeResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    filePath: record ? readString(record, 'filePath') : '',
    recipeUrl: record ? readOptionalString(record, 'recipeUrl') : undefined,
    code: record ? readOptionalString(record, 'code') : undefined,
    description: record ? readOptionalString(record, 'description') : undefined,
  };
}

export function mapCancelDownloadResponse(payload: MapperValue): CancelDownloadResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const statusValue = record?.['status'];

  return {
    ...base,
    downloadId: record ? readString(record, 'downloadId') : '',
    status: statusValue === 'canceling' ? 'canceling' : 'not_found',
  };
}

// --- System / misc mappers ---

export function mapDesktopIntegrationStatus(payload: MapperValue): DesktopIntegrationStatus {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const statusValue = record?.['status'];

  return {
    ...base,
    status:
      statusValue === 'ok' ||
      statusValue === 'missing' ||
      statusValue === 'wrong_wmclass' ||
      statusValue === 'not_linux'
        ? statusValue
        : 'missing',
  };
}

export function mapBooleanResponse(payload: MapperValue, fallback = false) {
  return typeof payload === 'boolean' ? payload : fallback;
}

export function mapPromptPreferenceResponse(payload: MapperValue, fallback = false) {
  if (typeof payload === 'boolean') {
    return payload;
  }

  const record = asRecord(payload);
  return record ? readBoolean(record, 'ask', fallback) : fallback;
}

export function mapAppInfo(payload: MapperValue): AppInfo {
  const record = asRecord(payload);

  return {
    version: record ? readString(record, 'version') : '',
    platform: record ? readString(record, 'platform') : 'unknown',
    channel: record ? readString(record, 'channel') : 'unknown',
  };
}

export function mapFrameworkUpdateInfo(payload: MapperValue): FrameworkUpdateInfo {
  const record = asRecord(payload);

  return {
    version: record ? readString(record, 'version') : '',
    hash: record ? readString(record, 'hash') : '',
    updateAvailable: record ? readBoolean(record, 'updateAvailable', false) : false,
    updateReady: record ? readBoolean(record, 'updateReady', false) : false,
    error: record ? readString(record, 'error') : 'Invalid response payload.',
  };
}

export function mapDownloadProgressMessage(payload: MapperValue): DownloadProgressMessage | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const status = readFirmwareTaskStatus(record['status']);
  if (!status) {
    return null;
  }

  const phaseValue = record['phase'];
  const phase =
    typeof phaseValue === 'string' &&
    phaseValues.has(phaseValue as NonNullable<DownloadProgressMessage['phase']>)
      ? (phaseValue as NonNullable<DownloadProgressMessage['phase']>)
      : undefined;

  return {
    downloadId: readString(record, 'downloadId'),
    romUrl: readString(record, 'romUrl'),
    romName: readString(record, 'romName'),
    status,
    dryRun: readOptionalBoolean(record, 'dryRun'),
    flashTransport: readRescueTransport(record['flashTransport']),
    qdlStorage: readRescueStorage(record['qdlStorage']),
    qdlSerial: readOptionalString(record, 'qdlSerial'),
    savePath: readOptionalString(record, 'savePath'),
    downloadedBytes: readNumber(record, 'downloadedBytes', 0),
    totalBytes: readOptionalNumber(record, 'totalBytes'),
    speedBytesPerSecond: readOptionalNumber(record, 'speedBytesPerSecond'),
    phase,
    stepIndex: readOptionalNumber(record, 'stepIndex'),
    stepTotal: readOptionalNumber(record, 'stepTotal'),
    stepLabel: readOptionalString(record, 'stepLabel'),
    commandSource: readOptionalString(record, 'commandSource'),
    consoleLine: readOptionalString(record, 'consoleLine'),
    consoleTone: readOptionalString(
      record,
      'consoleTone',
    ) as DownloadProgressMessage['consoleTone'],
    error: readOptionalString(record, 'error'),
  };
}
