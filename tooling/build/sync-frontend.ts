import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE_DIR = resolve(process.cwd(), 'web', 'dist', 'web');
const TARGET_DIR = resolve(process.cwd(), 'runtime', 'views', 'mainview');
const TARGET_INDEX_PATH = resolve(TARGET_DIR, 'browser', 'index.html');

await rm(TARGET_DIR, { recursive: true, force: true });
await mkdir(TARGET_DIR, { recursive: true });
await cp(SOURCE_DIR, TARGET_DIR, { recursive: true });

const RAW_INDEX_HTML = await readFile(TARGET_INDEX_PATH, 'utf8');
const PATCHED_INDEX_HTML = RAW_INDEX_HTML.replace(/\s+type="module"/g, '')
  .replace(
    /<link rel="stylesheet" href="([^"]+)" media="print" onload="this.media='all'">/g,
    '<link rel="stylesheet" href="$1">',
  )
  .replace(/<noscript><link rel="stylesheet" href="([^"]+)"><\/noscript>/g, '');

if (PATCHED_INDEX_HTML !== RAW_INDEX_HTML) {
  await writeFile(TARGET_INDEX_PATH, PATCHED_INDEX_HTML, 'utf8');
}

console.log(`[ELECTROBUN] Copied ${SOURCE_DIR} -> ${TARGET_DIR}`);
