/**
 * Shared utility functions for connected device backups.
 */
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { asRecord, getDownloadDirectory, type JsonValue } from '../../../firmware-package-utils.ts';
import type { BackedUpAppRecord } from './connected-backups-shared.ts';

export function getBackupRestoreRootPath() {
  return join(getDownloadDirectory(), 'backup-restore');
}

export function toRelativeHomePath(pathValue: string) {
  const homePath = homedir();
  return pathValue.startsWith(homePath) ? relative(homePath, pathValue) : pathValue;
}

export function packageDisplayName(packageName: string) {
  const trailing = packageName.split('.').filter(Boolean).pop();
  if (!trailing) {
    return packageName;
  }

  return trailing
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

export function getPathBaseName(pathValue: string) {
  const parts = pathValue.split('/');
  return parts[parts.length - 1] || '';
}

export function buildSnapshotId(date = new Date()) {
  const iso = date.toISOString().replace(/[:.]/g, '-');
  return `connected-${iso}`;
}

export async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  const effectiveConcurrency = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) {
        continue;
      }

      await worker(item, index);
    }
  };

  await Promise.all(Array.from({ length: effectiveConcurrency }, () => runWorker()));
}

export function readString(value: JsonValue | undefined) {
  return typeof value === 'string' ? value : '';
}

export function readOptionalNumber(value: JsonValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readStringArray(value: JsonValue | undefined) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parseBackupAppsFromManifest(payload: JsonValue | undefined) {
  if (!Array.isArray(payload)) {
    return [] as BackedUpAppRecord[];
  }

  const apps: BackedUpAppRecord[] = [];
  for (const [index, item] of payload.entries()) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const packageName = readString(record.packageName);
    if (!packageName) {
      continue;
    }

    apps.push({
      id: readString(record.id) || `app-${index + 1}`,
      appName: readString(record.appName) || packageDisplayName(packageName),
      packageName,
      sizeBytes: readOptionalNumber(record.sizeBytes),
      iconPath: readString(record.iconPath) || undefined,
      apkRelativePath: readString(record.apkRelativePath) || undefined,
      apkRelativePaths: readStringArray(record.apkRelativePaths),
    });
  }

  return apps;
}
