import { requestApi } from '../../infra/lmsa/api.ts';
import { ensureProjectStorageReady, MODEL_CATALOG_PATH } from '../../infra/storage.ts';
import type {
  JsonArray,
  JsonObject,
  JsonValue,
  ModelCatalogEntry,
} from '../../shared/types/index.ts';

function parseBoolean(value: JsonValue | undefined) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function toJsonObject(value: JsonValue | null | undefined): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function mapModelCatalogEntry(value: JsonValue) {
  const record = toJsonObject(value);
  if (!record) return null;
  const modelName = record.modelName;
  const marketName = record.marketName;
  const platform = record.platform;
  const category = record.category;
  const brand = record.brand;

  if (
    typeof modelName !== 'string' ||
    typeof marketName !== 'string' ||
    typeof platform !== 'string' ||
    typeof category !== 'string' ||
    typeof brand !== 'string'
  ) {
    return null;
  }

  const modelCatalogEntry: ModelCatalogEntry = {
    category,
    brand,
    modelName,
    marketName,
    platform,
    readSupport: parseBoolean(record.readSupport),
    readFlow: typeof record.readFlow === 'string' ? record.readFlow : '',
  };

  return modelCatalogEntry;
}

function extractModelArray(content: JsonValue | undefined) {
  if (Array.isArray(content)) return content;

  const record = toJsonObject(content);
  if (Array.isArray(record?.models)) {
    return record.models;
  }

  return [] as JsonArray;
}

function normalizeModelCatalog(content: JsonValue | undefined) {
  const rawModels = extractModelArray(content);
  const modelCatalog: ModelCatalogEntry[] = [];

  for (const rawModel of rawModels) {
    const modelCatalogEntry = mapModelCatalogEntry(rawModel);
    if (modelCatalogEntry) {
      modelCatalog.push(modelCatalogEntry);
    }
  }

  return modelCatalog;
}

async function fetchModelCatalogFromApi() {
  const response = await requestApi('/rescueDevice/getModelNames.jhtml', {});
  const data = (await response.json()) as {
    code?: string;
    content?: JsonValue;
  };
  if (data?.code !== '0000') {
    throw new Error(`getModelNames failed: ${data?.code ?? 'missing_code'}`);
  }

  return normalizeModelCatalog(data.content);
}

async function loadModelCatalogFromFile() {
  await ensureProjectStorageReady();
  const file = Bun.file(MODEL_CATALOG_PATH);
  if (!(await file.exists())) return [];

  try {
    const data = (await file.json()) as JsonValue;
    return normalizeModelCatalog(data);
  } catch {
    return [];
  }
}

async function saveModelCatalogToFile(modelCatalog: ModelCatalogEntry[]) {
  await ensureProjectStorageReady();
  await Bun.write(MODEL_CATALOG_PATH, JSON.stringify(modelCatalog, null, 2));
}

export async function refreshModelCatalogFromApi() {
  const modelCatalogFromApi = await fetchModelCatalogFromApi();
  await saveModelCatalogToFile(modelCatalogFromApi);
  return modelCatalogFromApi;
}

export async function getModelCatalog() {
  return loadModelCatalogFromFile();
}
