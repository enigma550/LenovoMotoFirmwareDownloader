import { requestApi } from '../../infra/lmsa/api.ts';
import type {
  CatalogCountryOptions,
  CatalogFirmwareLookupResult,
  FirmwareVariant,
  ModelCatalogEntry,
} from '../../shared/types/index.ts';
import { createFirmwareVariantFromResourceItem } from './resource-variant.ts';

interface ManualMatchParameterProperty {
  property: string;
}

interface ManualMatchResourceModel {
  name?: string;
  uri?: string;
  publishDate?: string;
}

interface ManualMatchContentItem {
  paramProperty?: ManualMatchParameterProperty;
  paramValues?: string[];
  romResource?: ManualMatchResourceModel;
  romMatchId?: string;
  flashFlow?: string;
}

interface ManualMatchResponse {
  code?: string;
  desc?: string;
  content?: ManualMatchContentItem[];
}

interface RomMatchParamsResponse {
  code?: string;
  desc?: string;
  content?: {
    platform?: string;
    params?: string[];
  };
}

const maximumExplorationDepth = 15;
const countryParameterKeys = new Set(['country', 'countryCode']);

function toManualMatchResponse(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  return value as ManualMatchResponse;
}

function toRomMatchParamsResponse(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  return value as RomMatchParamsResponse;
}

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

function serializeParameterState(parameters: Record<string, string>) {
  const sortedEntries = Object.entries(parameters).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );
  return JSON.stringify(sortedEntries);
}

function pushUniqueVariant(
  variants: FirmwareVariant[],
  seenRomUrls: Set<string>,
  variant: FirmwareVariant,
) {
  const variantKey = `${variant.romUrl}-${JSON.stringify(variant.selectedParameters)}`;
  if (seenRomUrls.has(variantKey)) return;
  seenRomUrls.add(variantKey);
  variants.push(variant);
}

function buildInitialParameters(
  selectedModel: ModelCatalogEntry,
  initialParametersOverride?: Record<string, string>,
) {
  const initialParameters = initialParametersOverride ? { ...initialParametersOverride } : {};

  if (!initialParameters.modelName) {
    initialParameters.modelName = selectedModel.modelName;
  }
  if (!initialParameters.marketName) {
    initialParameters.marketName = selectedModel.marketName;
  }

  return initialParameters;
}

async function fetchAutoMatchParameterHints(modelName: string) {
  const response = await requestApi('/rescueDevice/getRomMatchParams.jhtml', {
    modelName,
  });
  const payload = toRomMatchParamsResponse(await response.json());

  if (!payload || payload.code !== '0000' || !payload.content) {
    return {
      platform: '',
      requiredParameters: [],
    };
  }

  const requiredParameters = Array.isArray(payload.content.params)
    ? payload.content.params.filter((parameter) => typeof parameter === 'string')
    : [];

  return {
    platform: typeof payload.content.platform === 'string' ? payload.content.platform : '',
    requiredParameters,
  };
}

function getValuesToExplore(parameterKey: string, parameterValues: string[]) {
  if (!parameterKey) return [];
  return [...new Set(parameterValues)];
}

async function exploreManualMatchTree(
  parameters: Record<string, string>,
  depth: number,
  variants: FirmwareVariant[],
  seenParameterStates: Set<string>,
  seenRomUrls: Set<string>,
  exploreAllBranches: boolean,
) {
  if (depth > maximumExplorationDepth) {
    return {
      code: 'MAX_DEPTH',
      description: 'Manual match exploration reached maximum depth.',
    };
  }

  const parameterState = serializeParameterState(parameters);
  if (seenParameterStates.has(parameterState)) {
    return {
      code: 'SEEN_STATE',
      description: 'Manual match state already explored.',
    };
  }
  seenParameterStates.add(parameterState);

  const response = await requestApi('/rescueDevice/getResource.jhtml', parameters);
  const payload = toManualMatchResponse(await response.json());

  const code = typeof payload?.code === 'string' ? payload.code : '';
  const description = typeof payload?.desc === 'string' ? payload.desc : '';

  if (code !== '0000') {
    return { code, description };
  }

  const firstContent = Array.isArray(payload?.content) ? payload.content[0] : undefined;
  if (!firstContent) {
    return { code, description };
  }

  const variant = createFirmwareVariantFromResourceItem(firstContent, parameters);
  if (variant) {
    pushUniqueVariant(variants, seenRomUrls, variant);
    return { code, description };
  }

  const nextParameterKey = firstContent.paramProperty?.property;
  const nextParameterValues = firstContent.paramValues;
  if (
    typeof nextParameterKey !== 'string' ||
    nextParameterKey.length === 0 ||
    !Array.isArray(nextParameterValues) ||
    nextParameterValues.length === 0
  ) {
    return { code, description };
  }

  const valuesToExplore = getValuesToExplore(nextParameterKey, nextParameterValues);
  const branchValues = exploreAllBranches ? valuesToExplore : valuesToExplore.slice(0, 1);

  for (const valueToExplore of branchValues) {
    const nextParameters = {
      ...parameters,
      [nextParameterKey]: valueToExplore,
    };
    await exploreManualMatchTree(
      nextParameters,
      depth + 1,
      variants,
      seenParameterStates,
      seenRomUrls,
      exploreAllBranches,
    );
  }

  return { code, description };
}

