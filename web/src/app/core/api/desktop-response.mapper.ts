import type {
  AppInfo,
  AttachLocalRecipeResponse,
  AuthCompleteResponse,
  AuthStartResponse,
  BridgePingResponse,
  CancelDownloadResponse,
  CatalogCountryOptions,
  CatalogFirmwareLookupResult,
  CatalogModelsResponse,
  ConnectedLookupResponse,
  CountryOptionsResponse,
  DesktopIntegrationStatus,
  DeviceInfo,
  DownloadFirmwareResponse,
  DownloadProgressMessage,
  ExtractLocalFirmwareResponse,
  FirmwareTaskStatus,
  FirmwareVariant,
  FrameworkUpdateInfo,
  LocalDownloadedFile,
  LocalDownloadedFilesResponse,
  ManualCatalogLookupResponse,
  ModelCatalogEntry,
  ReadSupportFirmwareLookupResult,
  ReadSupportHintsResponse,
  ReadSupportLookupResponse,
  RescueFlashTransport,
  RescueLiteFirmwareResponse,
  RescueQdlStorage,
  StoredAuthStateResponse,
  WindowsEdlDriverInstallResponse,
} from '../models/desktop-api';

type UnknownRecord = Record<string, unknown>;

type SimpleOkResponse = {
  ok: boolean;
  error?: string;
};

const firmwareTaskStatusValues = new Set<FirmwareTaskStatus>([
  'starting',
  'downloading',
  'paused',
  'preparing',
  'flashing',
  'completed',
  'failed',
  'canceled',
]);

const rescueTransportValues = new Set<RescueFlashTransport>(['fastboot', 'qdl', 'unisoc']);
const rescueStorageValues = new Set<RescueQdlStorage>(['auto', 'emmc', 'ufs']);
const phaseValues = new Set<NonNullable<DownloadProgressMessage['phase']>>([
  'download',
  'prepare',
  'flash',
]);
const windowsEdlDriverInstallMethods = new Set<WindowsEdlDriverInstallResponse['method']>([
  'qdloader-setup',
  'wdi-simple',
]);

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;
}

function readString(record: UnknownRecord, key: string, fallback = '') {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}

function readOptionalString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readBoolean(record: UnknownRecord, key: string, fallback = false) {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

function readOptionalBoolean(record: UnknownRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readNumber(record: UnknownRecord, key: string, fallback = 0) {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(record: UnknownRecord, key: string) {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function readStringMap(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, mapValue] of Object.entries(record)) {
    if (typeof mapValue === 'string') {
      result[key] = mapValue;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function readFirmwareTaskStatus(value: unknown): FirmwareTaskStatus | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return firmwareTaskStatusValues.has(value as FirmwareTaskStatus)
    ? (value as FirmwareTaskStatus)
    : undefined;
}

function readRescueTransport(value: unknown): RescueFlashTransport | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return rescueTransportValues.has(value as RescueFlashTransport)
    ? (value as RescueFlashTransport)
    : undefined;
}

function readRescueStorage(value: unknown): RescueQdlStorage | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return rescueStorageValues.has(value as RescueQdlStorage)
    ? (value as RescueQdlStorage)
    : undefined;
}

function mapModelCatalogEntry(value: unknown): ModelCatalogEntry | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    category: readString(record, 'category'),
    brand: readString(record, 'brand'),
    modelName: readString(record, 'modelName'),
    marketName: readString(record, 'marketName'),
    platform: readString(record, 'platform'),
    readSupport: readBoolean(record, 'readSupport', false),
    readFlow: readString(record, 'readFlow'),
  };
}

function mapFirmwareVariant(value: unknown): FirmwareVariant | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    romName: readString(record, 'romName'),
    romUrl: readString(record, 'romUrl'),
    romMatchIdentifier: readString(record, 'romMatchIdentifier'),
    publishDate: readOptionalString(record, 'publishDate'),
    recipeUrl: readOptionalString(record, 'recipeUrl'),
    selectedParameters: readStringMap(record['selectedParameters']),
  };
}

function mapFirmwareVariantArray(value: unknown): FirmwareVariant[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => mapFirmwareVariant(item))
    .filter((item): item is FirmwareVariant => item !== null);
}

function mapDeviceInfo(value: unknown): DeviceInfo | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    imei: readString(record, 'imei'),
    modelName: readString(record, 'modelName'),
    modelCode: readString(record, 'modelCode'),
    sn: readString(record, 'sn'),
    roCarrier: readString(record, 'roCarrier'),
  };
}

