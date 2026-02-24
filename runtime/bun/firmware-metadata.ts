import { normalizeRemoteUrl } from "./firmware-package-utils.ts";

export type FirmwarePackageMetadata = {
  version: 1;
  savedAt: number;
  source?: string;
  romUrl?: string;
  romName?: string;
  publishDate?: string;
  romMatchIdentifier?: string;
  recipeUrl?: string;
  selectedParameters?: Record<string, string>;
};

function toRecord(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function sanitizeParameters(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const cleaned: Record<string, string> = {};
  for (const [key, entryValue] of Object.entries(raw)) {
    if (!key || typeof entryValue !== "string") continue;
    const trimmed = entryValue.trim();
    if (!trimmed) continue;
    cleaned[key] = trimmed;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function sanitizeText(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function getFirmwareMetadataPath(packagePath: string) {
  return `${packagePath}.lmfd.json`;
}

export async function readFirmwareMetadata(
  packagePath: string,
): Promise<FirmwarePackageMetadata | null> {
  const metadataPath = getFirmwareMetadataPath(packagePath);
  const metadataFile = Bun.file(metadataPath);
  if (!(await metadataFile.exists())) return null;
  try {
    const raw = await metadataFile.text();
    const parsed = toRecord(JSON.parse(raw));
    if (!parsed) return null;
    const selectedParameters = sanitizeParameters(parsed.selectedParameters);
    return {
      version: 1,
      savedAt:
        typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt)
          ? parsed.savedAt
          : Date.now(),
      source: typeof parsed.source === "string" ? parsed.source : undefined,
      romUrl: typeof parsed.romUrl === "string" ? parsed.romUrl : undefined,
      romName: typeof parsed.romName === "string" ? parsed.romName : undefined,
      publishDate:
        typeof parsed.publishDate === "string"
          ? sanitizeText(parsed.publishDate)
          : undefined,
      romMatchIdentifier:
        typeof parsed.romMatchIdentifier === "string"
          ? parsed.romMatchIdentifier
          : undefined,
      recipeUrl:
        typeof parsed.recipeUrl === "string"
          ? normalizeRemoteUrl(parsed.recipeUrl)
          : undefined,
      selectedParameters,
    };
  } catch {
    return null;
  }
}

export async function writeFirmwareMetadata(
  packagePath: string,
  patch: {
    source?: string;
    romUrl?: string;
    romName?: string;
    publishDate?: string;
    romMatchIdentifier?: string;
    recipeUrl?: string;
    selectedParameters?: Record<string, string>;
  },
) {
  const existing = await readFirmwareMetadata(packagePath);
  const merged: FirmwarePackageMetadata = {
    version: 1,
    savedAt: Date.now(),
    source: sanitizeText(patch.source) || existing?.source,
    romUrl: sanitizeText(patch.romUrl) || existing?.romUrl,
    romName: sanitizeText(patch.romName) || existing?.romName,
    publishDate: sanitizeText(patch.publishDate) || existing?.publishDate,
    romMatchIdentifier:
      patch.romMatchIdentifier || existing?.romMatchIdentifier,
    recipeUrl: normalizeRemoteUrl(patch.recipeUrl || existing?.recipeUrl),
    selectedParameters:
      sanitizeParameters(patch.selectedParameters) ||
      existing?.selectedParameters,
  };
  await Bun.write(
    getFirmwareMetadataPath(packagePath),
    JSON.stringify(merged, null, 2),
  );
}
