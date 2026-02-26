import { requestApi } from '../../infra/lmsa/api.ts';
import type {
  FirmwareVariant,
  ModelCatalogEntry,
  ReadSupportFirmwareLookupResult,
} from '../../shared/types/index.ts';
import { createFirmwareVariantFromResourceItem } from './resource-variant.ts';

interface RomMatchParamsApiResponse {
  code?: string;
  desc?: string;
  content?: {
    modelName?: string;
    platform?: string;
    params?: string[];
  };
}

interface GetNewResourceApiResponseItem {
  romMatchId?: string;
  flashFlow?: string;
  romResource?: {
    name?: string;
    uri?: string;
    publishDate?: string;
  };
}

interface GetNewResourceApiResponse {
  code?: string;
  desc?: string;
  content?: GetNewResourceApiResponseItem[];
}

function generateEncryptCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function toRomMatchParamsApiResponse(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  return value as RomMatchParamsApiResponse;
}

function toGetNewResourceApiResponse(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  return value as GetNewResourceApiResponse;
}

function mapFirmwareVariants(
  content: GetNewResourceApiResponseItem[] | undefined,
  selectedParameters: Record<string, string>,
) {
  const variants: FirmwareVariant[] = [];
  if (!Array.isArray(content)) {
    return variants;
  }

  for (const item of content) {
    const variant = createFirmwareVariantFromResourceItem(item, selectedParameters);
    if (variant) {
      variants.push(variant);
    }
  }

  return variants;
}

export async function getReadSupportRequiredParameters(modelName: string) {
  const response = await requestApi('/rescueDevice/getRomMatchParams.jhtml', {
    modelName,
  });
  const payload = toRomMatchParamsApiResponse(await response.json());

  const code = typeof payload?.code === 'string' ? payload.code : '';
  const description = typeof payload?.desc === 'string' ? payload.desc : '';
  const platform = typeof payload?.content?.platform === 'string' ? payload.content.platform : '';
  const requiredParameters = Array.isArray(payload?.content?.params)
    ? payload.content.params.filter((parameter) => typeof parameter === 'string')
    : [];

  return {
    code,
    description,
    platform,
    requiredParameters,
  };
}

export async function fetchReadSupportFirmwareForModel(
  selectedModel: ModelCatalogEntry,
  params: Record<string, string>,
  optionalIdentifiers: {
    imei?: string;
    imei2?: string;
    sn?: string;
    channelId?: string;
  } = {},
) {
  const dparams: Record<string, unknown> = {
    modelName: selectedModel.modelName,
    marketName: selectedModel.marketName,
    category: selectedModel.category,
    params,
    matchType: 1,
  };

  if (optionalIdentifiers.imei) {
    dparams.imei = optionalIdentifiers.imei;
  }
  if (optionalIdentifiers.imei2) {
    dparams.imei2 = optionalIdentifiers.imei2;
  }
  if (optionalIdentifiers.sn) {
    dparams.sn = optionalIdentifiers.sn;
  }
  if (optionalIdentifiers.channelId) {
    dparams.channelId = optionalIdentifiers.channelId;
  }

  const response = await requestApi('/rescueDevice/getNewResource.jhtml', dparams);
  const payload = toGetNewResourceApiResponse(await response.json());
  const code = typeof payload?.code === 'string' ? payload.code : '';
  const description = typeof payload?.desc === 'string' ? payload.desc : '';

  const variants = mapFirmwareVariants(payload?.content, params);

  return {
    code,
    description,
    variants,
  } as ReadSupportFirmwareLookupResult;
}

export async function fetchFirmwareByImeiForModel(
  selectedModel: ModelCatalogEntry,
  identifiers: {
    imei: string;
    imei2?: string;
    sn?: string;
    roCarrier?: string;
    channelId?: string;
  },
) {
  const dparams: Record<string, string> = {
    imei: identifiers.imei,
    modelCode: selectedModel.modelName,
    roCarrier: identifiers.roCarrier || 'reteu',
    encryptCode: generateEncryptCode(),
    sku: selectedModel.modelName,
    carrierSku: selectedModel.modelName,
  };

  if (identifiers.imei2) {
    dparams.imei2 = identifiers.imei2;
  }
  if (identifiers.sn) {
    dparams.sn = identifiers.sn;
  }
  if (identifiers.channelId) {
    dparams.channelId = identifiers.channelId;
  }

  const response = await requestApi('/rescueDevice/getNewResourceByImei.jhtml', dparams);
  const payload = toGetNewResourceApiResponse(await response.json());
  const code = typeof payload?.code === 'string' ? payload.code : '';
  const description = typeof payload?.desc === 'string' ? payload.desc : '';

  const variants = mapFirmwareVariants(payload?.content, {
    imei: identifiers.imei,
    modelCode: selectedModel.modelName,
    roCarrier: identifiers.roCarrier || 'reteu',
  });

  return {
    code,
    description,
    variants,
  } as ReadSupportFirmwareLookupResult;
}

export async function fetchFirmwareBySnForModel(
  selectedModel: ModelCatalogEntry,
  identifiers: {
    sn: string;
    channelId?: string;
  },
) {
  const dparams: Record<string, string> = {
    sn: identifiers.sn,
  };

  if (identifiers.channelId) {
    dparams.channelId = identifiers.channelId;
  }

  const response = await requestApi('/rescueDevice/getNewResourceBySN.jhtml', dparams);
  const payload = toGetNewResourceApiResponse(await response.json());
  const code = typeof payload?.code === 'string' ? payload.code : '';
  const description = typeof payload?.desc === 'string' ? payload.desc : '';

  const variants = mapFirmwareVariants(payload?.content, {
    sn: identifiers.sn,
    modelCode: selectedModel.modelName,
  });

  return {
    code,
    description,
    variants,
  } as ReadSupportFirmwareLookupResult;
}
