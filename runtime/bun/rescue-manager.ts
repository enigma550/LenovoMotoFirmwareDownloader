import { mkdir, readdir, stat } from "fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from "path";
import type {
  DownloadProgressMessage,
  ExtractLocalFirmwareResponse,
  RescueLiteFirmwareResponse,
} from "../shared/rpc.ts";
import { requestApi } from "../../core/infra/lmsa/api.ts";
import { USER_AGENT } from "../../core/infra/lmsa/constants.ts";
import { cookieJar, session } from "../../core/infra/lmsa/state.ts";
import { downloadFirmwareWithProgress } from "./download-manager.ts";
import {
  asRecord,
  firstStringField,
  getDownloadDirectory,
  getRecipeSteps,
  getRescueExtractDirectoryRoot,
  hasUsableExtractedRescueScripts,
  isRescueRecipeContent,
  normalizeRemoteUrl,
  sanitizeDirectoryName,
  sanitizeFileName,
} from "./firmware-package-utils.ts";
import { writeFirmwareMetadata } from "./firmware-metadata.ts";

type RescueProgressEmitter = (progress: DownloadProgressMessage) => void;

type ActiveRescue = {
  controller: AbortController;
  canceled: boolean;
  activeProcess: Bun.Subprocess | null;
};

type XmlStep = {
  operation: string;
  attrs: Record<string, string>;
};

type PreparedFastbootCommand = {
  args: string[];
  label: string;
  softFail: boolean;
};

type RescueRecipeHints = {
  source: string;
  preferredFileNames: Set<string>;
  referenceCount: number;
};

const activeRescues = new Map<string, ActiveRescue>();

