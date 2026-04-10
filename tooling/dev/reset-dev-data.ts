import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PROJECT_ROOT = process.cwd();
const DATA_DIR = resolve(PROJECT_ROOT, 'assets', 'data');
const CONFIG_PATH = resolve(DATA_DIR, 'config.json');
const CATALOG_PATH = resolve(DATA_DIR, 'models-catalog.json');

await mkdir(DATA_DIR, { recursive: true });
await writeFile(CONFIG_PATH, '{}\n', 'utf8');
await writeFile(CATALOG_PATH, '[]\n', 'utf8');

console.log('[DEV DATA] Reset assets/data/config.json and assets/data/models-catalog.json');
