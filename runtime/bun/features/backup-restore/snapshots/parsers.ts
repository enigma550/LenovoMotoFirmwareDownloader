/**
 * Manifest and file parsers for local backup snapshots.
 * Parses structured data (manifest.json, JSON files, text files) into
 * typed backup/restore entry arrays.
 */
import { basename, join } from 'node:path';
import type {
  BackupRestoreAppEntry,
  BackupRestoreContactEntry,
  BackupRestoreFileEntry,
  BackupRestoreMediaEntry,
  BackupRestoreMessageEntry,
} from '../../../../shared/desktop-rpc';
import { asRecord, type JsonValue } from '../../../firmware-package-utils.ts';
import {
  appIconToDataUrl,
  classifyMediaByExtension,
  imageToDataUrl,
  MAX_APPS,
  MAX_CONTACTS,
  MAX_FILES,
  MAX_MEDIA,
  MAX_MESSAGES,
  normalizeMessagePreview,
  readOptionalNumber,
  readStringValue,
  type SnapshotScanContext,
} from './shared.ts';

function normalizeSnapshotRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

// --- Manifest parsers ---

export async function parseAppsFromManifest(
  context: SnapshotScanContext,
  appsValue: JsonValue | undefined,
) {
  if (!Array.isArray(appsValue)) {
    return [] as BackupRestoreAppEntry[];
  }

  const parsedApps: BackupRestoreAppEntry[] = [];
  for (const [index, item] of appsValue.entries()) {
    if (parsedApps.length >= MAX_APPS) {
      break;
    }
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const appName =
      readStringValue(record.appName) ||
      readStringValue(record.name) ||
      readStringValue(record.packageName) ||
      `App ${index + 1}`;
    const iconFilePath = readStringValue(record.iconPath) || readStringValue(record.icon);
    const resolvedIconPath = iconFilePath ? join(context.snapshotPath, iconFilePath) : '';
    parsedApps.push({
      id: readStringValue(record.id) || `app-${index + 1}`,
      appName,
      packageName: readStringValue(record.packageName) || undefined,
      iconDataUrl: resolvedIconPath ? await appIconToDataUrl(resolvedIconPath) : undefined,
      apkRelativePath: readStringValue(record.apkRelativePath) || undefined,
      itemCount: readOptionalNumber(record.itemCount),
      sizeBytes: readOptionalNumber(record.sizeBytes),
    });
  }

  return parsedApps;
}

export async function parseMediaFromManifest(
  context: SnapshotScanContext,
  mediaValue: JsonValue | undefined,
) {
  if (!Array.isArray(mediaValue)) {
    return [] as BackupRestoreMediaEntry[];
  }

  const parsedMedia: BackupRestoreMediaEntry[] = [];
  for (const [index, item] of mediaValue.entries()) {
    if (parsedMedia.length >= MAX_MEDIA) {
      break;
    }
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const relativePath = readStringValue(record.relativePath) || readStringValue(record.path);
    const fileName = readStringValue(record.fileName) || basename(relativePath || `media-${index}`);
    const mediaType = classifyMediaByExtension(fileName);
    const thumbnailPath = readStringValue(record.thumbnailPath);
    const resolvedThumbnailPath = thumbnailPath ? join(context.snapshotPath, thumbnailPath) : '';
    const resolvedRelativePath = relativePath ? join(context.snapshotPath, relativePath) : '';
    const fallbackThumbnailPath =
      mediaType === 'image' && resolvedRelativePath ? resolvedRelativePath : '';
    parsedMedia.push({
      id: readStringValue(record.id) || `media-${index + 1}`,
      fileName,
      relativePath,
      mediaType,
      thumbnailDataUrl: resolvedThumbnailPath
        ? await imageToDataUrl(resolvedThumbnailPath)
        : fallbackThumbnailPath
          ? await imageToDataUrl(fallbackThumbnailPath)
          : undefined,
      sizeBytes: readOptionalNumber(record.sizeBytes),
      modifiedAt: readOptionalNumber(record.modifiedAt),
    });
  }

  return parsedMedia;
}

export function parseContactsFromManifest(contactsValue: JsonValue | undefined) {
  if (!Array.isArray(contactsValue)) {
    return [] as BackupRestoreContactEntry[];
  }

  const parsedContacts: BackupRestoreContactEntry[] = [];
  for (const [index, item] of contactsValue.entries()) {
    if (parsedContacts.length >= MAX_CONTACTS) {
      break;
    }
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const displayName =
      readStringValue(record.displayName) ||
      readStringValue(record.name) ||
      readStringValue(record.fullName);
    if (!displayName) {
      continue;
    }

    parsedContacts.push({
      id: readStringValue(record.id) || `contact-${index + 1}`,
      displayName,
      phoneNumber:
        readStringValue(record.phoneNumber) || readStringValue(record.phone) || undefined,
      email: readStringValue(record.email) || undefined,
    });
  }

  return parsedContacts;
}

