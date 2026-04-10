import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { BackupRestoreMediaEntry } from '../../../../shared/desktop-rpc';
import { sanitizeFileName } from '../../../firmware-package-utils.ts';
import { runCommand } from './connected-backups-adb.ts';
import {
  parseContentQueryRows,
  readContentQueryFirstValue,
} from './connected-backups-content-query.ts';
import { isConnectedPreviewCancelled } from './connected-backups-progress.ts';
import { loadRemoteFileSizes } from './connected-backups-remote-size.ts';
import {
  ADB_PULL_TIMEOUT_MS,
  MAX_BACKUP_MEDIA,
  MAX_MEDIA_THUMBNAILS,
  MAX_PREVIEW_MEDIA,
  MAX_THUMBNAIL_DATA_URL_LENGTH,
} from './connected-backups-shared.ts';

const REMOTE_MEDIA_ROOTS = [
  '/sdcard/DCIM',
  '/sdcard/Pictures',
  '/sdcard/Movies',
  '/sdcard/Download',
  '/storage/emulated/0/DCIM',
  '/storage/emulated/0/Pictures',
  '/storage/emulated/0/Movies',
  '/storage/emulated/0/Download',
] as const;

const REMOTE_MEDIA_PATTERNS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'heic',
  'heif',
  'mp4',
  'mkv',
  'mov',
  'webm',
  'avi',
] as const;

function buildRemoteMediaFindScript() {
  const roots = REMOTE_MEDIA_ROOTS.map((root) => `'${root}'`).join(' ');
  const nameTests = REMOTE_MEDIA_PATTERNS.map((ext) => `-iname '*.${ext}'`).join(' -o ');
  return [
    `for d in ${roots}; do`,
    `  if [ -d "$d" ]; then`,
    `    find "$d" -type f \\( ${nameTests} \\) 2>/dev/null`,
    `  fi`,
    `done`,
  ].join('\n');
}

function parseRemoteMediaPaths(output: string) {
  return Array.from(
    new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('/')),
    ),
  );
}

function classifyMediaType(pathValue: string): BackupRestoreMediaEntry['mediaType'] {
  const extension = extname(pathValue).toLowerCase();
  if (
    extension === '.jpg' ||
    extension === '.jpeg' ||
    extension === '.png' ||
    extension === '.webp' ||
    extension === '.gif' ||
    extension === '.bmp' ||
    extension === '.heic' ||
    extension === '.heif'
  ) {
    return 'image';
  }

  if (
    extension === '.mp4' ||
    extension === '.mkv' ||
    extension === '.mov' ||
    extension === '.webm' ||
    extension === '.avi'
  ) {
    return 'video';
  }

  return 'other';
}

function toSafeRelativeMediaPath(remotePath: string) {
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
    return 'media-item.bin';
  }

  return segments.join('/');
}

async function queryMediaStorePaths(
  uri: string,
  maxItems: number,
  appendLog?: (line: string) => void,
) {
  const result = await runCommand(
    'adb',
    [
      'shell',
      `content query --uri ${uri} --projection _data:_display_name:relative_path --sort 'date_added DESC'`,
    ],
    120_000,
  );
  if (result.exitCode !== 0) {
    appendLog?.(`Media scan: MediaStore query failed for ${uri} (exit ${result.exitCode}).`);
    if (result.stderrText.trim()) {
      appendLog?.(`Media scan stderr: ${result.stderrText.trim().slice(0, 200)}`);
    }
    return [] as string[];
  }

  const paths: string[] = [];
  for (const row of parseContentQueryRows(result.stdoutText)) {
    if (paths.length >= maxItems) {
      break;
    }

    const absolutePath = readContentQueryFirstValue(row, ['_data']);
    if (absolutePath.startsWith('/')) {
      paths.push(absolutePath);
      continue;
    }

    const relativePath = readContentQueryFirstValue(row, ['relative_path']);
    const displayName = readContentQueryFirstValue(row, ['_display_name']);
    if (relativePath && displayName) {
      const normalizedRelativePath = relativePath.replace(/^\/+/, '');
      paths.push(`/sdcard/${normalizedRelativePath}${displayName}`);
    }
  }

  if (paths.length > 0) {
    appendLog?.(`Media scan: MediaStore matched ${paths.length} paths from ${uri}.`);
  }
  return paths;
}

