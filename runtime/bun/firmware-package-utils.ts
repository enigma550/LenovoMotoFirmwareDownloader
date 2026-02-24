import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  type Dirent,
} from "fs";
import { join } from "path";

export const KNOWN_XML_FLASH_SCRIPT_NAMES = [
  "flashfile.xml",
  "servicefile.xml",
  "softwareupgrade.xml",
  "efuse.xml",
  "lkbin.xml",
] as const;
const KNOWN_XML_FLASH_SCRIPT_SET = new Set<string>(
  KNOWN_XML_FLASH_SCRIPT_NAMES,
);

export function getDownloadDirectory() {
  const homeDirectory =
    Bun.env.HOME ||
    Bun.env.USERPROFILE ||
    process.env.HOME ||
    process.env.USERPROFILE ||
    ".";
  return join(homeDirectory, "Downloads", "LenovoMotoFirmwareDownloader");
}

export function getRescueDirectory() {
  return join(getDownloadDirectory(), ".rescue-lite");
}

export function getRescueExtractDirectoryRoot() {
  return join(getRescueDirectory(), "extracted");
}

export function sanitizeFileName(fileName: string, fallback = "firmware.zip") {
  const sanitized = fileName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || fallback;
}

export function sanitizeDirectoryName(name: string) {
  return (
    sanitizeFileName(name, "firmware").replace(/\.+$/g, "").slice(0, 160) ||
    "firmware"
  );
}

export function normalizeRemoteUrl(value: string | undefined | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export function asRecord(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function firstStringField(
  record: Record<string, unknown> | null,
  names: string[],
) {
  if (!record) return "";
  for (const name of names) {
    const value = record[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function getRecipeSteps(recipeContent: unknown) {
  const recipe = asRecord(recipeContent);
  if (!recipe) return [];
  if (Array.isArray(recipe.Steps)) return recipe.Steps;
  if (Array.isArray(recipe.steps)) return recipe.steps;
  return [];
}

export function isRescueRecipeContent(recipeContent: unknown) {
  const recipe = asRecord(recipeContent);
  const useCase = firstStringField(recipe, [
    "UseCase",
    "useCase",
  ]).toLowerCase();
  const isRescueUseCase = useCase.includes("rescue");
  const hasFastbootFlashStep = getRecipeSteps(recipeContent).some((stepRaw) => {
    const step = asRecord(stepRaw);
    if (!step) return false;
    const stepName = firstStringField(step, ["Step", "step"]).toLowerCase();
    return stepName.includes("fastbootflash");
  });
  return isRescueUseCase && hasFastbootFlashStep;
}

export function hasUsableExtractedRescueScripts(extractDir: string) {
  for (const scriptName of KNOWN_XML_FLASH_SCRIPT_NAMES) {
    if (existsSync(join(extractDir, scriptName))) {
      return true;
    }
  }

  // Fallback for packages where XML scripts are nested in subfolders.
  let xmlInspected = 0;
  const maxXmlInspected = 60;
  const queue = [extractDir];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const current = queue[queueIndex] as string;
    let entries: Dirent[];
    try {
      entries = readdirSync(current, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const lowerName = entry.name.toLowerCase();
      if (KNOWN_XML_FLASH_SCRIPT_SET.has(lowerName)) {
        return true;
      }
      if (!lowerName.endsWith(".xml")) {
        continue;
      }
      if (xmlInspected >= maxXmlInspected) {
        continue;
      }
      xmlInspected += 1;

      try {
        const sizeBytes = statSync(fullPath).size;
        if (sizeBytes <= 0 || sizeBytes > 4 * 1024 * 1024) {
          continue;
        }
        const xmlText = readFileSync(fullPath, "utf8");
        if (
          xmlText.includes('operation="flash"') ||
          xmlText.includes("operation='flash'") ||
          /<step\b/i.test(xmlText)
        ) {
          return true;
        }
      } catch {
        // Ignore malformed/unreadable xml candidates.
      }
    }
  }

  return false;
}