export function parseMessagesFromManifest(messagesValue: JsonValue | undefined) {
  if (!Array.isArray(messagesValue)) {
    return [] as BackupRestoreMessageEntry[];
  }

  const parsedMessages: BackupRestoreMessageEntry[] = [];
  for (const [index, item] of messagesValue.entries()) {
    if (parsedMessages.length >= MAX_MESSAGES) {
      break;
    }
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const preview =
      readStringValue(record.preview) ||
      readStringValue(record.body) ||
      readStringValue(record.text);
    if (!preview) {
      continue;
    }

    parsedMessages.push({
      id: readStringValue(record.id) || `msg-${index + 1}`,
      sender: readStringValue(record.sender) || readStringValue(record.from) || 'Unknown',
      preview: normalizeMessagePreview(preview),
      thread: readStringValue(record.thread) || undefined,
      timestamp: readOptionalNumber(record.timestamp) || readOptionalNumber(record.date),
    });
  }

  return parsedMessages;
}

export function parseFilesFromManifest(filesValue: JsonValue | undefined) {
  if (!Array.isArray(filesValue)) {
    return [] as BackupRestoreFileEntry[];
  }

  const parsedFiles: BackupRestoreFileEntry[] = [];
  const seenRelativePaths = new Set<string>();
  for (const [index, item] of filesValue.entries()) {
    if (parsedFiles.length >= MAX_FILES) {
      break;
    }
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const relativePath = normalizeSnapshotRelativePath(
      readStringValue(record.relativePath) || readStringValue(record.path),
    );
    if (!relativePath || seenRelativePaths.has(relativePath)) {
      continue;
    }
    seenRelativePaths.add(relativePath);
    const fileName = readStringValue(record.fileName) || basename(relativePath || `file-${index}`);
    parsedFiles.push({
      id: readStringValue(record.id) || `file-${index + 1}`,
      fileName,
      relativePath,
      fileType: readStringValue(record.fileType) === 'directory' ? 'directory' : 'file',
      sizeBytes: readOptionalNumber(record.sizeBytes),
      modifiedAt: readOptionalNumber(record.modifiedAt),
    });
  }

  return parsedFiles;
}

// --- File parsers (for directory-based scanning) ---

export async function parseMessagesFromTextFile(filePath: string) {
  try {
    const content = await Bun.file(filePath).text();
    const lines = content
      .split(/\r?\n/)
      .map((line) => normalizeMessagePreview(line))
      .filter((line) => line.length > 0);
    return lines.slice(0, 30).map((line, index) => ({
      id: `${basename(filePath)}-${index}`,
      sender: 'Entry',
      preview: line,
    }));
  } catch {
    return [] as BackupRestoreMessageEntry[];
  }
}

export async function parseMessagesFromJsonFile(filePath: string) {
  try {
    const payload = (await Bun.file(filePath).json()) as JsonValue;
    if (!Array.isArray(payload)) {
      return [] as BackupRestoreMessageEntry[];
    }

    const messages: BackupRestoreMessageEntry[] = [];
    for (const [index, item] of payload.entries()) {
      if (messages.length >= 40) {
        break;
      }
      const record = asRecord(item);
      if (!record) {
        continue;
      }

      const sender =
        readStringValue(record.sender) ||
        readStringValue(record.address) ||
        readStringValue(record.from) ||
        'Unknown';
      const body =
        readStringValue(record.preview) ||
        readStringValue(record.body) ||
        readStringValue(record.text) ||
        '';
      if (!body) {
        continue;
      }

      messages.push({
        id: `${basename(filePath)}-${index}`,
        sender,
        preview: normalizeMessagePreview(body),
        thread: readStringValue(record.thread) || undefined,
        timestamp: readOptionalNumber(record.timestamp) || readOptionalNumber(record.date),
      });
    }

    return messages;
  } catch {
    return [] as BackupRestoreMessageEntry[];
  }
}

export async function parseContactsFromJsonFile(filePath: string) {
  try {
    const payload = (await Bun.file(filePath).json()) as JsonValue;
    if (!Array.isArray(payload)) {
      return [] as BackupRestoreContactEntry[];
    }

    const contacts: BackupRestoreContactEntry[] = [];
    for (const [index, item] of payload.entries()) {
      if (contacts.length >= MAX_CONTACTS) {
        break;
      }
      const record = asRecord(item);
      if (!record) {
        continue;
      }

      const displayName =
        readStringValue(record.displayName) ||
        readStringValue(record.name) ||
        readStringValue(record.fullName);
      if (!displayName) {
        continue;
      }

      contacts.push({
        id: readStringValue(record.id) || `contact-${index + 1}`,
        displayName,
        phoneNumber:
          readStringValue(record.phoneNumber) || readStringValue(record.phone) || undefined,
        email: readStringValue(record.email) || undefined,
      });
    }

    return contacts;
  } catch {
    return [] as BackupRestoreContactEntry[];
  }
}
