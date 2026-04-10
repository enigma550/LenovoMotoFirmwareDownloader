/**
 * Directory scanners and filesystem utilities for local backup snapshots.
 * Walks filesystem directories to discover apps, media, contacts, messages, and files.
 */
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import type {
  BackupRestoreAppEntry,
  BackupRestoreContactEntry,
  BackupRestoreFileEntry,
  BackupRestoreMediaEntry,
  BackupRestoreMessageEntry,
} from '../../../../shared/desktop-rpc';
import {
  parseContactsFromJsonFile,
  parseMessagesFromJsonFile,
  parseMessagesFromTextFile,
} from './parsers.ts';
import {
  appIconToDataUrl,
  classifyMediaByExtension,
  imageExtensions,
  imageToDataUrl,
  MAX_APPS,
  MAX_CONTACTS,
  MAX_FILES,
  MAX_MEDIA,
  MAX_MESSAGES,
  type SnapshotScanContext,
} from './shared.ts';

// Re-export shared types/utils so the facade can import from here
export {
  readOptionalNumber,
  readStringValue,
  type SnapshotScanContext,
} from './shared.ts';

// --- Filesystem utilities ---

export async function safeDirectoryEntries(pathValue: string) {
  try {
    return await readdir(pathValue, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function findFirstImageInDirectory(pathValue: string, maxDepth = 2) {
  const queue: Array<{ pathValue: string; depth: number }> = [{ pathValue, depth: 0 }];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      break;
    }

    const entries = await safeDirectoryEntries(next.pathValue);
    for (const entry of entries) {
      const fullPath = join(next.pathValue, entry.name);
      if (entry.isDirectory()) {
        if (next.depth < maxDepth && !entry.name.startsWith('.')) {
          queue.push({ pathValue: fullPath, depth: next.depth + 1 });
        }
        continue;
      }

      if (entry.isFile() && imageExtensions.has(extname(entry.name).toLowerCase())) {
        return fullPath;
      }
    }
  }

  return '';
}

async function walkFiles(rootPath: string, options: { maxDepth: number; maxCount: number }) {
  const queue: Array<{ pathValue: string; depth: number }> = [{ pathValue: rootPath, depth: 0 }];
  const files: string[] = [];

  while (queue.length > 0 && files.length < options.maxCount) {
    const next = queue.shift();
    if (!next) {
      break;
    }
    const entries = await safeDirectoryEntries(next.pathValue);
    for (const entry of entries) {
      const fullPath = join(next.pathValue, entry.name);
      if (entry.isDirectory()) {
        if (next.depth < options.maxDepth && !entry.name.startsWith('.')) {
          queue.push({ pathValue: fullPath, depth: next.depth + 1 });
        }
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
        if (files.length >= options.maxCount) {
          break;
        }
      }
    }
  }

  return files;
}

// --- Directory scanners ---

export async function scanAppsFromDirectory(context: SnapshotScanContext) {
  const appRoots = ['apps', 'applications'].map((name) => join(context.snapshotPath, name));
  const discoveredApps: BackupRestoreAppEntry[] = [];

  for (const appRoot of appRoots) {
    if (!existsSync(appRoot)) {
      continue;
    }
    const entries = await safeDirectoryEntries(appRoot);
    for (const entry of entries) {
      if (discoveredApps.length >= MAX_APPS) {
        break;
      }

      const entryPath = join(appRoot, entry.name);
      const baseId = entry.name.replace(/[^\w.-]+/g, '-').toLowerCase();
      const displayName = entry.name
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();

      let iconDataUrl: string | undefined;
      if (entry.isDirectory()) {
        const iconPath = await findFirstImageInDirectory(entryPath, 2);
        iconDataUrl = iconPath ? await appIconToDataUrl(iconPath) : undefined;
      }

      let sizeBytes: number | undefined;
      try {
        sizeBytes = (await stat(entryPath)).size;
      } catch {
        // Best effort metadata.
      }

      discoveredApps.push({
        id: `app-${baseId}`,
        appName: displayName || entry.name,
        packageName: entry.name.includes('.') ? entry.name : undefined,
        iconDataUrl,
        sizeBytes,
      });
    }
  }

  return discoveredApps;
}

export async function scanMediaFromDirectory(context: SnapshotScanContext) {
  const mediaRoots = ['media', 'pictures', 'photos', 'videos', 'dcim']
    .map((name) => join(context.snapshotPath, name))
    .filter((pathValue) => existsSync(pathValue));

  const rootToUse = mediaRoots[0];
  if (!rootToUse) {
    return [] as BackupRestoreMediaEntry[];
  }

  const files = await walkFiles(rootToUse, {
    maxDepth: 3,
    maxCount: MAX_MEDIA * 2,
  });
  const mediaEntries: BackupRestoreMediaEntry[] = [];

  for (const filePath of files) {
    if (mediaEntries.length >= MAX_MEDIA) {
      break;
    }

    const fileName = basename(filePath);
    const mediaType = classifyMediaByExtension(fileName);
    if (mediaType === 'other') {
      continue;
    }

    const relativePath = relative(context.snapshotPath, filePath);
    let sizeBytes: number | undefined;
    let modifiedAt: number | undefined;
    try {
      const info = await stat(filePath);
      sizeBytes = info.size;
      modifiedAt = info.mtimeMs;
    } catch {
      // Ignore metadata failures.
    }

    mediaEntries.push({
      id: `media-${mediaEntries.length + 1}`,
      fileName,
      relativePath,
      mediaType,
      thumbnailDataUrl: mediaType === 'image' ? await imageToDataUrl(filePath) : undefined,
      sizeBytes,
      modifiedAt,
    });
  }

  return mediaEntries;
}

export async function scanContactsFromDirectory(context: SnapshotScanContext) {
  const contactRoots = ['contacts'].map((name) => join(context.snapshotPath, name));
  const rootToUse = contactRoots.find((pathValue) => existsSync(pathValue));
  if (!rootToUse) {
    return [] as BackupRestoreContactEntry[];
  }
  const files = await walkFiles(rootToUse, { maxDepth: 3, maxCount: 20 });
  const contacts: BackupRestoreContactEntry[] = [];

  for (const filePath of files) {
    if (contacts.length >= MAX_CONTACTS) {
      break;
    }

    if (extname(filePath).toLowerCase() !== '.json') {
      continue;
    }

    const parsedContacts = await parseContactsFromJsonFile(filePath);
    for (const contact of parsedContacts) {
      if (contacts.length >= MAX_CONTACTS) {
        break;
      }
      contacts.push(contact);
    }
  }

  return contacts;
}

export async function scanMessagesFromDirectory(context: SnapshotScanContext) {
  const messageRoots = ['messages', 'sms'].map((name) => join(context.snapshotPath, name));
  const rootToUse = messageRoots.find((pathValue) => existsSync(pathValue));
  if (!rootToUse) {
    return [] as BackupRestoreMessageEntry[];
  }
  const files = await walkFiles(rootToUse, { maxDepth: 3, maxCount: 20 });
  const messageEntries: BackupRestoreMessageEntry[] = [];

  for (const filePath of files) {
    if (messageEntries.length >= MAX_MESSAGES) {
      break;
    }

    const extension = extname(filePath).toLowerCase();
    if (!['.json', '.txt', '.csv'].includes(extension)) {
      continue;
    }

    const parsedEntries =
      extension === '.json'
        ? await parseMessagesFromJsonFile(filePath)
        : await parseMessagesFromTextFile(filePath);
    for (const entry of parsedEntries) {
      if (messageEntries.length >= MAX_MESSAGES) {
        break;
      }
      messageEntries.push(entry);
    }
  }

  return messageEntries;
}

export async function scanFilesFromDirectory(context: SnapshotScanContext) {
  const fileRoots = ['files', 'documents', 'downloads']
    .map((name) => join(context.snapshotPath, name))
    .filter((pathValue) => existsSync(pathValue));
  const rootToUse = fileRoots[0] || context.snapshotPath;
  const files = await walkFiles(rootToUse, {
    maxDepth: 4,
    maxCount: MAX_FILES,
  });
  const fileEntries: BackupRestoreFileEntry[] = [];

  for (const filePath of files) {
    let sizeBytes: number | undefined;
    let modifiedAt: number | undefined;
    try {
      const info = await stat(filePath);
      sizeBytes = info.size;
      modifiedAt = info.mtimeMs;
    } catch {
      // Ignore metadata failures.
    }

    fileEntries.push({
      id: `file-${fileEntries.length + 1}`,
      fileName: basename(filePath),
      relativePath: relative(context.snapshotPath, filePath),
      fileType: 'file',
      sizeBytes,
      modifiedAt,
    });
  }

  return fileEntries;
}