export async function fetchFirmwareVariantsForCatalogModel(
  selectedModel: ModelCatalogEntry,
  initialParametersOverride?: Record<string, string>,
  exploreAllBranches: boolean = false,
) {
  const initialParameters = buildInitialParameters(selectedModel, initialParametersOverride);

  const variants: FirmwareVariant[] = [];
  const seenParameterStates = new Set<string>();
  const seenRomUrls = new Set<string>();

  const manualMatchResult = await exploreManualMatchTree(
    initialParameters,
    0,
    variants,
    seenParameterStates,
    seenRomUrls,
    exploreAllBranches,
  );

  const { platform, requiredParameters } = await fetchAutoMatchParameterHints(
    selectedModel.modelName,
  );

  variants.sort((leftVariant, rightVariant) => {
    const leftDate = leftVariant.publishDate || '';
    const rightDate = rightVariant.publishDate || '';
    const byDate = rightDate.localeCompare(leftDate);
    if (byDate !== 0) return byDate;
    return leftVariant.romName.localeCompare(rightVariant.romName);
  });

  return {
    variants,
    statesExplored: seenParameterStates.size,
    manualMatchResponseCode: manualMatchResult.code,
    manualMatchResponseDescription: manualMatchResult.description,
    autoMatchPlatform: platform,
    autoMatchRequiredParameters: requiredParameters,
  } as CatalogFirmwareLookupResult;
}

export async function discoverCountryOptionsForCatalogModel(selectedModel: ModelCatalogEntry) {
  const parameters = buildInitialParameters(selectedModel);
  let discoveryResponseCode = '';
  let discoveryResponseDescription = '';

  for (let depth = 0; depth < maximumExplorationDepth; depth += 1) {
    const response = await requestApi('/rescueDevice/getResource.jhtml', parameters);
    const payload = toManualMatchResponse(await response.json());

    discoveryResponseCode =
      typeof payload?.code === 'string' ? payload.code : discoveryResponseCode;
    discoveryResponseDescription =
      typeof payload?.desc === 'string' ? payload.desc : discoveryResponseDescription;

    if (discoveryResponseCode !== '0000') {
      return {
        foundCountrySelector: false,
        countryParameterKey: '',
        countryValues: [],
        baseParametersBeforeCountry: { ...parameters },
        discoveryResponseCode,
        discoveryResponseDescription,
      } as CatalogCountryOptions;
    }

    const firstContent = Array.isArray(payload?.content) ? payload.content[0] : undefined;
    if (!firstContent) {
      return {
        foundCountrySelector: false,
        countryParameterKey: '',
        countryValues: [],
        baseParametersBeforeCountry: { ...parameters },
        discoveryResponseCode,
        discoveryResponseDescription,
      } as CatalogCountryOptions;
    }

    const romUri = firstContent.romResource?.uri;
    if (typeof romUri === 'string' && romUri.length > 0) {
      return {
        foundCountrySelector: false,
        countryParameterKey: '',
        countryValues: [],
        baseParametersBeforeCountry: { ...parameters },
        discoveryResponseCode,
        discoveryResponseDescription,
      } as CatalogCountryOptions;
    }

    const nextParameterKey = firstContent.paramProperty?.property;
    const nextParameterValues = firstContent.paramValues;
    if (
      typeof nextParameterKey !== 'string' ||
      nextParameterKey.length === 0 ||
      !Array.isArray(nextParameterValues) ||
      nextParameterValues.length === 0
    ) {
      return {
        foundCountrySelector: false,
        countryParameterKey: '',
        countryValues: [],
        baseParametersBeforeCountry: { ...parameters },
        discoveryResponseCode,
        discoveryResponseDescription,
      } as CatalogCountryOptions;
    }

    if (countryParameterKeys.has(nextParameterKey)) {
      return {
        foundCountrySelector: true,
        countryParameterKey: nextParameterKey,
        countryValues: uniqueValues(nextParameterValues),
        baseParametersBeforeCountry: { ...parameters },
        discoveryResponseCode,
        discoveryResponseDescription,
      } as CatalogCountryOptions;
    }

    const firstValue = nextParameterValues[0];
    if (!firstValue) {
      return {
        foundCountrySelector: false,
        countryParameterKey: '',
        countryValues: [],
        baseParametersBeforeCountry: { ...parameters },
        discoveryResponseCode,
        discoveryResponseDescription,
      } as CatalogCountryOptions;
    }

    parameters[nextParameterKey] = firstValue;
  }

  return {
    foundCountrySelector: false,
    countryParameterKey: '',
    countryValues: [],
    baseParametersBeforeCountry: { ...parameters },
    discoveryResponseCode: 'MAX_DEPTH',
    discoveryResponseDescription: 'Manual country discovery reached maximum depth.',
  } as CatalogCountryOptions;
}
