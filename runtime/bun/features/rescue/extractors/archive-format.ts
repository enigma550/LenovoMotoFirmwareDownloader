import { basename } from 'node:path';

export const SUPPORTED_FIRMWARE_ARCHIVE_EXTENSIONS = [
  '.zip',
  '.7z',
  '.rar',
  '.tar',
  '.tar.gz',
  '.tgz',
  '.tar.bz2',
  '.tbz',
  '.tbz2',
  '.tar.xz',
  '.txz',
  '.gz',
  '.bz2',
  '.xz',
  '.cab',
] as const;

const SUPPORTED_FIRMWARE_ARCHIVE_EXTENSIONS_SORTED = [
  ...SUPPORTED_FIRMWARE_ARCHIVE_EXTENSIONS,
].sort((left, right) => right.length - left.length);

const TAR_FAMILY_ARCHIVE_EXTENSIONS = new Set<string>([
  '.tar',
  '.tar.gz',
  '.tgz',
  '.tar.bz2',
  '.tbz',
  '.tbz2',
  '.tar.xz',
  '.txz',
]);

export function getFirmwareArchiveExtension(fileName: string) {
  const normalized = basename(fileName || '').toLowerCase();
  if (!normalized) return '';

  for (const extension of SUPPORTED_FIRMWARE_ARCHIVE_EXTENSIONS_SORTED) {
    if (normalized.endsWith(extension)) {
      return extension;
    }
  }

  return '';
}

export function stripFirmwareArchiveExtension(fileName: string) {
  const extension = getFirmwareArchiveExtension(fileName);
  if (!extension) return fileName;
  return fileName.slice(0, -extension.length);
}

export function isSupportedFirmwareArchive(fileName: string) {
  return Boolean(getFirmwareArchiveExtension(fileName));
}

export function isTarFamilyArchiveExtension(extension: string) {
  return TAR_FAMILY_ARCHIVE_EXTENSIONS.has((extension || '').toLowerCase());
}