function mapReadSupportLookupResult(value: unknown): ReadSupportFirmwareLookupResult | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    code: readString(record, 'code'),
    description: readString(record, 'description'),
    variants: mapFirmwareVariantArray(record['variants']),
  };
}

function mapCatalogLookupResult(value: unknown): CatalogFirmwareLookupResult | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    variants: mapFirmwareVariantArray(record['variants']),
    statesExplored: readNumber(record, 'statesExplored', 0),
    manualMatchResponseCode: readString(record, 'manualMatchResponseCode'),
    manualMatchResponseDescription: readString(record, 'manualMatchResponseDescription'),
    autoMatchPlatform: readString(record, 'autoMatchPlatform'),
    autoMatchRequiredParameters: readStringArray(record, 'autoMatchRequiredParameters'),
  };
}

function mapCountryOptions(value: unknown): CatalogCountryOptions | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    foundCountrySelector: readBoolean(record, 'foundCountrySelector', false),
    countryParameterKey: readString(record, 'countryParameterKey'),
    countryValues: readStringArray(record, 'countryValues'),
    baseParametersBeforeCountry: readStringMap(record['baseParametersBeforeCountry']) || {},
    discoveryResponseCode: readString(record, 'discoveryResponseCode'),
    discoveryResponseDescription: readString(record, 'discoveryResponseDescription'),
  };
}

function mapConnectedAttempts(value: unknown): ConnectedLookupResponse['attempts'] {
  if (!Array.isArray(value)) {
    return [];
  }

  const attempts: ConnectedLookupResponse['attempts'] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const modeValue = record['mode'];
    const mode: ConnectedLookupResponse['attempts'][number]['mode'] =
      modeValue === 'SN' ? 'SN' : 'IMEI';

    const attempt: ConnectedLookupResponse['attempts'][number] = {
      mode,
      code: readString(record, 'code'),
      description: readString(record, 'description'),
    };
    const romUrl = readOptionalString(record, 'romUrl');
    if (romUrl) {
      attempt.romUrl = romUrl;
    }

    attempts.push(attempt);
  }

  return attempts;
}

export function mapSimpleOkResponse(payload: unknown): SimpleOkResponse {
  const record = asRecord(payload);
  if (!record) {
    return { ok: false, error: 'Invalid response payload.' };
  }

  return {
    ok: readBoolean(record, 'ok', false),
    error: readOptionalString(record, 'error'),
  };
}

export function mapWindowsEdlDriverInstallResponse(
  payload: unknown,
): WindowsEdlDriverInstallResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const methodValue = record?.['method'];
  const method =
    typeof methodValue === 'string' &&
    windowsEdlDriverInstallMethods.has(methodValue as WindowsEdlDriverInstallResponse['method'])
      ? (methodValue as WindowsEdlDriverInstallResponse['method'])
      : 'wdi-simple';

  return {
    ...base,
    attempted: record ? readBoolean(record, 'attempted', false) : false,
    method,
    detail: record ? readOptionalString(record, 'detail') : undefined,
  };
}

export function mapAuthStartResponse(payload: unknown): AuthStartResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    loginUrl: record ? readOptionalString(record, 'loginUrl') : undefined,
  };
}

export function mapAuthCompleteResponse(payload: unknown): AuthCompleteResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    code: record ? readOptionalString(record, 'code') : undefined,
    description: record ? readOptionalString(record, 'description') : undefined,
  };
}

export function mapStoredAuthStateResponse(payload: unknown): StoredAuthStateResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    hasStoredWustToken: record ? readBoolean(record, 'hasStoredWustToken', false) : false,
  };
}

export function mapBridgePingResponse(payload: unknown): BridgePingResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    serverTime: record ? readOptionalNumber(record, 'serverTime') : undefined,
  };
}

export function mapCatalogModelsResponse(payload: unknown): CatalogModelsResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const models = Array.isArray(record?.['models'])
    ? record['models']
        .map((item) => mapModelCatalogEntry(item))
        .filter((item): item is ModelCatalogEntry => item !== null)
    : [];

  return {
    ...base,
    models,
    usedLmsaRefresh: record ? readOptionalBoolean(record, 'usedLmsaRefresh') : undefined,
  };
}

