import type { AppConfig } from '../shared/types/index.ts';
import { CONFIG_PATH, ensureProjectStorageReady } from './storage.ts';

export async function loadConfig() {
  await ensureProjectStorageReady();
  const file = Bun.file(CONFIG_PATH);
  if (!(await file.exists())) return {};

  try {
    const config: AppConfig = await file.json();
    return config;
  } catch {
    console.error(`[WARN] Could not parse config file at ${CONFIG_PATH}. Starting fresh.`);
    return {};
  }
}

export async function saveConfig(config: AppConfig) {
  await ensureProjectStorageReady();
  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2));
}
