export type ContentQueryRow = Record<string, string>;

export function normalizeContentQueryValue(value: string | undefined) {
  if (!value) return '';
  // Collapse runs of spaces/tabs on each line, but preserve newlines
  return value
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .trim();
}

export function readContentQueryFirstValue(row: ContentQueryRow, keys: string[]) {
  for (const key of keys) {
    const value = normalizeContentQueryValue(row[key]);
    if (value) {
      return value;
    }
  }
  return '';
}

/**
 * Join continuation lines with the previous Row line.
 * ADB content query output can have multi-line values (e.g. SMS body with newlines).
 * Lines not starting with "Row: N" belong to the previous row.
 */
function joinContinuationLines(output: string): string[] {
  const rawLines = output.split(/\r?\n/);
  const joined: string[] = [];

  for (const rawLine of rawLines) {
    if (/^Row:\s*\d+/i.test(rawLine.trimStart())) {
      joined.push(rawLine);
    } else if (joined.length > 0) {
      // Continuation of the previous row — append with newline preserved
      joined[joined.length - 1] += `\n${rawLine}`;
    }
  }
  return joined;
}

export function parseContentQueryRows(output: string) {
  const rows: ContentQueryRow[] = [];

  for (const rawLine of joinContinuationLines(output)) {
    const line = rawLine.trim();
    if (!line || /^No result found/i.test(line)) {
      continue;
    }

    const payload = line.replace(/^Row:\s*\d+\s*/i, '').trim();
    if (!payload) {
      continue;
    }

    const keyMatches = Array.from(payload.matchAll(/([a-zA-Z0-9_.-]+)=/g));
    if (keyMatches.length === 0) {
      continue;
    }

    const row: ContentQueryRow = {};
    for (const [index, match] of keyMatches.entries()) {
      const key = match[1]?.trim();
      const startIndex = (match.index ?? 0) + match[0].length;
      const nextMatch = keyMatches[index + 1];
      const endIndex = nextMatch?.index ?? payload.length;
      const rawValue = payload.slice(startIndex, endIndex);
      const value = normalizeContentQueryValue(rawValue.replace(/^,\s*/, '').replace(/,\s*$/, ''));
      if (!key) {
        continue;
      }
      row[key] = value;
    }

    if (Object.keys(row).length > 0) {
      rows.push(row);
    }
  }

  return rows;
}