export function mapConnectedLookupResponse(payload: unknown): ConnectedLookupResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    adbAvailable: record ? readBoolean(record, 'adbAvailable', false) : false,
    fastbootAvailable: record ? readBoolean(record, 'fastbootAvailable', false) : false,
    device: mapDeviceInfo(record?.['device']),
    attempts: mapConnectedAttempts(record?.['attempts']),
    variants: mapFirmwareVariantArray(record?.['variants']),
  };
}

export function mapCountryOptionsResponse(payload: unknown): CountryOptionsResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    data: mapCountryOptions(record?.['data']),
  };
}

export function mapManualCatalogLookupResponse(payload: unknown): ManualCatalogLookupResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    data: mapCatalogLookupResult(record?.['data']),
  };
}

export function mapReadSupportHintsResponse(payload: unknown): ReadSupportHintsResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const data = asRecord(record?.['data']);

  return {
    ...base,
    data: data
      ? {
          code: readString(data, 'code'),
          description: readString(data, 'description'),
          platform: readString(data, 'platform'),
          requiredParameters: readStringArray(data, 'requiredParameters'),
        }
      : undefined,
  };
}

export function mapReadSupportLookupResponse(payload: unknown): ReadSupportLookupResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    data: mapReadSupportLookupResult(record?.['data']),
  };
}

export function mapDownloadFirmwareResponse(payload: unknown): DownloadFirmwareResponse {
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

export function mapRescueLiteFirmwareResponse(payload: unknown): RescueLiteFirmwareResponse {
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

function mapLocalDownloadedFile(value: unknown): LocalDownloadedFile | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    fileName: readString(record, 'fileName'),
    fullPath: readString(record, 'fullPath'),
    relativePath: readOptionalString(record, 'relativePath'),
    sizeBytes: readNumber(record, 'sizeBytes', 0),
    modifiedAt: readNumber(record, 'modifiedAt', 0),
    publishDate: readOptionalString(record, 'publishDate'),
    extractedDir: readString(record, 'extractedDir'),
    relativeExtractedDir: readOptionalString(record, 'relativeExtractedDir'),
    hasExtractedDir: readBoolean(record, 'hasExtractedDir', false),
    recipeUrl: readOptionalString(record, 'recipeUrl'),
    romMatchIdentifier: readOptionalString(record, 'romMatchIdentifier'),
    selectedParameters: readStringMap(record['selectedParameters']),
    metadataSource: readOptionalString(record, 'metadataSource'),
    hasRecipeMetadata: readOptionalBoolean(record, 'hasRecipeMetadata'),
  };
}

export function mapLocalDownloadedFilesResponse(payload: unknown): LocalDownloadedFilesResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    files: Array.isArray(record?.['files'])
      ? record['files']
          .map((item) => mapLocalDownloadedFile(item))
          .filter((item): item is LocalDownloadedFile => item !== null)
      : [],
  };
}

export function mapExtractLocalFirmwareResponse(payload: unknown): ExtractLocalFirmwareResponse {
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

export function mapAttachLocalRecipeResponse(payload: unknown): AttachLocalRecipeResponse {
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

export function mapCancelDownloadResponse(payload: unknown): CancelDownloadResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  const statusValue = record?.['status'];

  return {
    ...base,
    downloadId: record ? readString(record, 'downloadId') : '',
    status: statusValue === 'canceling' ? 'canceling' : 'not_found',
  };
}

export function mapDesktopIntegrationStatus(payload: unknown): DesktopIntegrationStatus {
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

export function mapBooleanResponse(payload: unknown, fallback = false) {
  return typeof payload === 'boolean' ? payload : fallback;
}

export function mapAppInfo(payload: unknown): AppInfo {
  const record = asRecord(payload);

  return {
    version: record ? readString(record, 'version') : '',
    platform: record ? readString(record, 'platform') : 'unknown',
    channel: record ? readString(record, 'channel') : 'unknown',
  };
}

export function mapFrameworkUpdateInfo(payload: unknown): FrameworkUpdateInfo {
  const record = asRecord(payload);

  return {
    version: record ? readString(record, 'version') : '',
    hash: record ? readString(record, 'hash') : '',
    updateAvailable: record ? readBoolean(record, 'updateAvailable', false) : false,
    updateReady: record ? readBoolean(record, 'updateReady', false) : false,
    error: record ? readString(record, 'error') : 'Invalid response payload.',
  };
}

export function mapDownloadProgressMessage(payload: unknown): DownloadProgressMessage | null {
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
    error: readOptionalString(record, 'error'),
  };
}