function inferFirmwareFileName(romUrl: string, romName: string) {
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

async function findReusableFirmwarePackagePath(
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

function getExtractDirForPackagePath(packagePath: string) {
  const base = basename(packagePath);
  const withoutZip = base.replace(/\.zip$/i, "");
  return join(
    getRescueExtractDirectoryRoot(),
    sanitizeDirectoryName(withoutZip),
  );
}

function serializeCookiesForRequest() {
  return [...cookieJar.entries()]
    .map(([cookieName, cookieValue]) => `${cookieName}=${cookieValue}`)
    .join("; ");
}

function mapRecipeReferenceToPreferredFileNames(
  reference: string,
  dataReset: "yes" | "no",
  collector: Set<string>,
) {
  const normalized = reference.trim().replace(/^\$+/, "").toLowerCase();
  if (!normalized) return;
  const base = basename(normalized);

  if (normalized === "xmlfile") {
    collector.add(dataReset === "yes" ? "flashfile.xml" : "servicefile.xml");
    collector.add("flashfile.xml");
    collector.add("servicefile.xml");
    return;
  }
  if (normalized === "upgradexmlfile") {
    collector.add("servicefile.xml");
    return;
  }
  if (normalized === "softwareupgrade") {
    collector.add("softwareupgrade.xml");
    return;
  }
  if (normalized.startsWith("flashinfo")) {
    collector.add("flashinfo.xml");
    collector.add("flashinfo_rsa.xml");
    return;
  }
  if (normalized === "efuse") {
    collector.add("efuse.xml");
    return;
  }
  if (normalized === "lkbin") {
    collector.add("lkbin.xml");
    return;
  }
  if (base.endsWith(".xml") || base.endsWith(".bat") || base.endsWith(".sh")) {
    collector.add(base);
  }
}

function collectRecipeReferences(recipeContent: unknown) {
  const references: string[] = [];
  const steps = getRecipeSteps(recipeContent);

  for (const stepRaw of steps) {
    const step = asRecord(stepRaw);
    if (!step) continue;
    const stepName = firstStringField(step, ["Step", "step"]).toLowerCase();
    const args = asRecord(step.Args) || asRecord(step.args);
    if (!args) continue;

    if (stepName.includes("loadfiles")) {
      const files =
        (Array.isArray(args.Files) && args.Files) ||
        (Array.isArray(args.files) && args.files) ||
        [];
      for (const file of files) {
        if (typeof file === "string" && file.trim()) {
          references.push(file.trim());
        }
      }
    }

    if (stepName.includes("fastbootflash")) {
      const xmlValue = firstStringField(args, ["XML", "xml"]);
      if (xmlValue) {
        references.push(xmlValue);
      }
    }

    if (stepName.includes("fastbootmodifyflashfile")) {
      const fileValue = firstStringField(args, ["File", "file"]);
      if (fileValue) {
        references.push(fileValue);
      }
    }
  }

  return references;
}

async function fetchRecipeJson(recipeUrl: string) {
  const headers = new Headers({
    "User-Agent": USER_AGENT,
    Guid: session.guid,
  });
  const serializedCookies = serializeCookiesForRequest();
  if (serializedCookies) {
    headers.set("Cookie", serializedCookies);
  }
  if (session.jwt) {
    headers.set("Authorization", session.jwt);
  }

  const response = await fetch(recipeUrl, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Recipe request failed with status ${response.status}.`);
  }
  const text = await response.text();
  return JSON.parse(text) as unknown;
}

async function resolveRescueRecipeHints(
  payload: {
    recipeUrl?: string;
    selectedParameters?: Record<string, string>;
  },
  dataReset: "yes" | "no",
) {
  let recipeContent: unknown = undefined;
  let source = "";

  const directRecipeUrl = normalizeRemoteUrl(payload.recipeUrl || "");
  if (directRecipeUrl) {
    recipeContent = await fetchRecipeJson(directRecipeUrl);
    if (!isRescueRecipeContent(recipeContent)) {
      throw new Error(
        "Provided recipe URL is not a rescue/flash recipe (expected LMSA_Rescue with FastbootFlash).",
      );
    }
    source = `direct:${basename(new URL(directRecipeUrl).pathname) || "recipe"}`;
  } else {
    const selectedParameters = payload.selectedParameters || {};
    const modelName =
      selectedParameters.modelName ||
      selectedParameters.modelCode ||
      selectedParameters.sku ||
      "";
    const marketName = selectedParameters.marketName || "";
    const category = selectedParameters.category || "";

    if (modelName || marketName) {
      const recipeInfoResponse = await requestApi(
        "/rescueDevice/getRescueModelRecipe.jhtml",
        {
          modelName,
          marketName,
          category,
        },
      );
      const recipeInfoPayload = asRecord(await recipeInfoResponse.json());
      const code =
        typeof recipeInfoPayload?.code === "string"
          ? recipeInfoPayload.code
          : "";
      if (code === "0000") {
        const content = asRecord(recipeInfoPayload?.content);
        const recipeUrlFromApi = normalizeRemoteUrl(
          firstStringField(content, ["flashFlow", "recipe"]),
        );
        if (recipeUrlFromApi) {
          recipeContent = await fetchRecipeJson(recipeUrlFromApi);
          if (!isRescueRecipeContent(recipeContent)) {
            throw new Error(
              "Model recipe URL resolved to a non-rescue flow. Falling back to local XML/script.",
            );
          }
          source = `api:${basename(new URL(recipeUrlFromApi).pathname) || "recipe"}`;
        } else if (firstStringField(content, ["readFlow"])) {
          throw new Error(
            "Model recipe returned readFlow-only data. Rescue Lite only accepts flashFlow recipes.",
          );
        } else if (
          Array.isArray(content?.Steps) ||
          Array.isArray(content?.steps)
        ) {
          if (!isRescueRecipeContent(content)) {
            throw new Error(
              "Inline recipe data is not a rescue/flash recipe. Falling back to local XML/script.",
            );
          }
          recipeContent = content;
          source = "api:inline";
        }
      }
    }
  }

  if (!recipeContent) return undefined;
  const references = collectRecipeReferences(recipeContent);
  const preferredFileNames = new Set<string>();
  for (const reference of references) {
    mapRecipeReferenceToPreferredFileNames(
      reference,
      dataReset,
      preferredFileNames,
    );
  }
  if (preferredFileNames.size === 0) return undefined;

  return {
    source: source || "recipe",
    preferredFileNames,
    referenceCount: references.length,
  } as RescueRecipeHints;
}

function normalizePathForLookup(value: string) {
  return normalize(value).replace(/\\/g, "/");
}

function wait(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function ensureExtractedFirmwarePackage(options: {
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

  const extractionSignal = options.signal || new AbortController().signal;

  if (process.platform === "win32") {
    // Windows: Use PowerShell's Expand-Archive which is built-in
    await runCommandWithAbort({
      command: "powershell",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -Path '${options.packagePath}' -DestinationPath '${extractDir}' -Force`,
      ],
      cwd: getDownloadDirectory(),
      signal: extractionSignal,
      onProcess: options.onProcess || (() => undefined),
    });
  } else {
    // Linux/macOS: Use standard unzip command
    try {
      await runCommandWithAbort({
        command: "unzip",
        args: ["-o", options.packagePath, "-d", extractDir],
        cwd: getDownloadDirectory(),
        signal: extractionSignal,
        onProcess: options.onProcess || (() => undefined),
      });
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

function isAbortError(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && /abort|cancel/i.test(error.message))
    return true;
  return false;
}

function parseAttributes(attributeSource: string) {
  const attributes: Record<string, string> = {};
  const attrRegex = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(['"])(.*?)\2/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attributeSource)) !== null) {
    const [, key, , value] = match;
    if (!key) continue;
    attributes[key.toLowerCase()] = value?.trim() || "";
  }
  return attributes;
}

function parseXmlSteps(xmlText: string) {
  const stepRegex = /<step\b([^>]*?)\/?>/gi;
  const steps: XmlStep[] = [];
  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(xmlText)) !== null) {
    const attrs = parseAttributes(match[1] || "");
    const operation = (attrs["operation"] || attrs["op"] || "")
      .trim()
      .toLowerCase();
    if (!operation) continue;
    steps.push({ operation, attrs });
  }
  return steps;
}

