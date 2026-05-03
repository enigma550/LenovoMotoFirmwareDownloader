import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION: string | undefined = process.argv[2];
const BUILD_ENV: string = process.argv[3] || 'dev';

if (!VERSION) {
  console.error('No version provided. Usage: bun tooling/build/patch-config.ts <version> <env>');
  process.exit(1);
}

const CONFIG_PATH: string = join(process.cwd(), 'electrobun.config.ts');
let content: string = readFileSync(CONFIG_PATH, 'utf8');

const VERSION_REGEX: RegExp = /(version:\s*)(["'])([^"']+)(["'])/;
if (VERSION_REGEX.test(content)) {
  content = content.replace(VERSION_REGEX, `$1$2${VERSION}$4`);
} else {
  console.error('Could not find version entry in electrobun.config.ts to patch.');
  process.exit(1);
}

let targetBaseUrl: string = '';
let generatePatchValue: string = "process.platform !== 'linux'";

if (BUILD_ENV === 'stable') {
  targetBaseUrl =
    'https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases/latest/download/';
} else if (BUILD_ENV === 'canary') {
  targetBaseUrl =
    'https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases/latest/download/';
} else {
  generatePatchValue = 'false';
  targetBaseUrl = '';
}

const BASE_URL_REGEX: RegExp = /baseUrl:\s*([`"'])(?:(?!\1).)*\1|baseUrl:\s*[^,]+/;
if (BASE_URL_REGEX.test(content)) {
  content = content.replace(BASE_URL_REGEX, `baseUrl: "${targetBaseUrl}"`);
}

const PATCH_REGEX: RegExp = /generatePatch:\s*[^,]+/;
if (PATCH_REGEX.test(content)) {
  content = content.replace(PATCH_REGEX, `generatePatch: ${generatePatchValue}`);
}

writeFileSync(CONFIG_PATH, content);
console.log(`Successfully patched electrobun.config.ts: version=${VERSION}, env=${BUILD_ENV}`);
