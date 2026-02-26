import { normalizeRemoteUrl } from './resource-variant.ts';

type ResourceItemValue = object | string | number | boolean | null;
type ResourceRecord = Record<string, ResourceItemValue>;

function toResourceRecord(value: object | null | undefined): ResourceRecord | null {
  if (!value || Array.isArray(value)) return null;
  return value as ResourceRecord;
}

export function extractRomUrl<T>(content: T) {
  if (!Array.isArray(content)) return null;

  for (const item of content) {
    const record =
      item && typeof item === 'object' && !Array.isArray(item) ? toResourceRecord(item) : null;
    const romResource =
      record?.romResource && typeof record.romResource === 'object'
        ? toResourceRecord(record.romResource)
        : null;
    if (typeof romResource?.uri === 'string') {
      const uri = romResource.uri;
      return normalizeRemoteUrl(uri);
    }

    const itemString = JSON.stringify(item);
    const match = itemString.match(/(?:https?:\/\/)?download\.lenovo\.com\/[^"'\s<>]+?\.xml\.zip/i);

    if (match?.[0]) {
      const uri = match[0];
      return normalizeRemoteUrl(uri);
    }
  }

  return null;
}

export function extractRecipeUrl<T>(content: T) {
  if (!Array.isArray(content)) return '';

  for (const item of content) {
    const record =
      item && typeof item === 'object' && !Array.isArray(item) ? toResourceRecord(item) : null;
    const direct = ['flashFlow', 'recipe', 'recipeResource']
      .map((key) => record?.[key])
      .find((value): value is string => typeof value === 'string');
    if (direct?.trim()) {
      return normalizeRemoteUrl(direct.trim());
    }

    const itemString = JSON.stringify(item);
    const match = itemString.match(/"(?:flashFlow|recipe(?:Resource)?)"\s*:\s*"([^"]+)"/i);
    if (match?.[1]?.trim()) {
      return normalizeRemoteUrl(match[1].trim());
    }
  }

  return '';
}

export function extractRomMatchIdentifier<T>(content: T) {
  if (!Array.isArray(content)) return '';

  for (const item of content) {
    const record =
      item && typeof item === 'object' && !Array.isArray(item) ? toResourceRecord(item) : null;
    if (typeof record?.romMatchId === 'string' && record.romMatchId.trim()) {
      return record.romMatchId.trim();
    }

    const itemString = JSON.stringify(item);
    const match = itemString.match(/"romMatchId"\s*:\s*"([^"]+)"/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return '';
}

export function extractPublishDate<T>(content: T) {
  if (!Array.isArray(content)) return '';

  for (const item of content) {
    const record =
      item && typeof item === 'object' && !Array.isArray(item) ? toResourceRecord(item) : null;
    const romResource =
      record?.romResource && typeof record.romResource === 'object'
        ? toResourceRecord(record.romResource)
        : null;
    if (typeof romResource?.publishDate === 'string') {
      return romResource.publishDate.trim();
    }

    const itemString = JSON.stringify(item);
    const match = itemString.match(/"publishDate"\s*:\s*"([^"]+)"/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return '';
}