async function listRemoteMediaPaths(maxItems: number, appendLog?: (line: string) => void) {
  const mediaStorePaths = [
    ...(await queryMediaStorePaths(
      'content://media/external/images/media',
      Math.max(1, maxItems),
      appendLog,
    )),
    ...(await queryMediaStorePaths(
      'content://media/external/video/media',
      Math.max(1, maxItems),
      appendLog,
    )),
  ];
  const dedupedMediaStorePaths = parseRemoteMediaPaths(mediaStorePaths.join('\n'));
  if (dedupedMediaStorePaths.length > 0) {
    return dedupedMediaStorePaths.slice(0, Math.max(1, maxItems));
  }

  appendLog?.('Media scan: MediaStore returned no files, falling back to filesystem scan.');
  const result = await runCommand('adb', ['shell', buildRemoteMediaFindScript()], 120_000);
  if (result.exitCode !== 0) {
    appendLog?.('Media scan: filesystem scan failed on device.');
    if (result.stderrText.trim()) {
      appendLog?.(`Media scan stderr: ${result.stderrText.trim().slice(0, 200)}`);
    }
    return [] as string[];
  }

  return parseRemoteMediaPaths(result.stdoutText).slice(0, Math.max(1, maxItems));
}

function thumbnailMimeType(remotePath: string) {
  const ext = extname(remotePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.heic' || ext === '.heif') return 'image/heic';
  if (
    ext === '.mp4' ||
    ext === '.mkv' ||
    ext === '.mov' ||
    ext === '.webm' ||
    ext === '.avi' ||
    ext === '.3gp'
  )
    return 'video';
  return '';
}

let _thumbTempDir: string | null = null;
async function getThumbTempDir() {
  if (!_thumbTempDir) {
    _thumbTempDir = await mkdtemp(join(tmpdir(), 'lmfd-thumbs-'));
  }
  return _thumbTempDir;
}

let _ffmpegAvailable: boolean | null = null;
let _ffmpegCommand: string | null = null;

const ffmpegExecutableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const ffmpegPlatformArchKey = `${process.platform}-${process.arch}`;

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}

function getBundledFfmpegCandidates() {
  const execPath = process.execPath;
  const argv0 = process.argv[0] || execPath;

  const packagedAppRoots = uniquePaths([
    join(execPath, '..', '..', 'Resources', 'app'),
    join(dirname(execPath), '..', 'Resources', 'app'),
    join(argv0, '..', '..', 'Resources', 'app'),
    join(dirname(argv0), '..', 'Resources', 'app'),
  ]);

  const packagedCandidates = packagedAppRoots.map((root) =>
    join(root, 'tools', 'ffmpeg', ffmpegPlatformArchKey, ffmpegExecutableName),
  );

  const developmentCandidate = join(
    process.cwd(),
    'assets',
    'tools',
    'ffmpeg',
    ffmpegPlatformArchKey,
    ffmpegExecutableName,
  );

  return uniquePaths([...packagedCandidates, developmentCandidate]);
}

async function ensureExecutableBitIfNeeded(filePath: string) {
  if (process.platform === 'win32') {
    return;
  }
  try {
    await chmod(filePath, 0o755);
  } catch {
    // Best effort.
  }
}

function resolveBundledFfmpegPath() {
  const candidates = getBundledFfmpegCandidates();
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return '';
}

async function resolveFfmpegCommand() {
  if (_ffmpegCommand !== null) {
    return _ffmpegCommand;
  }

  const pathResult = await runCommand('ffmpeg', ['-version'], 5_000);
  if (pathResult.exitCode === 0) {
    _ffmpegCommand = 'ffmpeg';
    return _ffmpegCommand;
  }

  const bundledFfmpegPath = resolveBundledFfmpegPath();
  if (bundledFfmpegPath) {
    await ensureExecutableBitIfNeeded(bundledFfmpegPath);
    const bundledResult = await runCommand(bundledFfmpegPath, ['-version'], 5_000);
    if (bundledResult.exitCode === 0) {
      _ffmpegCommand = bundledFfmpegPath;
      return _ffmpegCommand;
    }
  }

  _ffmpegCommand = '';
  return _ffmpegCommand;
}

async function isFfmpegAvailable() {
  if (_ffmpegAvailable === null) {
    _ffmpegAvailable = (await resolveFfmpegCommand()).length > 0;
  }
  return _ffmpegAvailable;
}

