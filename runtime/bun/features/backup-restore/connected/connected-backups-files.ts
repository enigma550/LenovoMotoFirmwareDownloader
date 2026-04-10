import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { BackupRestoreFileEntry } from '../../../../shared/desktop-rpc';
import { sanitizeFileName } from '../../../firmware-package-utils.ts';
import { runCommand } from './connected-backups-adb.ts';
import { loadRemoteFileSizes } from './connected-backups-remote-size.ts';
import {
  ADB_PULL_TIMEOUT_MS,
  MAX_BACKUP_FILES,
  MAX_PREVIEW_FILES,
} from './connected-backups-shared.ts';

const REMOTE_FILE_ROOTS = [
  '/sdcard/Documents',
  '/sdcard/Download',
  '/storage/emulated/0/Documents',
  '/storage/emulated/0/Download',
] as const;

const REMOTE_FILE_PATTERNS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'rtf',
  'odt',
  'ods',
  'odp',
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'json',
  'xml',
  'html',
  'md',
  'log',
  'apk',
] as const;

function buildRemoteFileFindScript() {
  const roots = REMOTE_FILE_ROOTS.map((root) => `'${root}'`).join(' ');
  const nameTests = REMOTE_FILE_PATTERNS.map((ext) => `-iname '*.${ext}'`).join(' -o ');
  return [
    `for d in ${roots}; do`,
    `  if [ -d "$d" ]; then`,
    `    find "$d" -type f \\( ${nameTests} \\) 2>/dev/null`,
    `  fi`,
    `done`,
  ].join('\n');
}

function parseRemoteFilePaths(output: string) {
  const canonicalPathToRemotePath = new Map<string, string>();
  for (const remotePath of output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('/'))) {
    const canonicalPath = toSafeRelativeFilePath(remotePath);
    if (!canonicalPathToRemotePath.has(canonicalPath)) {
      canonicalPathToRemotePath.set(canonicalPath, remotePath);
    }
  }

  return [...canonicalPathToRemotePath.values()];
}

function toSafeRelativeFilePath(remotePath: string) {
  const normalized = remotePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const stripped = normalized.startsWith('storage/emulated/0/')
    ? normalized.slice('storage/emulated/0/'.length)
    : normalized.startsWith('sdcard/')
      ? normalized.slice('sdcard/'.length)
      : normalized;

  const segments = stripped
    .split('/')
    .map((segment) => sanitizeFileName(segment, 'item'))
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return 'file-item.bin';
  }

  return segments.join('/');
}

async function listRemoteFilePaths(maxItems: number, appendLog?: (line: string) => void) {
  const result = await runCommand('adb', ['shell', buildRemoteFileFindScript()], 120_000);
  if (result.exitCode !== 0) {
    appendLog?.('Files scan: filesystem scan failed on device.');
    if (result.stderrText.trim()) {
      appendLog?.(`Files scan stderr: ${result.stderrText.trim().slice(0, 200)}`);
    }
    return [] as string[];
  }

  return parseRemoteFilePaths(result.stdoutText).slice(0, Math.max(1, maxItems));
}

export async function scanConnectedFilesPreview(
  maxItems = MAX_PREVIEW_FILES,
  appendLog?: (line: string) => void,
): Promise<BackupRestoreFileEntry[]> {
  const remotePaths = await listRemoteFilePaths(maxItems, appendLog);
  const sizeByRemotePath = await loadRemoteFileSizes(remotePaths).catch(
    () => new Map<string, number>(),
  );
  const items: BackupRestoreFileEntry[] = [];
  for (const remotePath of remotePaths) {
    const safeRelativePath = join('files', toSafeRelativeFilePath(remotePath)).replace(/\\/g, '/');
    items.push({
      id: `file-${items.length + 1}`,
      fileName: basename(remotePath),
      relativePath: safeRelativePath,
      fileType: 'file',
      sizeBytes: sizeByRemotePath.get(remotePath),
    });
  }

  appendLog?.(`Files preview: found ${items.length} files.`);
  return items;
}

export async function backupFilesToSnapshot(options: {
  snapshotPath: string;
  includeFiles: boolean;
  maxItems?: number;
  selectedRelativePaths?: Set<string>;
  appendLog?: (line: string) => void;
}) {
  if (!options.includeFiles) {
    return [] as BackupRestoreFileEntry[];
  }

  const remotePaths = await listRemoteFilePaths(
    options.maxItems ?? MAX_BACKUP_FILES,
    options.appendLog,
  );
  if (remotePaths.length === 0) {
    options.appendLog?.('Files backup: no document files found.');
    return [] as BackupRestoreFileEntry[];
  }

  const selectedRelativePaths = options.selectedRelativePaths;
  const candidatePaths =
    selectedRelativePaths && selectedRelativePaths.size > 0
      ? remotePaths.filter((remotePath) =>
          selectedRelativePaths.has(
            join('files', toSafeRelativeFilePath(remotePath)).replace(/\\/g, '/'),
          ),
        )
      : remotePaths;
  if (candidatePaths.length === 0) {
    options.appendLog?.('Files backup: no selected files matched the preview.');
    return [] as BackupRestoreFileEntry[];
  }

  const fileEntries: BackupRestoreFileEntry[] = [];
  for (const remotePath of candidatePaths) {
    const relativePath = join('files', toSafeRelativeFilePath(remotePath)).replace(/\\/g, '/');
    const outputPath = join(options.snapshotPath, relativePath);
    await mkdir(dirname(outputPath), { recursive: true });

    const pullResult = await runCommand(
      'adb',
      ['pull', remotePath, outputPath],
      ADB_PULL_TIMEOUT_MS,
    );
    if (pullResult.exitCode !== 0) {
      continue;
    }

    let sizeBytes: number | undefined;
    let modifiedAt: number | undefined;
    try {
      const info = await Bun.file(outputPath).stat();
      sizeBytes = info.size;
      modifiedAt = info.mtimeMs;
    } catch {
      // Ignore metadata lookup failures.
    }

    fileEntries.push({
      id: `file-${fileEntries.length + 1}`,
      fileName: basename(outputPath),
      relativePath,
      fileType: 'file',
      sizeBytes,
      modifiedAt,
    });
  }

  options.appendLog?.(`Files backup: pulled ${fileEntries.length}/${candidatePaths.length} files.`);
  return fileEntries;
}
