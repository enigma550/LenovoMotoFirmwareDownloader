import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  type Dirent,
} from "fs";
import { join, normalize, isAbsolute, resolve, relative, basename, extname } from "path";
import { mkdir, readdir, stat } from "fs/promises";

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

export function getExtractDirForPackagePath(packagePath: string) {
  const base = basename(packagePath);
  const withoutZip = base.replace(/\.zip$/i, "");
  return join(
    getRescueExtractDirectoryRoot(),
    sanitizeDirectoryName(withoutZip),
  );
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

export function normalizePathForLookup(value: string) {
  return normalize(value).replace(/\\/g, "/");
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

export async function findReusableFirmwarePackagePath(
  downloadDirectory: string,
  romUrl: string,
  romName: string,
) {
  const preferredFileName = inferFirmwareFileName(romUrl, romName);
  const preferredPath = join(downloadDirectory, preferredFileName);
  if (await Bun.file(preferredPath).exists()) {
    return preferredPath;
  }

  const extension = extname(preferredFileName);
  const baseName = extension
    ? preferredFileName.slice(0, -extension.length)
    : preferredFileName;

  const entries = await readdir(downloadDirectory, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => {
      if (!entry.isFile()) return false;
      if (entry.name === preferredFileName) return true;
      if (!entry.name.startsWith(`${baseName}-`)) return false;
      if (!extension) return true;
      return entry.name.endsWith(extension);
    })
    .map((entry) => join(downloadDirectory, entry.name));

  if (candidates.length === 0) {
    return "";
  }

  let latestPath = "";
  let latestMtime = -1;
  for (const candidatePath of candidates) {
    try {
      const info = await stat(candidatePath);
      if (info.mtimeMs > latestMtime) {
        latestMtime = info.mtimeMs;
        latestPath = candidatePath;
      }
    } catch {
      // Ignore file races while scanning.
    }
  }

  return latestPath;
}

export async function ensureExtractedFirmwarePackage(options: {
  packagePath: string;
  extractedDir?: string;
  signal?: AbortSignal;
  onProcess?: (process: Bun.Subprocess | null) => void;
}) {
  const extractDir =
    options.extractedDir?.trim() ||
    getExtractDirForPackagePath(options.packagePath);
  await mkdir(extractDir, { recursive: true });

  if (hasUsableExtractedRescueScripts(extractDir)) {
    return {
      extractDir,
      reusedExtraction: true,
    };
  }

  if (process.platform === "win32") {
    // Windows 10 and 11 have 'tar' built-in natively. 
    // It is significantly faster and more reliable than PowerShell's Expand-Archive module.
    const proc = Bun.spawn([
      "tar",
      "-xf",
      options.packagePath,
      "-C",
      extractDir
    ], {
      cwd: getDownloadDirectory(),
      stdout: "pipe",
      stderr: "pipe"
    });

    if (options.onProcess) options.onProcess(proc);

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      // Read the actual error message from tar
      const errorMessage = await new Response(proc.stderr).text();

      // Fallback/Error handling if tar fails for some reason
      throw new Error(`Windows tar extraction failed (Code ${exitCode}). Details: ${errorMessage.trim()}`);
    }
  } else {
    // Linux/macOS
    try {
      const proc = Bun.spawn(["unzip", "-o", options.packagePath, "-d", extractDir], {
        cwd: getDownloadDirectory(),
        stdout: "pipe",
        stderr: "pipe"
      });

      if (options.onProcess) options.onProcess(proc);

      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        // unzip returns 1 for minor warnings (e.g. extra bytes at start of zip). 
        // We might want to allow 1, but let's capture the error first.
        const errorMessage = await new Response(proc.stderr).text();
        throw new Error(`Unzip failed (Code ${exitCode}). Details: ${errorMessage.trim()}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("End-of-central-directory signature not found") ||
        message.includes("zipfile directory") ||
        message.includes("cannot find zipfile directory")
      ) {
        throw new Error(
          "The firmware file is incomplete or corrupt. Please finish the download or try again.",
        );
      }
      throw error;
    }
  }

  return {
    extractDir,
    reusedExtraction: false,
  };
}

export function formatFastbootArgs(args: string[]) {
  return ["fastboot", ...args].join(" ");
}

export function isWipeSensitivePartition(partition: string) {
  const lowerPartition = partition.toLowerCase();
  return (
    lowerPartition === "userdata" ||
    lowerPartition === "cache" ||
    lowerPartition === "metadata"
  );
}

export function parseCommandTokens(rawLine: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < rawLine.length; index += 1) {
    const char = rawLine[index] as string;
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }
  return tokens;
}

export function shouldSkipForDataReset(args: string[], dataReset: "yes" | "no") {
  if (dataReset !== "no" || args.length < 2) {
    return false;
  }
  const command = (args[0] || "").toLowerCase();
  const partition = (args[1] || "").toLowerCase();
  if (command === "erase" || command === "format") {
    return isWipeSensitivePartition(partition);
  }
  if (command === "flash" && partition) {
    return isWipeSensitivePartition(partition);
  }
  return false;
}

export async function maybeResolveCommandFileArgument(
  args: string[],
  extractDir: string,
  fileIndex: Map<string, string[]>,
) {
  if (args.length < 2) {
    return args;
  }

  const command = (args[0] || "").toLowerCase();
  const next = args.slice();

  const resolveAtIndex = async (index: number) => {
    const raw = (next[index] || "").trim();
    if (!raw || raw.startsWith("-")) {
      return;
    }
    const cleaned = raw.replace(/^["']|["']$/g, "");
    if (!cleaned || cleaned.includes("=")) {
      return;
    }

    const preferredPath = resolve(extractDir, normalizePathForLookup(cleaned));
    if (await Bun.file(preferredPath).exists()) {
      next[index] = relative(extractDir, preferredPath);
      return;
    }

    try {
      const resolved = await resolveStepFilePath(extractDir, cleaned, fileIndex);
      next[index] = relative(extractDir, resolved);
    } catch {
      // Keep original token as best-effort if file lookup fails.
    }
  };

  if (command === "flash" && args.length >= 3) {
    await resolveAtIndex(args.length - 1);
    return next;
  }

  if ((command === "update" || command === "boot") && args.length >= 2) {
    await resolveAtIndex(1);
    return next;
  }

  return next;
}

export async function resolveStepFilePath(
  extractDir: string,
  rawPath: string,
  fileIndex: Map<string, string[]>,
) {
  const cleaned = normalizePathForLookup(rawPath.trim());
  if (!cleaned) {
    throw new Error("Flash step has an empty filename.");
  }

  const preferredPath = isAbsolute(cleaned)
    ? cleaned
    : resolve(extractDir, cleaned);
  if (await Bun.file(preferredPath).exists()) {
    return preferredPath;
  }

  const fileName = basename(cleaned).toLowerCase();
  const indexed = fileIndex.get(fileName) || [];
  if (indexed.length === 0) {
    throw new Error(`Missing firmware payload file: ${rawPath}`);
  }

  const normalizedNeedle = cleaned.toLowerCase();
  const exactSuffixMatch = indexed.find((candidate) =>
    normalizePathForLookup(candidate).toLowerCase().endsWith(normalizedNeedle),
  );
  if (exactSuffixMatch) {
    return exactSuffixMatch;
  }

  return indexed.slice().sort((left, right) => left.length - right.length)[0];
}

export async function collectFilesRecursive(rootDir: string) {
  const filePaths: string[] = [];
  const queue: string[] = [rootDir];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile()) {
        filePaths.push(fullPath);
      }
    }
  }
  return filePaths;
}

export function createFileIndex(filePaths: string[]) {
  const index = new Map<string, string[]>();
  for (const filePath of filePaths) {
    const key = basename(filePath).toLowerCase();
    const list = index.get(key);
    if (list) {
      list.push(filePath);
    } else {
      index.set(key, [filePath]);
    }
  }
  return index;
}

export function inferFirmwareFileName(romUrl: string, romName: string) {
  const urlFileName = (() => {
    try {
      const pathname = new URL(romUrl).pathname;
      return basename(pathname);
    } catch {
      return "";
    }
  })();

  const chosenName = urlFileName || `${romName || "firmware"}.zip`;
  const sanitized = sanitizeFileName(chosenName);
  return extname(sanitized) ? sanitized : `${sanitized}.zip`;
}