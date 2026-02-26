import { requestApi } from '../../infra/lmsa/api.ts';
import { ensureProjectStorageReady, MODEL_CATALOG_PATH } from '../../infra/storage.ts';
import type { ModelCatalogEntry } from '../../shared/types/index.ts';

function parseBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function mapModelCatalogEntry(value: unknown) {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
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

  return {
    category,
    brand,
    modelName,
    marketName,
    platform,
    readSupport: parseBoolean(record.readSupport),
    readFlow: typeof record.readFlow === 'string' ? record.readFlow : '',
  } as ModelCatalogEntry;
}

function extractModelArray(content: unknown) {
  if (Array.isArray(content)) return content;

  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>;
    if (Array.isArray(record.models)) {
      return record.models;
    }
  }

  return [];
}

function normalizeModelCatalog(content: unknown) {
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
    content?: unknown;
  };
  if (data?.code !== '0000') {
    throw new Error(`getModelNames failed: ${data?.code ?? 'unknown'}`);
  }

  return normalizeModelCatalog(data.content);
}

async function loadModelCatalogFromFile() {
  await ensureProjectStorageReady();
  const file = Bun.file(MODEL_CATALOG_PATH);
  if (!(await file.exists())) return [];

  try {
    const data: unknown = await file.json();
    if (!Array.isArray(data)) return [];
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