async function pullThumbnailBase64(remotePath: string): Promise<string | undefined> {
  const mime = thumbnailMimeType(remotePath);
  if (!mime) {
    return undefined;
  }

  // HEIC/HEIF can't be rendered by browsers as data URIs — skip
  if (mime === 'image/heic') {
    return undefined;
  }

  const ffmpegCommand = await resolveFfmpegCommand();
  if (!ffmpegCommand) {
    return undefined;
  }

  const isVideo = mime === 'video';

  // For videos, check file size on device BEFORE pulling
  if (isVideo) {
    // Check file size on device — skip videos larger than 100MB
    const safeRemotePath = remotePath.replace(/'/g, "'\\''");
    const sizeResult = await runCommand('adb', ['shell', `wc -c < '${safeRemotePath}'`], 10_000);
    const remoteSize = Number.parseInt(sizeResult.stdoutText.trim(), 10);
    if (Number.isNaN(remoteSize) || remoteSize > 100_000_000) {
      return undefined;
    }
  }

  const tempDir = await getThumbTempDir();
  const safeName = basename(remotePath).replace(/[^a-zA-Z0-9._-]/g, '_');
  const localPath = join(tempDir, `thumb-${Date.now()}-${safeName}`);

  try {
    // Pull the file from device to local temp
    const pullTimeout = isVideo ? 60_000 : 30_000;
    const pullResult = await runCommand('adb', ['pull', remotePath, localPath], pullTimeout);
    if (pullResult.exitCode !== 0) {
      return undefined;
    }

    // Check file size
    const fileStat = await stat(localPath).catch(() => null);
    if (!fileStat || fileStat.size <= 0) {
      return undefined;
    }

    if (isVideo) {
      // Extract a single frame from the video using ffmpeg
      const framePath = `${localPath}-frame.jpg`;
      try {
        const ffResult = await runCommand(
          ffmpegCommand,
          [
            '-i',
            localPath,
            '-ss',
            '00:00:01',
            '-frames:v',
            '1',
            '-q:v',
            '8',
            '-vf',
            'scale=240:-1',
            '-y',
            framePath,
          ],
          15_000,
        );
        if (ffResult.exitCode !== 0) {
          return undefined;
        }
        const frameBytes = await readFile(framePath);
        if (frameBytes.length < 20) {
          return undefined;
        }
        const dataUrl = `data:image/jpeg;base64,${Buffer.from(frameBytes).toString('base64')}`;
        if (dataUrl.length > MAX_THUMBNAIL_DATA_URL_LENGTH) {
          return undefined;
        }
        return dataUrl;
      } finally {
        await unlink(framePath).catch(() => {});
      }
    }

    // Image: resize to a small JPEG thumbnail using ffmpeg to avoid
    // multi-MB data URLs that crash the bridge message handler
    const thumbPath = `${localPath}-thumb.jpg`;
    try {
      const ffResult = await runCommand(
        ffmpegCommand,
        ['-i', localPath, '-vf', 'scale=240:-1', '-q:v', '6', '-y', thumbPath],
        15_000,
      );
      if (ffResult.exitCode === 0) {
        const thumbBytes = await readFile(thumbPath);
        if (thumbBytes.length >= 20) {
          const dataUrl = `data:image/jpeg;base64,${Buffer.from(thumbBytes).toString('base64')}`;
          if (dataUrl.length <= MAX_THUMBNAIL_DATA_URL_LENGTH) {
            return dataUrl;
          }
        }
      }
      return undefined;
    } finally {
      await unlink(thumbPath).catch(() => {});
    }
  } finally {
    await unlink(localPath).catch(() => {});
  }
}

async function writeSnapshotThumbnail(
  mediaType: BackupRestoreMediaEntry['mediaType'],
  sourcePath: string,
  thumbnailOutputPath: string,
) {
  const ffmpegCommand = await resolveFfmpegCommand();
  if (!ffmpegCommand) {
    return false;
  }

  await mkdir(dirname(thumbnailOutputPath), { recursive: true });
  const args =
    mediaType === 'video'
      ? [
          '-i',
          sourcePath,
          '-ss',
          '00:00:01',
          '-frames:v',
          '1',
          '-q:v',
          '8',
          '-vf',
          'scale=240:-1',
          '-y',
          thumbnailOutputPath,
        ]
      : ['-i', sourcePath, '-vf', 'scale=240:-1', '-q:v', '6', '-y', thumbnailOutputPath];

  const result = await runCommand(ffmpegCommand, args, 15_000);
  if (result.exitCode !== 0) {
    return false;
  }

  const info = await stat(thumbnailOutputPath).catch(() => null);
  return Boolean(info && info.size > 0);
}

export async function scanConnectedMediaPreview(
  maxItems = MAX_PREVIEW_MEDIA,
  appendLog?: (line: string) => void,
  onProgress?: (items: BackupRestoreMediaEntry[]) => void,
): Promise<BackupRestoreMediaEntry[]> {
  const remotePaths = await listRemoteMediaPaths(maxItems, appendLog);
  const sizeByRemotePath = await loadRemoteFileSizes(remotePaths).catch(
    () => new Map<string, number>(),
  );
  const items: BackupRestoreMediaEntry[] = [];
  const thumbCandidates: {
    entry: BackupRestoreMediaEntry;
    remotePath: string;
  }[] = [];

  for (const remotePath of remotePaths) {
    const safeRelativePath = join('media', toSafeRelativeMediaPath(remotePath)).replace(/\\/g, '/');
    const entry: BackupRestoreMediaEntry = {
      id: `media-${items.length + 1}`,
      fileName: basename(remotePath),
      relativePath: safeRelativePath,
      mediaType: classifyMediaType(remotePath),
      sizeBytes: sizeByRemotePath.get(remotePath),
    };
    items.push(entry);

    if (thumbnailMimeType(remotePath) && thumbCandidates.length < MAX_MEDIA_THUMBNAILS) {
      thumbCandidates.push({ entry, remotePath });
    }
  }

  appendLog?.(`Media preview: found ${items.length} files.`);

  // Publish entries immediately (without thumbnails) so the UI can show skeletons
  onProgress?.(items);

  if (!(await isFfmpegAvailable())) {
    appendLog?.('Media preview: ffmpeg unavailable, skipping thumbnail generation.');
    return items;
  }

  if (thumbCandidates.length > 0) {
    appendLog?.(`Media preview: generating thumbnails for ${thumbCandidates.length} images...`);
    let thumbCount = 0;
    const ThumbConcurrency = 4;
    let cursor = 0;
    let pendingPublish = false;

    // Publish progress at most every 800ms to avoid flooding the UI
    const publishInterval = setInterval(() => {
      if (pendingPublish) {
        onProgress?.(items);
        pendingPublish = false;
      }
    }, 800);

    const runWorker = async () => {
      while (cursor < thumbCandidates.length) {
        if (isConnectedPreviewCancelled()) break;
        const index = cursor;
        cursor += 1;
        const item = thumbCandidates[index];
        if (!item) continue;

        const dataUrl = await pullThumbnailBase64(item.remotePath);
        if (dataUrl) {
          item.entry.thumbnailDataUrl = dataUrl;
          thumbCount += 1;
          pendingPublish = true;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(ThumbConcurrency, thumbCandidates.length) }, () => runWorker()),
    );
    clearInterval(publishInterval);

    // Final publish with all thumbnails
    onProgress?.(items);

    appendLog?.(`Media preview: generated ${thumbCount}/${thumbCandidates.length} thumbnails.`);
  }

  return items;
}

export async function backupMediaToSnapshot(options: {
  snapshotPath: string;
  includeMedia: boolean;
  maxItems?: number;
  selectedRelativePaths?: Set<string>;
  appendLog?: (line: string) => void;
}) {
  if (!options.includeMedia) {
    return [] as BackupRestoreMediaEntry[];
  }

  const remotePaths = await listRemoteMediaPaths(
    options.maxItems ?? MAX_BACKUP_MEDIA,
    options.appendLog,
  );
  if (remotePaths.length === 0) {
    options.appendLog?.('Media backup: no media files found.');
    return [] as BackupRestoreMediaEntry[];
  }

  const selectedRelativePaths = options.selectedRelativePaths;
  const candidatePaths =
    selectedRelativePaths && selectedRelativePaths.size > 0
      ? remotePaths.filter((remotePath) =>
          selectedRelativePaths.has(
            join('media', toSafeRelativeMediaPath(remotePath)).replace(/\\/g, '/'),
          ),
        )
      : remotePaths;
  if (candidatePaths.length === 0) {
    options.appendLog?.('Media backup: no selected media files matched the preview.');
    return [] as BackupRestoreMediaEntry[];
  }

  const mediaEntries: BackupRestoreMediaEntry[] = [];
  for (const remotePath of candidatePaths) {
    const relativePath = join('media', toSafeRelativeMediaPath(remotePath)).replace(/\\/g, '/');
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
      const info = await stat(outputPath);
      sizeBytes = info.size;
      modifiedAt = info.mtimeMs;
    } catch {
      // Ignore metadata lookup errors.
    }

    const mediaType = classifyMediaType(outputPath);
    const thumbnailPath =
      mediaType === 'image' || mediaType === 'video'
        ? join(
            'media-thumbs',
            toSafeRelativeMediaPath(remotePath).replace(/\.[^.]+$/, '.jpg'),
          ).replace(/\\/g, '/')
        : undefined;
    let thumbnailRelativePath: string | undefined;
    if (thumbnailPath) {
      const thumbnailOutputPath = join(options.snapshotPath, thumbnailPath);
      const thumbnailWritten = await writeSnapshotThumbnail(
        mediaType,
        outputPath,
        thumbnailOutputPath,
      );
      if (thumbnailWritten) {
        thumbnailRelativePath = thumbnailPath;
      }
    }

    mediaEntries.push({
      id: `media-${mediaEntries.length + 1}`,
      fileName: basename(outputPath),
      relativePath,
      mediaType,
      thumbnailPath: thumbnailRelativePath,
      sizeBytes,
      modifiedAt,
    });
  }

  options.appendLog?.(
    `Media backup: pulled ${mediaEntries.length}/${candidatePaths.length} files.`,
  );
  return mediaEntries;
}
