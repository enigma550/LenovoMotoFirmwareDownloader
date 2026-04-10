/**
 * Response mappers for Catalog, Connected Lookup, and ReadSupport domains.
 * Maps raw RPC payloads into typed catalog/lookup response interfaces.
 */
import type {
  CatalogCountryOptions,
  CatalogFirmwareLookupResult,
  CatalogModelsResponse,
  ConnectedLookupResponse,
  CountryOptionsResponse,
  DeviceInfo,
  FirmwareVariant,
  ManualCatalogLookupResponse,
  ModelCatalogEntry,
  ReadSupportFirmwareLookupResult,
  ReadSupportHintsResponse,
  ReadSupportLookupResponse,
} from '../models/desktop-api';
import {
  asRecord,
  type MapperValue,
  mapSimpleOkResponse,
  readBoolean,
  readNumber,
  readOptionalBoolean,
  readOptionalString,
  readString,
  readStringArray,
  readStringMap,
} from './mapper-utils';

function mapModelCatalogEntry(value: MapperValue): ModelCatalogEntry | null {
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

function mapFirmwareVariant(value: MapperValue): FirmwareVariant | null {
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

function mapFirmwareVariantArray(value: MapperValue): FirmwareVariant[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => mapFirmwareVariant(item))
    .filter((item): item is FirmwareVariant => item !== null);
}

function mapDeviceInfo(value: MapperValue): DeviceInfo | undefined {
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

function mapReadSupportLookupResult(
  value: MapperValue,
): ReadSupportFirmwareLookupResult | undefined {
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

function mapCatalogLookupResult(value: MapperValue): CatalogFirmwareLookupResult | undefined {
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

function mapCountryOptions(value: MapperValue): CatalogCountryOptions | undefined {
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

function mapConnectedAttempts(value: MapperValue): ConnectedLookupResponse['attempts'] {
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

export function mapCatalogModelsResponse(payload: MapperValue): CatalogModelsResponse {
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

export function mapConnectedLookupResponse(payload: MapperValue): ConnectedLookupResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);

  return {
    ...base,
    adbAvailable: record ? readBoolean(record, 'adbAvailable', false) : false,
    device: mapDeviceInfo(record?.['device']),
    attempts: mapConnectedAttempts(record?.['attempts']),
    variants: mapFirmwareVariantArray(record?.['variants']),
  };
}

export function mapCountryOptionsResponse(payload: MapperValue): CountryOptionsResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    data: mapCountryOptions(record?.['data']),
  };
}

export function mapManualCatalogLookupResponse(payload: MapperValue): ManualCatalogLookupResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    data: mapCatalogLookupResult(record?.['data']),
  };
}

export function mapReadSupportHintsResponse(payload: MapperValue): ReadSupportHintsResponse {
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

export function mapReadSupportLookupResponse(payload: MapperValue): ReadSupportLookupResponse {
  const base = mapSimpleOkResponse(payload);
  const record = asRecord(payload);
  return {
    ...base,
    data: mapReadSupportLookupResult(record?.['data']),
  };
}
