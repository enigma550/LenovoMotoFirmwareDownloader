/**
 * Local backup snapshots — Facade.
 *
 * Split into focused submodules:
 *   - shared.ts   — Shared constants, helpers, and snapshot scan types
 *   - scanners.ts — Directory scanners and filesystem utilities
 *   - parsers.ts  — Manifest parsers and JSON/text file parsers
 *
 * This file keeps the public API: listBackupRestoreSnapshots + scanSnapshot.
 */
import { existsSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, relative } from 'node:path';
import type {
  BackupRestoreSnapshot,
  BackupRestoreSnapshotsResponse,
  DeleteBackupSnapshotRequest,
  DeleteBackupSnapshotResponse,
} from '../../../../shared/desktop-rpc';
import { asRecord, getDownloadDirectory, type JsonValue } from '../../../firmware-package-utils.ts';
import {
  parseAppsFromManifest,
  parseContactsFromManifest,
  parseFilesFromManifest,
  parseMediaFromManifest,
  parseMessagesFromManifest,
} from './parsers.ts';
import {
  readOptionalNumber,
  readStringValue,
  type SnapshotScanContext,
  safeDirectoryEntries,
  scanAppsFromDirectory,
  scanContactsFromDirectory,
  scanFilesFromDirectory,
  scanMediaFromDirectory,
  scanMessagesFromDirectory,
} from './scanners.ts';

const MAX_SNAPSHOTS = 16;

function getBackupRestoreDirectory() {
  return join(getDownloadDirectory(), 'backup-restore');
}

function toRelativeHomePath(pathValue: string) {
  const userHome = homedir();
  return pathValue.startsWith(userHome) ? relative(userHome, pathValue) : pathValue;
}

async function readSnapshotManifest(snapshotPath: string) {
  const manifestPath = join(snapshotPath, 'manifest.json');
  if (!(await Bun.file(manifestPath).exists())) {
    return null;
  }

  try {
    const payload = (await Bun.file(manifestPath).json()) as JsonValue;
    return asRecord(payload);
  } catch {
    return null;
  }
}

async function getDirectorySizeBytes(rootPath: string): Promise<number> {
  let totalBytes = 0;
  const queue = [rootPath];

  while (queue.length > 0) {
    const currentPath = queue.pop();
    if (!currentPath) {
      continue;
    }

    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        totalBytes += (await stat(entryPath)).size;
      } catch {
        // Ignore per-file stat failures while scanning snapshot size.
      }
    }
  }

  return totalBytes;
}

async function scanSnapshot(snapshotPath: string): Promise<BackupRestoreSnapshot> {
  const relativeSnapshotPath = toRelativeHomePath(snapshotPath);
  const manifest = await readSnapshotManifest(snapshotPath);
  const snapshotInfo = await stat(snapshotPath);
  const sizeBytes = await getDirectorySizeBytes(snapshotPath);
  const context: SnapshotScanContext = { snapshotPath, relativeSnapshotPath };

  const manifestApps = await parseAppsFromManifest(context, manifest?.apps);
  const manifestMedia = await parseMediaFromManifest(context, manifest?.media);
  const manifestContacts = parseContactsFromManifest(manifest?.contacts);
  const manifestMessages = parseMessagesFromManifest(manifest?.messages);
  const manifestFiles = parseFilesFromManifest(manifest?.files);

  const apps = manifestApps.length > 0 ? manifestApps : await scanAppsFromDirectory(context);
  const media = manifestMedia.length > 0 ? manifestMedia : await scanMediaFromDirectory(context);
  const contacts =
    manifestContacts.length > 0 ? manifestContacts : await scanContactsFromDirectory(context);
  const messages =
    manifestMessages.length > 0 ? manifestMessages : await scanMessagesFromDirectory(context);
  const files = manifestFiles.length > 0 ? manifestFiles : await scanFilesFromDirectory(context);

  const categories: string[] = [];
  if (apps.length > 0) categories.push('apps');
  if (media.length > 0) categories.push('media');
  if (contacts.length > 0) categories.push('contacts');
  if (messages.length > 0) categories.push('messages');
  if (files.length > 0) categories.push('files');

  const snapshotTitle =
    readStringValue(manifest?.title) || basename(snapshotPath).replace(/[_-]+/g, ' ').trim();
  const createdAt =
    readOptionalNumber(manifest?.createdAt) ||
    readOptionalNumber(manifest?.timestamp) ||
    snapshotInfo.mtimeMs;

  return {
    id: basename(snapshotPath),
    title: snapshotTitle || basename(snapshotPath),
    sourcePath: snapshotPath,
    relativeSourcePath: relativeSnapshotPath,
    createdAt,
    sizeBytes,
    deviceName: readStringValue(manifest?.deviceName) || undefined,
    androidVersion: readStringValue(manifest?.androidVersion) || undefined,
    categories,
    apps,
    media,
    contacts,
    messages,
    files,
  };
}

export async function listBackupRestoreSnapshots(): Promise<BackupRestoreSnapshotsResponse> {
  const backupRootPath = getBackupRestoreDirectory();
  const relativeRootPath = toRelativeHomePath(backupRootPath);
  if (!existsSync(backupRootPath)) {
    return {
      ok: true,
      rootPath: backupRootPath,
      relativeRootPath,
      snapshots: [],
    };
  }

  try {
    const entries = await safeDirectoryEntries(backupRootPath);
    const snapshotStats = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(async (entry) => {
          const fullPath = join(backupRootPath, entry.name);
          const info = await stat(fullPath);
          return { fullPath, modifiedAt: info.mtimeMs };
        }),
    );

    snapshotStats.sort((left, right) => right.modifiedAt - left.modifiedAt);
    const snapshots: BackupRestoreSnapshot[] = [];
    for (const snapshotInfo of snapshotStats.slice(0, MAX_SNAPSHOTS)) {
      snapshots.push(await scanSnapshot(snapshotInfo.fullPath));
    }

    return {
      ok: true,
      rootPath: backupRootPath,
      relativeRootPath,
      snapshots,
    };
  } catch (error) {
    return {
      ok: false,
      rootPath: backupRootPath,
      relativeRootPath,
      snapshots: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function deleteBackupRestoreSnapshot(
  payload: DeleteBackupSnapshotRequest,
): Promise<DeleteBackupSnapshotResponse> {
  const snapshotId = basename(payload.snapshotId?.trim() || '');
  if (!snapshotId || snapshotId === '.' || snapshotId === '..') {
    return {
      ok: false,
      snapshotId: snapshotId || '',
      error: 'Invalid snapshot id.',
    };
  }

  const snapshotPath = join(getBackupRestoreDirectory(), snapshotId);
  if (!existsSync(snapshotPath)) {
    return {
      ok: false,
      snapshotId,
      error: 'Snapshot not found.',
    };
  }

  try {
    const snapshotInfo = await stat(snapshotPath);
    if (!snapshotInfo.isDirectory()) {
      return {
        ok: false,
        snapshotId,
        error: 'Snapshot path is not a directory.',
      };
    }

    await rm(snapshotPath, { recursive: true, force: false });
    return {
      ok: true,
      snapshotId,
      detail: `Deleted snapshot ${snapshotId}.`,
    };
  } catch (error) {
    return {
      ok: false,
      snapshotId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
