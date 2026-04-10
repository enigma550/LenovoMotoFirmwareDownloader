import type { JsonObject, JsonValue } from '../../common/json.ts';
import type { ModelCatalogEntry } from '../../domain/catalog/model.ts';

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

export interface ManualMatchResponse {
  code?: string;
  desc?: string;
  content?: ManualMatchContentItem[];
}

export interface RomMatchParamsResponse {
  code?: string;
  desc?: string;
  content?: {
    platform?: string;
    params?: string[];
  };
}

export const maximumExplorationDepth = 15;
export const countryParameterKeys = new Set(['country', 'countryCode']);

export function toJsonObject(value: JsonValue | null | undefined): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

export function toManualMatchResponse(value: JsonValue) {
  if (!toJsonObject(value)) return null;
  return value as ManualMatchResponse;
}

export function toRomMatchParamsResponse(value: JsonValue) {
  if (!toJsonObject(value)) return null;
  return value as RomMatchParamsResponse;
}

export function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

export function serializeParameterState(parameters: Record<string, string>) {
  const sortedEntries = Object.entries(parameters).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );
  return JSON.stringify(sortedEntries);
}

export function buildInitialParameters(
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

export function getValuesToExplore(parameterValues: string[]) {
  return [...new Set(parameterValues)];
}
