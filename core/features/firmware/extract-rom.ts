import { normalizeRemoteUrl } from './resource-variant.ts';

export function extractRomUrl(content: unknown) {
  if (!Array.isArray(content)) return null;

  for (const item of content) {
    if (
      item &&
      typeof item === 'object' &&
      'romResource' in item &&
      item.romResource &&
      typeof item.romResource === 'object' &&
      'uri' in item.romResource &&
      typeof item.romResource.uri === 'string'
    ) {
      const uri = item.romResource.uri;
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

export function extractRecipeUrl(content: unknown) {
  if (!Array.isArray(content)) return '';

  for (const item of content) {
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const direct = ['flashFlow', 'recipe', 'recipeResource']
        .map((key) => record[key])
        .find((value): value is string => typeof value === 'string');
      if (direct?.trim()) {
        return normalizeRemoteUrl(direct.trim());
      }
    }

    const itemString = JSON.stringify(item);
    const match = itemString.match(/"(?:flashFlow|recipe(?:Resource)?)"\s*:\s*"([^"]+)"/i);
    if (match?.[1]?.trim()) {
      return normalizeRemoteUrl(match[1].trim());
    }
  }

  return '';
}

export function extractRomMatchIdentifier(content: unknown) {
  if (!Array.isArray(content)) return '';

  for (const item of content) {
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      if (typeof record.romMatchId === 'string' && record.romMatchId.trim()) {
        return record.romMatchId.trim();
      }
    }

    const itemString = JSON.stringify(item);
    const match = itemString.match(/"romMatchId"\s*:\s*"([^"]+)"/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return '';
}

export function extractPublishDate(content: unknown) {
  if (!Array.isArray(content)) return '';

  for (const item of content) {
    if (
      item &&
      typeof item === 'object' &&
      'romResource' in item &&
      item.romResource &&
      typeof item.romResource === 'object' &&
      'publishDate' in item.romResource &&
      typeof item.romResource.publishDate === 'string'
    ) {
      return item.romResource.publishDate.trim();
    }

    const itemString = JSON.stringify(item);
    const match = itemString.match(/"publishDate"\s*:\s*"([^"]+)"/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return '';
}
