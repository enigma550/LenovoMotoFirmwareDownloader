import { basename, join, normalize } from 'node:path';
import { stripFirmwareArchiveExtension } from './features/rescue/extractors/archive-format.ts';

export function getDownloadDirectory() {
  const homeDirectory =
    Bun.env.HOME || Bun.env.USERPROFILE || process.env.HOME || process.env.USERPROFILE || '.';
  return join(homeDirectory, 'Downloads', 'LenovoMotoFirmwareDownloader');
}

export function getRescueDirectory() {
  return join(getDownloadDirectory(), '.rescue-lite');
}

export function getRescueExtractDirectoryRoot() {
  return join(getRescueDirectory(), 'extracted');
}

export function sanitizeFileName(fileName: string, fallback = 'firmware.zip') {
  const sanitized = Array.from(fileName, (character) => {
    const code = character.charCodeAt(0);
    if (
      code <= 0x1f ||
      character === '<' ||
      character === '>' ||
      character === ':' ||
      character === '"' ||
      character === '/' ||
      character === '\\' ||
      character === '|' ||
      character === '?' ||
      character === '*'
    ) {
      return '_';
    }
    return character;
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized || fallback;
}

export function sanitizeDirectoryName(name: string) {
  return sanitizeFileName(name, 'firmware').replace(/\.+$/g, '').slice(0, 160) || 'firmware';
}

export function getExtractDirForPackagePath(packagePath: string) {
  const base = basename(packagePath);
  const withoutArchiveExtension = stripFirmwareArchiveExtension(base) || base;
  return join(getRescueExtractDirectoryRoot(), sanitizeDirectoryName(withoutArchiveExtension));
}

export function normalizePathForLookup(value: string) {
  return normalize(value).replace(/\\/g, '/');
}

export function normalizeRemoteUrl(value: string | undefined | null) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}
