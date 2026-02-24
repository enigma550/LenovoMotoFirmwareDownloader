import type { FirmwareVariant } from "../../shared/types/index.ts";

export function normalizeRemoteUrl(value: string) {
  return value.startsWith("http") ? value : `https://${value}`;
}

function toRecord(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function createFirmwareVariantFromResourceItem(
  item: unknown,
  selectedParameters: Record<string, string>,
): FirmwareVariant | null {
  const record = toRecord(item);
  if (!record) return null;

  const romResource = toRecord(record.romResource);
  const uri = typeof romResource?.uri === "string" ? romResource.uri.trim() : "";
  if (!uri) return null;

  const flashFlow =
    typeof record.flashFlow === "string" ? record.flashFlow.trim() : "";

  return {
    romName: typeof romResource?.name === "string" ? romResource.name : "unknown",
    romUrl: normalizeRemoteUrl(uri),
    romMatchIdentifier:
      typeof record.romMatchId === "string" ? record.romMatchId : "",
    recipeUrl: flashFlow ? normalizeRemoteUrl(flashFlow) : undefined,
    publishDate:
      typeof romResource?.publishDate === "string"
        ? romResource.publishDate
        : "",
    selectedParameters: { ...selectedParameters },
  };
}