async function collectFilesRecursive(rootDir: string) {
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

function xmlScriptPriority(
  scriptPath: string,
  dataReset: "yes" | "no",
  recipeHints?: RescueRecipeHints,
) {
  const lowerName = basename(scriptPath).toLowerCase();
  let score = 0;
  if (lowerName.includes("servicefile")) {
    score += dataReset === "no" ? 90 : 30;
  }
  if (lowerName.includes("flashfile")) {
    score += dataReset === "yes" ? 90 : 40;
  }
  if (lowerName.includes("softwareupgrade")) {
    score += dataReset === "no" ? 55 : 35;
  }
  if (lowerName.includes("flashinfo")) {
    score += 45;
  }
  if (lowerName.includes("efuse")) {
    score += 35;
  }
  if (lowerName.includes("lkbin")) {
    score += 35;
  }
  if (lowerName.includes("_cfc")) {
    score += 70;
  }
  if (lowerName.endsWith(".xml")) {
    score += 10;
  }
  if (recipeHints?.preferredFileNames.has(lowerName)) {
    score += 250;
  }
  return score;
}

async function pickFlashScript(
  extractDir: string,
  dataReset: "yes" | "no",
  recipeHints?: RescueRecipeHints,
) {
  const allFiles = await collectFilesRecursive(extractDir);
  const xmlCandidates = allFiles.filter(
    (candidate) => extname(candidate).toLowerCase() === ".xml",
  );
  if (xmlCandidates.length === 0) {
    throw new Error("No XML flash script found in extracted firmware package.");
  }

  let best:
    | {
      scriptPath: string;
      steps: XmlStep[];
      score: number;
    }
    | undefined;

  for (const candidate of xmlCandidates) {
    const xmlText = await Bun.file(candidate).text();
    const steps = parseXmlSteps(xmlText);
    if (steps.length === 0) {
      continue;
    }
    const score =
      xmlScriptPriority(candidate, dataReset, recipeHints) * 1000 +
      steps.length;
    if (!best || score > best.score) {
      best = { scriptPath: candidate, steps, score };
    }
  }

  if (!best || best.steps.length === 0) {
    throw new Error(
      "No usable <step ...> flash instructions found in XML scripts.",
    );
  }

  return best;
}

function createFileIndex(filePaths: string[]) {
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

async function resolveStepFilePath(
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

function formatFastbootArgs(args: string[]) {
  return ["fastboot", ...args].join(" ");
}

function isWipeSensitivePartition(partition: string) {
  const lowerPartition = partition.toLowerCase();
  return (
    lowerPartition === "userdata" ||
    lowerPartition === "cache" ||
    lowerPartition === "metadata"
  );
}

function parseCommandTokens(rawLine: string) {
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

function shouldSkipForDataReset(args: string[], dataReset: "yes" | "no") {
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

async function maybeResolveCommandFileArgument(
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

async function buildFastbootArgsForStep(
  step: XmlStep,
  dataReset: "yes" | "no",
  extractDir: string,
  fileIndex: Map<string, string[]>,
) {
  const attrs = step.attrs;
  const op = step.operation.toLowerCase();
  const partition = (attrs["partition"] || attrs["label"] || "").trim();
  const fileName = (
    attrs["filename"] ||
    attrs["file"] ||
    attrs["filepath"] ||
    attrs["path"] ||
    ""
  ).trim();

  if (op === "flash") {
    if (!partition || !fileName) {
      throw new Error("Flash step is missing partition and/or filename.");
    }
    if (dataReset === "no" && isWipeSensitivePartition(partition)) {
      return {
        args: null,
        skipReason: `skip flash ${partition} (data reset = no)`,
      };
    }
    const resolvedFilePath = await resolveStepFilePath(
      extractDir,
      fileName,
      fileIndex,
    );
    const fastbootPath = relative(extractDir, resolvedFilePath);
    return { args: ["flash", partition, fastbootPath] };
  }

  if (op === "flash_sparse" || op === "flashsparse") {
    if (!partition || !fileName) {
      throw new Error(`${op} step is missing partition and/or filename.`);
    }
    if (dataReset === "no" && isWipeSensitivePartition(partition)) {
      return {
        args: null,
        skipReason: `skip ${op} ${partition} (data reset = no)`,
      };
    }
    const resolvedFilePath = await resolveStepFilePath(
      extractDir,
      fileName,
      fileIndex,
    );
    const fastbootPath = relative(extractDir, resolvedFilePath);
    return { args: ["flash", partition, fastbootPath] };
  }

  if (op === "erase" || op === "format") {
    if (!partition) {
      throw new Error(`${op} step is missing partition.`);
    }
    if (dataReset === "no" && isWipeSensitivePartition(partition)) {
      return {
        args: null,
        skipReason: `skip ${op} ${partition} (data reset = no)`,
      };
    }
    return { args: [op, partition] };
  }

  if (op === "oem") {
    const commandValue = (
      attrs["var"] ||
      attrs["value"] ||
      attrs["command"] ||
      attrs["arg"] ||
      ""
    ).trim();
    if (!commandValue) {
      throw new Error("OEM step is missing command value.");
    }
    return { args: ["oem", ...commandValue.split(/\s+/).filter(Boolean)] };
  }

  if (op === "getvar") {
    const variable = (attrs["var"] || attrs["value"] || "").trim();
    if (!variable) {
      throw new Error("getvar step is missing target variable.");
    }
    return { args: ["getvar", variable], softFail: true };
  }

  if (op === "reboot") {
    const target = (
      attrs["var"] ||
      attrs["value"] ||
      attrs["target"] ||
      ""
    ).trim();
    return {
      args: target
        ? ["reboot", ...target.split(/\s+/).filter(Boolean)]
        : ["reboot"],
    };
  }

  if (op === "reboot-bootloader") {
    return { args: ["reboot-bootloader"] };
  }

  if (op === "reboot-fastboot") {
    return { args: ["reboot", "fastboot"] };
  }

  if (op === "boot") {
    if (!fileName) {
      throw new Error("boot step is missing filename.");
    }
    const resolvedFilePath = await resolveStepFilePath(
      extractDir,
      fileName,
      fileIndex,
    );
    const fastbootPath = relative(extractDir, resolvedFilePath);
    return { args: ["boot", fastbootPath] };
  }

  if (op === "continue") {
    return { args: ["continue"] };
  }

  if (op === "set_active" || op === "set-active") {
    const slot = (attrs["slot"] || attrs["var"] || attrs["value"] || "").trim();
    if (!slot) {
      throw new Error("set_active step is missing slot value.");
    }
    return { args: ["set_active", slot] };
  }

  if (op === "update") {
    if (!fileName) {
      throw new Error("update step is missing filename.");
    }
    const resolvedFilePath = await resolveStepFilePath(
      extractDir,
      fileName,
      fileIndex,
    );
    const fastbootPath = relative(extractDir, resolvedFilePath);
    return { args: ["update", fastbootPath] };
  }

  if (
    op === "if" ||
    op === "ifnot" ||
    op === "endif" ||
    op === "assert" ||
    op === "check" ||
    op === "note" ||
    op === "sleep" ||
    op === "wait-for-device" ||
    op === "wait_for_device" ||
    op === "nop" ||
    op === "cmd" ||
    op === "run" ||
    op === "download" ||
    op === "delete"
  ) {
    return { args: null, skipReason: `skip non-fastboot operation: ${op}` };
  }

  return { args: null, skipReason: `skip unknown operation: ${op}` };
}

async function runCommandWithAbort(options: {
  command: string;
  args: string[];
  cwd: string;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
}) {
  const proc = Bun.spawn([options.command, ...options.args], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      LD_PRELOAD: "",
    },
  });
  options.onProcess(proc);

  const abortListener = () => {
    try {
      proc.kill();
    } catch {
      // Ignore kill race conditions.
    }
  };
  options.signal.addEventListener("abort", abortListener, { once: true });

  try {
    const [stdoutText, stderrText, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (options.signal.aborted) {
      const abortError = new Error("Operation aborted.");
      abortError.name = "AbortError";
      throw abortError;
    }

    if (exitCode !== 0) {
      const errorOutput = [stderrText.trim(), stdoutText.trim()]
        .filter(Boolean)
        .join("\n");
      throw new Error(
        errorOutput || `${options.command} exited with code ${exitCode}.`,
      );
    }

    return {
      stdoutText,
      stderrText,
    };
  } finally {
    options.signal.removeEventListener("abort", abortListener);
    options.onProcess(null);
  }
}

/**
 * Cancels active rescue operations.
 * If downloadId is provided, cancels only that specific operation.
 * If no downloadId is provided, cancels ALL active rescue operations (used during app updates).
 */
export function cancelActiveRescue(downloadId?: string) {
  if (downloadId) {
    const active = activeRescues.get(downloadId);
    if (!active) return false;

    active.canceled = true;
    active.controller.abort();
    try {
      active.activeProcess?.kill();
    } catch { /* ignore */ }
    return true;
  }

  console.log(`[RescueManager] Canceling ${activeRescues.size} active rescue(s)...`);
  for (const [id, rescue] of activeRescues.entries()) {
    try {
      rescue.canceled = true;
      rescue.controller.abort();
      rescue.activeProcess?.kill();
    } catch { /* ignore */ }
  }
  activeRescues.clear();
  return true;
}

export async function extractLocalFirmwarePackage(payload: {
  filePath: string;
  fileName: string;
  extractedDir?: string;
}): Promise<ExtractLocalFirmwareResponse> {
  try {
    const packagePath = payload.filePath;
    if (!packagePath?.trim()) {
      return {
        ok: false,
        filePath: payload.filePath,
        fileName: payload.fileName,
        error: "Missing local firmware package path.",
      };
    }

    if (!(await Bun.file(packagePath).exists())) {
      return {
        ok: false,
        filePath: payload.filePath,
        fileName: payload.fileName,
        error: `Local firmware package not found: ${packagePath}`,
      };
    }

    const extraction = await ensureExtractedFirmwarePackage({
      packagePath,
      extractedDir: payload.extractedDir,
    });

    return {
      ok: true,
      filePath: payload.filePath,
      fileName: payload.fileName,
      extractedDir: extraction.extractDir,
      reusedExtraction: extraction.reusedExtraction,
    };
  } catch (error) {
    return {
      ok: false,
      filePath: payload.filePath,
      fileName: payload.fileName,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function prepareCommandsFromXml(
  steps: XmlStep[],
  dataReset: "yes" | "no",
  workDir: string,
  fileIndex: Map<string, string[]>,
) {
  const commands: PreparedFastbootCommand[] = [];
  const warnings: string[] = [];

  for (const step of steps) {
    try {
      const built = await buildFastbootArgsForStep(
        step,
        dataReset,
        workDir,
        fileIndex,
      );
      if (!built.args) {
        if (built.skipReason) {
          warnings.push(built.skipReason);
        }
        continue;
      }

      const resolvedArgs = await maybeResolveCommandFileArgument(
        built.args,
        workDir,
        fileIndex,
      );
      commands.push({
        args: resolvedArgs,
        label: formatFastbootArgs(resolvedArgs),
        softFail: Boolean(built.softFail),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(message);
    }
  }

  return { commands, warnings };
}

function commandScriptPriority(
  filePath: string,
  dataReset: "yes" | "no",
  recipeHints?: RescueRecipeHints,
) {
  const lowerName = basename(filePath).toLowerCase();
  let score = 0;
  if (lowerName.includes("servicefile")) {
    score += dataReset === "no" ? 90 : 30;
  }
  if (lowerName.includes("flashfile")) {
    score += dataReset === "yes" ? 90 : 40;
  }
  if (lowerName.includes("flashall")) {
    score += 70;
  }
  if (lowerName.endsWith(".bat")) {
    score += 10;
  }
  if (lowerName.endsWith(".sh")) {
    score += 8;
  }
  if (recipeHints?.preferredFileNames.has(lowerName)) {
    score += 250;
  }
  return score;
}

async function extractFastbootCommandsFromScript(
  scriptText: string,
  dataReset: "yes" | "no",
  workDir: string,
  fileIndex: Map<string, string[]>,
) {
  const commands: PreparedFastbootCommand[] = [];
  const lines = scriptText.split(/\r?\n/);

  for (const originalLine of lines) {
    let line = originalLine.trim();
    if (!line) continue;
    if (
      line.startsWith("::") ||
      line.startsWith("#") ||
      /^rem\s/i.test(line) ||
      /^echo\s/i.test(line)
    ) {
      continue;
    }

    line = line.replace(/^@+/, "").trim();
    line = line.replace(/["']?%~dp0["']?/gi, "").trim();
    line = line.replace(/["']?%CD%["']?/gi, "").trim();
    if (!line) continue;

    const tokens = parseCommandTokens(line);
    if (tokens.length === 0) continue;

    const fastbootIndex = tokens.findIndex((token) =>
      /(?:^|[\\/])(?:m?fastboot(?:\.exe)?)$/i.test(token),
    );
    if (fastbootIndex < 0) {
      continue;
    }

    const args = tokens
      .slice(fastbootIndex + 1)
      .map((token) => token.replace(/\\+/g, "/"));
    if (args.length === 0) continue;

    if (shouldSkipForDataReset(args, dataReset)) {
      continue;
    }

    const resolvedArgs = await maybeResolveCommandFileArgument(
      args,
      workDir,
      fileIndex,
    );
    commands.push({
      args: resolvedArgs,
      label: formatFastbootArgs(resolvedArgs),
      softFail: (resolvedArgs[0] || "").toLowerCase() === "getvar",
    });
  }

  return commands;
}

async function pickScriptCommands(
  extractDir: string,
  allFiles: string[],
  dataReset: "yes" | "no",
  fileIndex: Map<string, string[]>,
  recipeHints?: RescueRecipeHints,
) {
  const candidates = allFiles.filter((filePath) => {
    const lowerName = basename(filePath).toLowerCase();
    if (!lowerName.endsWith(".bat") && !lowerName.endsWith(".sh")) {
      return false;
    }
    return (
      lowerName.includes("flash") ||
      lowerName.includes("service") ||
      lowerName.includes("rescue")
    );
  });

  let best:
    | {
      scriptPath: string;
      commands: PreparedFastbootCommand[];
      score: number;
    }
    | undefined;

  for (const candidate of candidates) {
    const scriptText = await Bun.file(candidate).text();
    const commands = await extractFastbootCommandsFromScript(
      scriptText,
      dataReset,
      extractDir,
      fileIndex,
    );
    if (commands.length === 0) {
      continue;
    }
    const score =
      commandScriptPriority(candidate, dataReset, recipeHints) * 1000 +
      commands.length;
    if (!best || score > best.score) {
      best = { scriptPath: candidate, commands, score };
    }
  }

  return best;
}

async function hasFastbootDevice(
  signal: AbortSignal,
  cwd: string,
  setProcess: (process: Bun.Subprocess | null) => void,
) {
  try {
    const result = await runCommandWithAbort({
      command: "fastboot",
      args: ["devices"],
      cwd,
      signal,
      onProcess: setProcess,
    });
    const output = `${result.stdoutText}\n${result.stderrText}`;
    return /\S+\s+fastboot/i.test(output);
  } catch {
    return false;
  }
}

async function tryAdbRebootBootloader(
  signal: AbortSignal,
  cwd: string,
  setProcess: (process: Bun.Subprocess | null) => void,
) {
  try {
    const state = await runCommandWithAbort({
      command: "adb",
      args: ["get-state"],
      cwd,
      signal,
      onProcess: setProcess,
    });
    const output = `${state.stdoutText}\n${state.stderrText}`.toLowerCase();
    if (!output.includes("device")) {
      return false;
    }

    await runCommandWithAbort({
      command: "adb",
      args: ["reboot", "bootloader"],
      cwd,
      signal,
      onProcess: setProcess,
    });
    return true;
  } catch {
    return false;
  }
}

export async function rescueLiteFirmwareWithProgress(
  payload: {
    downloadId: string;
    romUrl: string;
    romName: string;
    publishDate?: string;
    selectedParameters?: Record<string, string>;
    recipeUrl?: string;
    dataReset: "yes" | "no";
    dryRun?: boolean;
    localPackagePath?: string;
    localExtractedDir?: string;
    romMatchIdentifier?: string;
  },
  onProgress: RescueProgressEmitter,
): Promise<RescueLiteFirmwareResponse> {
  const { downloadId, romUrl, romName, dataReset } = payload;
  const isDryRun = Boolean(payload.dryRun);
  const rescueController = new AbortController();
  activeRescues.set(downloadId, {
    controller: rescueController,
    canceled: false,
    activeProcess: null,
  });

  let savePath = "";
  let bytesDownloaded = 0;
  let totalBytes = 0;
  let workDir = "";

  const emit = (
    progress: Partial<DownloadProgressMessage> & {
      status: DownloadProgressMessage["status"];
    },
  ) => {
    onProgress({
      downloadId,
      romUrl,
      romName,
      dryRun: isDryRun,
      downloadedBytes: bytesDownloaded,
      totalBytes: totalBytes || undefined,
      speedBytesPerSecond: 0,
      ...progress,
    });
  };

  try {
    const downloadDirectory = getDownloadDirectory();
    await mkdir(downloadDirectory, { recursive: true });
    let reusedPackage = false;
    let reusedExtraction = false;

    if (payload.localPackagePath) {
      if (!(await Bun.file(payload.localPackagePath).exists())) {
        throw new Error(
          `Local firmware package not found: ${payload.localPackagePath}`,
        );
      }
      savePath = payload.localPackagePath;
      const packageStats = await stat(savePath);
      bytesDownloaded = packageStats.size;
      totalBytes = packageStats.size;
      reusedPackage = true;

      try {
        await writeFirmwareMetadata(savePath, {
          source: "rescue-lite",
          romUrl,
          romName,
          publishDate: payload.publishDate,
          recipeUrl: payload.recipeUrl,
          romMatchIdentifier:
            payload.romMatchIdentifier ||
            payload.selectedParameters?.romMatchIdentifier ||
            payload.selectedParameters?.romMatchId,
          selectedParameters: payload.selectedParameters,
        });
      } catch {
        // Best effort
      }

      emit({
        status: "starting",
        savePath,
        phase: "download",
        stepLabel: "Using selected local firmware package.",
      });
    } else {
      const reusablePackagePath = await findReusableFirmwarePackagePath(
        downloadDirectory,
        romUrl,
        romName,
      );
      if (reusablePackagePath) {
        savePath = reusablePackagePath;
        const packageStats = await stat(savePath);
        bytesDownloaded = packageStats.size;
        totalBytes = packageStats.size;
        reusedPackage = true;

        try {
          await writeFirmwareMetadata(savePath, {
            source: "rescue-lite",
            romUrl,
            romName,
            publishDate: payload.publishDate,
            recipeUrl: payload.recipeUrl,
            romMatchIdentifier:
              payload.romMatchIdentifier ||
              payload.selectedParameters?.romMatchIdentifier ||
              payload.selectedParameters?.romMatchId,
            selectedParameters: payload.selectedParameters,
          });
        } catch {
          // Best effort
        }

        emit({
          status: "starting",
          savePath,
          phase: "download",
          stepLabel: "Reusing existing firmware package from Downloads.",
        });
      } else {
        const downloadResult = await downloadFirmwareWithProgress(
          {
            downloadId,
            romUrl,
            romName,
            publishDate: payload.publishDate,
            romMatchIdentifier: payload.romMatchIdentifier,
            recipeUrl: payload.recipeUrl,
            selectedParameters: payload.selectedParameters,
          },
          (progress) => {
            bytesDownloaded = progress.downloadedBytes;
            totalBytes = progress.totalBytes ?? progress.downloadedBytes;
            savePath = progress.savePath || savePath;

            if (progress.status === "completed") {
              emit({
                status: "preparing",
                savePath: progress.savePath,
                phase: "prepare",
                stepLabel: "Download finished. Preparing firmware package...",
              });
              return;
            }

            emit({
              ...progress,
              phase: "download",
            });
          },
        );

        if (!downloadResult.ok) {
          return {
            ok: false,
            downloadId,
            error: downloadResult.error || "Rescue Lite download failed.",
          };
        }

        if (!downloadResult.savePath) {
          throw new Error("Downloaded package path is missing.");
        }

        savePath = downloadResult.savePath;
        bytesDownloaded = downloadResult.bytesDownloaded ?? bytesDownloaded;
        totalBytes = downloadResult.totalBytes ?? totalBytes;
      }
    }

    if (
      rescueController.signal.aborted ||
      activeRescues.get(downloadId)?.canceled
    ) {
      const abortError = new Error("Rescue Lite canceled by user.");
      abortError.name = "AbortError";
      throw abortError;
    }

    // Package is ready. We can now proceed to extraction or command processing.
    const linkedExtractDir =
      payload.localExtractedDir?.trim() ||
      getExtractDirForPackagePath(savePath);
    workDir = linkedExtractDir;

    if (hasUsableExtractedRescueScripts(workDir)) {
      reusedExtraction = true;
      emit({
        status: "preparing",
        savePath,
        phase: "prepare",
        stepLabel: "Reusing existing extracted firmware directory.",
      });
    } else {
      emit({
        status: "preparing",
        savePath,
        phase: "prepare",
        stepLabel: "Extracting firmware package...",
      });
    }

    const extraction = await ensureExtractedFirmwarePackage({
      packagePath: savePath,
      extractedDir: linkedExtractDir,
      signal: rescueController.signal,
      onProcess: (process) => {
        const active = activeRescues.get(downloadId);
        if (active) {
          active.activeProcess = process;
        }
      },
    });
    workDir = extraction.extractDir;
    reusedExtraction = reusedExtraction || extraction.reusedExtraction;

    let recipeHints: RescueRecipeHints | undefined;
    try {
      recipeHints = await resolveRescueRecipeHints(payload, dataReset);
      if (recipeHints) {
        emit({
          status: "preparing",
          savePath,
          phase: "prepare",
          stepLabel: `Recipe hints loaded (${recipeHints.referenceCount} references) from ${recipeHints.source}.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit({
        status: "preparing",
        savePath,
        phase: "prepare",
        stepLabel: `Recipe hints unavailable (${message}). Continuing with local script detection.`,
      });
    }

    const extractedFiles = await collectFilesRecursive(workDir);
    const fileIndex = createFileIndex(extractedFiles);
    const { scriptPath, steps } = await pickFlashScript(
      workDir,
      dataReset,
      recipeHints,
    );
    const xmlPrepared = await prepareCommandsFromXml(
      steps,
      dataReset,
      workDir,
      fileIndex,
    );
    const scriptPrepared = await pickScriptCommands(
      workDir,
      extractedFiles,
      dataReset,
      fileIndex,
      recipeHints,
    );

    let commands: PreparedFastbootCommand[] = xmlPrepared.commands;
    let commandSource = `xml:${basename(scriptPath)}`;
    if (
      recipeHints?.preferredFileNames.has(basename(scriptPath).toLowerCase())
    ) {
      commandSource += " (recipe-guided)";
    }
    if (commands.length === 0 && scriptPrepared) {
      commands = scriptPrepared.commands;
      commandSource = `script:${basename(scriptPrepared.scriptPath)}`;
      if (
        recipeHints?.preferredFileNames.has(
          basename(scriptPrepared.scriptPath).toLowerCase(),
        )
      ) {
        commandSource += " (recipe-guided)";
      }
    } else if (
      commands.length > 0 &&
      scriptPrepared &&
      scriptPrepared.commands.length > commands.length + 5
    ) {
      commands = scriptPrepared.commands;
      commandSource = `script:${basename(scriptPrepared.scriptPath)}`;
      if (
        recipeHints?.preferredFileNames.has(
          basename(scriptPrepared.scriptPath).toLowerCase(),
        )
      ) {
        commandSource += " (recipe-guided)";
      }
    }

    emit({
      status: "preparing",
      savePath,
      phase: "prepare",
      commandSource,
      stepLabel: `Using rescue command source: ${commandSource}`,
    });

    if (commands.length === 0) {
      throw new Error(
        "No executable fastboot commands found in XML/script resources for this firmware package.",
      );
    }

    const commandPlan = commands.map((command) => command.label);
    if (isDryRun) {
      console.log(
        `[RescueLite:dry-run] ${downloadId} source=${commandSource} commands=${commandPlan.length}`,
      );
      for (const command of commandPlan) {
        console.log(`[RescueLite:dry-run] ${command}`);
      }

      for (let index = 0; index < commands.length; index += 1) {
        const command = commands[index] as PreparedFastbootCommand;
        emit({
          status: "flashing",
          savePath,
          phase: "flash",
          commandSource,
          stepIndex: index + 1,
          stepTotal: commands.length,
          stepLabel: command.label,
        });
      }

      emit({
        status: "completed",
        savePath,
        phase: "flash",
        commandSource,
        stepIndex: commands.length,
        stepTotal: commands.length,
        stepLabel: "Dry run completed. No commands executed.",
      });

      return {
        ok: true,
        downloadId,
        savePath,
        fileName: basename(savePath),
        bytesDownloaded,
        totalBytes: totalBytes || bytesDownloaded,
        workDir,
        dryRun: true,
        reusedPackage,
        reusedExtraction,
        commandSource,
        commandPlan,
      };
    }

    const setActiveProcess = (process: Bun.Subprocess | null) => {
      const active = activeRescues.get(downloadId);
      if (active) {
        active.activeProcess = process;
      }
    };

    let fastbootReady = await hasFastbootDevice(
      rescueController.signal,
      workDir,
      setActiveProcess,
    );
    if (!fastbootReady) {
      emit({
        status: "preparing",
        savePath,
        phase: "prepare",
        stepLabel: "No fastboot device found. Trying adb reboot bootloader...",
      });
      await tryAdbRebootBootloader(
        rescueController.signal,
        workDir,
        setActiveProcess,
      );
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (rescueController.signal.aborted) {
          const abortError = new Error("Operation aborted.");
          abortError.name = "AbortError";
          throw abortError;
        }
        fastbootReady = await hasFastbootDevice(
          rescueController.signal,
          workDir,
          setActiveProcess,
        );
        if (fastbootReady) {
          break;
        }
        await wait(1000);
      }
    }

    if (!fastbootReady) {
      throw new Error(
        "No fastboot device detected. Put the phone in fastboot mode and retry.",
      );
    }

    if (xmlPrepared.warnings.length > 0) {
      emit({
        status: "preparing",
        savePath,
        phase: "prepare",
        stepLabel: `XML parsing notes: ${xmlPrepared.warnings.length} step(s) skipped/adjusted.`,
      });
    }

    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index] as PreparedFastbootCommand;
      emit({
        status: "flashing",
        savePath,
        phase: "flash",
        commandSource,
        stepIndex: index + 1,
        stepTotal: commands.length,
        stepLabel: command.label,
      });

      try {
        await runCommandWithAbort({
          command: "fastboot",
          args: command.args,
          cwd: workDir,
          signal: rescueController.signal,
          onProcess: setActiveProcess,
        });
      } catch (error) {
        if (command.softFail && !isAbortError(error)) {
          continue;
        }
        throw error;
      }
    }

    emit({
      status: "completed",
      savePath,
      phase: "flash",
      commandSource,
      stepIndex: commands.length,
      stepTotal: commands.length,
      stepLabel: "Rescue Lite completed.",
    });

    return {
      ok: true,
      downloadId,
      savePath,
      fileName: basename(savePath),
      bytesDownloaded,
      totalBytes: totalBytes || bytesDownloaded,
      workDir,
      dryRun: false,
      reusedPackage,
      reusedExtraction,
      commandSource,
      commandPlan,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isAbortError(error) || activeRescues.get(downloadId)?.canceled) {
      emit({
        status: "canceled",
        savePath: savePath || undefined,
        phase: "flash",
        error: "",
      });
      return {
        ok: false,
        downloadId,
        error: "Rescue Lite canceled by user.",
      };
    }

    emit({
      status: "failed",
      savePath: savePath || undefined,
      phase: "flash",
      error: message,
    });
    return {
      ok: false,
      downloadId,
      error: message,
    };
  } finally {
    activeRescues.delete(downloadId);
  }
}
