/**
 * Fastboot/rescue command token parsing and data-reset safety decisions.
 * Extracted from firmware-package-utils for focused testability — these
 * decisions gate whether user data can be wiped during a rescue.
 */

export function formatFastbootArgs(args: string[]) {
  return ['fastboot', ...args].join(' ');
}

export function isWipeSensitivePartition(partition: string) {
  const lowerPartition = partition.toLowerCase();
  return (
    lowerPartition === 'userdata' || lowerPartition === 'cache' || lowerPartition === 'metadata'
  );
}

export function parseCommandTokens(rawLine: string) {
  const tokens: string[] = [];
  let current = '';
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
        current = '';
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

const WIPE_FLAG_TOKENS = new Set(['-w', '--wipe']);

/**
 * Decides whether a rescue command must be skipped when the user chose to
 * preserve data (`dataReset: 'no'`).
 */
export function shouldSkipForDataReset(args: string[], dataReset: 'yes' | 'no') {
  if (dataReset !== 'no') {
    return false;
  }

  // `fastboot -w` / `fastboot --wipe` wipes userdata + cache on its own.
  const firstToken = (args[0] || '').toLowerCase();
  if (args.length >= 1 && WIPE_FLAG_TOKENS.has(firstToken)) {
    return true;
  }

  if (args.length < 2) {
    return false;
  }
  const command = firstToken;
  const partition = (args[1] || '').toLowerCase();
  if (command === 'erase' || command === 'format') {
    return isWipeSensitivePartition(partition);
  }
  if (command === 'flash' && partition) {
    return isWipeSensitivePartition(partition);
  }
  return false;
}
