import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';

const WINDOWS_RESERVED_STEMS = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

const SAFE_EXTERNAL_URL_PROTOCOLS = new Set(['http:', 'https:']);

export class UnsafePathError extends Error {
  override readonly name = 'UnsafePathError';
  readonly code = 'UNSAFE_PATH';
}

function normalizeForCompare(value: string): string {
  const resolved = resolve(value);
  const normalized = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  return normalized.length > 1 && normalized.endsWith(sep) ? normalized.slice(0, -1) : normalized;
}

function canonicalizePath(pathValue: string): string {
  const resolved = resolve(pathValue);
  let current = resolved;
  const missingSegments: string[] = [];

  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    missingSegments.unshift(basename(current));
    current = parent;
  }

  let realBase: string;
  try {
    realBase = realpathSync(current);
  } catch {
    realBase = current;
  }

  return missingSegments.length > 0 ? resolve(realBase, ...missingSegments) : realBase;
}

export function isPathInsideAllowedRoots(candidatePath: string, allowedRoots: string[]): boolean {
  if (!candidatePath.trim() || allowedRoots.length === 0) {
    return false;
  }

  const candidate = normalizeForCompare(canonicalizePath(candidatePath));
  return allowedRoots.some((root) => {
    const normalizedRoot = normalizeForCompare(canonicalizePath(root));
    return candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}${sep}`);
  });
}

/**
 * Validates that a renderer-provided path resolves inside one of the allowed
 * roots (symlink-aware) and returns its resolved form. Throws UnsafePathError
 * otherwise.
 */
export function assertPathInsideAllowedRoots(
  candidatePath: string,
  allowedRoots: string[],
  description = 'path',
): string {
  if (typeof candidatePath !== 'string' || !candidatePath.trim()) {
    throw new UnsafePathError(`Missing ${description}.`);
  }
  if (candidatePath.includes('\0')) {
    throw new UnsafePathError(`Invalid ${description}.`);
  }
  if (!isAbsolute(candidatePath)) {
    throw new UnsafePathError(`Refusing relative ${description}.`);
  }
  if (!isPathInsideAllowedRoots(candidatePath, allowedRoots)) {
    throw new UnsafePathError(`Refusing ${description} outside the allowed directories.`);
  }
  return resolve(candidatePath);
}

/**
 * Snapshot ids are folder names inside the backup root. Rejects any id that
 * could escape it (separators, dot segments, null bytes).
 */
export function assertSafeSnapshotId(snapshotId: string): string {
  const trimmed = typeof snapshotId === 'string' ? snapshotId.trim() : '';
  if (!trimmed) {
    throw new UnsafePathError('Missing snapshot id.');
  }
  if (
    trimmed.includes('\0') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed === '.' ||
    trimmed === '..'
  ) {
    throw new UnsafePathError('Invalid snapshot id.');
  }
  return trimmed;
}

/** Only http(s) URLs may be handed to the OS URL opener. */
export function assertSafeExternalUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(typeof rawUrl === 'string' ? rawUrl.trim() : '');
  } catch {
    throw new UnsafePathError('Invalid URL.');
  }
  if (!SAFE_EXTERNAL_URL_PROTOCOLS.has(parsed.protocol)) {
    throw new UnsafePathError(`Refusing to open URL with protocol "${parsed.protocol}".`);
  }
  return parsed.toString();
}

/**
 * File-name sanitizer hardened against dot-segment escapes (a name like ".."
 * would otherwise escape its parent directory) and Windows reserved device
 * names.
 */
export function hardenSanitizedFileName(sanitized: string, fallback: string): string {
  const withoutTrailingDots = sanitized.replace(/[. ]+$/g, '');
  const pureDotRun = /^\.+$/.test(withoutTrailingDots);
  const stem = (withoutTrailingDots.split('.')[0] ?? '').toLowerCase();
  const finalName = pureDotRun
    ? ''
    : WINDOWS_RESERVED_STEMS.has(stem)
      ? `_${withoutTrailingDots}`
      : withoutTrailingDots;
  return finalName || fallback;
}
