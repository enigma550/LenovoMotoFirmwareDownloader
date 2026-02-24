import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const version: string | undefined = process.argv[2];
const buildEnv: string = process.argv[3] || "dev";

if (!version) {
    console.error("No version provided. Usage: bun scripts/patch-config.ts <version> <env>");
    process.exit(1);
}

const configPath: string = join(process.cwd(), "electrobun.config.ts");
let content: string = readFileSync(configPath, "utf8");

const versionRegex: RegExp = /(version:\s*)(["'])([^"']+)(["'])/;
if (versionRegex.test(content)) {
    content = content.replace(versionRegex, `$1$2${version}$4`);
} else {
    console.error("Could not find version entry in electrobun.config.ts to patch.");
    process.exit(1);
}

let targetBaseUrl: string = "";
let generatePatchValue: string = "process.platform !== 'linux'";

if (buildEnv === "stable") {
    targetBaseUrl = "https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases/latest/download/";
} else if (buildEnv === "canary") {
    targetBaseUrl = "https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases/download/canary/";
} else {
    generatePatchValue = "false";
    targetBaseUrl = "";
}

const baseUrlRegex: RegExp = /baseUrl:\s*([`"'])(?:(?!\1).)*\1|baseUrl:\s*[^,]+/;
if (baseUrlRegex.test(content)) {
    content = content.replace(baseUrlRegex, `baseUrl: "${targetBaseUrl}"`);
}

const patchRegex: RegExp = /generatePatch:\s*[^,]+/;
if (patchRegex.test(content)) {
    content = content.replace(patchRegex, `generatePatch: ${generatePatchValue}`);
}

writeFileSync(configPath, content);
console.log(`Successfully patched electrobun.config.ts: version=${version}, env=${buildEnv}`);