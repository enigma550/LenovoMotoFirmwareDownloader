/**
 * Shared constants, types, and utility functions used by both
 * scanners.ts and parsers.ts.
 */

import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import type { BackupRestoreMediaEntry } from '../../../../shared/desktop-rpc';

// --- Constants ---

export const MAX_APPS = 48;
export const MAX_MEDIA = 84;
export const MAX_CONTACTS = 240;
export const MAX_MESSAGES = 5_000;
export const MAX_FILES = 180;

const MAX_IMAGE_PREVIEW_BYTES = 220 * 1024;
const MAX_APP_ICON_PREVIEW_BYTES = 2 * 1024 * 1024;

export const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.svg']);
const videoExtensions = new Set(['.mp4', '.mkv', '.mov', '.webm', '.avi']);
const audioExtensions = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg']);
const documentExtensions = new Set(['.pdf', '.txt', '.csv', '.json', '.xml', '.zip', '.7z']);

// --- Types ---

export type SnapshotScanContext = {
  snapshotPath: string;
  relativeSnapshotPath: string;
};

// --- Utility functions ---

export function readStringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeMessagePreview(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 280);
}

export function classifyMediaByExtension(fileName: string): BackupRestoreMediaEntry['mediaType'] {
  const lowerExtension = extname(fileName).toLowerCase();
  if (imageExtensions.has(lowerExtension)) {
    return 'image';
  }
  if (videoExtensions.has(lowerExtension)) {
    return 'video';
  }
  if (audioExtensions.has(lowerExtension)) {
    return 'audio';
  }
  if (documentExtensions.has(lowerExtension)) {
    return 'document';
  }
  return 'other';
}

function mimeTypeForImageExtension(filePath: string) {
  const lowerExtension = extname(filePath).toLowerCase();
  if (lowerExtension === '.jpg' || lowerExtension === '.jpeg') {
    return 'image/jpeg';
  }
  if (lowerExtension === '.png') {
    return 'image/png';
  }
  if (lowerExtension === '.webp') {
    return 'image/webp';
  }
  if (lowerExtension === '.bmp') {
    return 'image/bmp';
  }
  if (lowerExtension === '.gif') {
    return 'image/gif';
  }
  if (lowerExtension === '.svg') {
    return 'image/svg+xml';
  }
  return '';
}

export async function imageToDataUrl(filePath: string, maxBytes = MAX_IMAGE_PREVIEW_BYTES) {
  const mimeType = mimeTypeForImageExtension(filePath);
  if (!mimeType) {
    return undefined;
  }

  try {
    const info = await stat(filePath);
    if (info.size <= 0 || info.size > maxBytes) {
      return undefined;
    }
    const imageBuffer = await readFile(filePath);
    return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
  } catch {
    return undefined;
  }
}

export async function appIconToDataUrl(filePath: string) {
  return imageToDataUrl(filePath, MAX_APP_ICON_PREVIEW_BYTES);
}
