import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type {
  PlayStoreAppDetailsResponse,
  PlayStoreDownloadRequest,
  PlayStoreDownloadResponse,
  PlayStoreDownloadsResponse,
  PlayStoreInstallRequest,
  PlayStoreInstallResponse,
  PlayStoreSearchRequest,
  PlayStoreSearchResponse,
  PlayStoreStatusResponse,
} from '../../../shared/desktop-rpc';
import { getAppStoreDownloadDirectory } from '../../firmware-package-utils.ts';
import { runBufferedCommand } from '../../process/index.ts';
import {
  checkAdbConnected,
  runCommand,
  withSharedAdbCommandSession,
} from '../backup-restore/connected/connected-backups-adb.ts';
import { ADB_INSTALL_TIMEOUT_MS } from '../backup-restore/connected/connected-backups-shared.ts';

type ToolSource = NonNullable<PlayStoreStatusResponse['toolSource']>;
type ToolResolution =
  | {
      available: true;
      executablePath: string;
      toolSource: ToolSource;
    }
  | {
      available: false;
      error: string;
    };

type CommandResult = {
  exitCode: number;
  stdoutText: string;
  stderrText: string;
  error?: string;
};

type FileSnapshotEntry = {
  fileName: string;
  fullPath: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: number;
};

const TOOL_TIMEOUT_MS = 5 * 60 * 1000;
const GPLAYDL_EXECUTABLE_NAME = process.platform === 'win32' ? 'gplaydl.exe' : 'gplaydl';
function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}

function getBundledGplaydlCandidates() {
  const execPath = process.execPath;
  const argv0 = process.argv[0] || execPath;

  const packagedAppRoots = uniquePaths([
    join(execPath, '..', '..', 'Resources', 'app'),
    join(dirname(execPath), '..', 'Resources', 'app'),
    join(argv0, '..', '..', 'Resources', 'app'),
    join(dirname(argv0), '..', 'Resources', 'app'),
  ]);

  const packagedCandidates = packagedAppRoots.map((root) =>
    join(root, 'tools', 'gplaydl', process.platform, GPLAYDL_EXECUTABLE_NAME),
  );

  const developmentCandidate = join(
    process.cwd(),
    'assets',
    'tools',
    'gplaydl',
    process.platform,
    GPLAYDL_EXECUTABLE_NAME,
  );

  const legacyPlatformArchCandidate = join(
    process.cwd(),
    'assets',
    'tools',
    'gplaydl',
    `${process.platform}-${process.arch}`,
    GPLAYDL_EXECUTABLE_NAME,
  );

  return uniquePaths([...packagedCandidates, developmentCandidate, legacyPlatformArchCandidate]);
}

function resolveFromPath(commandName: string) {
  const pathValue = process.env.PATH || '';
  const separator = process.platform === 'win32' ? ';' : ':';
  for (const segment of pathValue.split(separator)) {
    const trimmedSegment = segment.trim();
    if (!trimmedSegment) {
      continue;
    }

    const candidate = join(trimmedSegment, commandName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

function resolveGplaydlExecutable(): ToolResolution {
  const envHit = process.env.LMFD_GPLAYDL_EXECUTABLE?.trim();
  if (envHit) {
    if (existsSync(envHit)) {
      return {
        available: true,
        executablePath: envHit,
        toolSource: 'custom',
      };
    }

    return {
      available: false,
      error: `LMFD_GPLAYDL_EXECUTABLE points to a missing file: ${envHit}`,
    };
  }

  for (const candidate of getBundledGplaydlCandidates()) {
    if (existsSync(candidate)) {
      return {
        available: true,
        executablePath: candidate,
        toolSource: 'bundled',
      };
    }
  }

  const systemHit = resolveFromPath(GPLAYDL_EXECUTABLE_NAME);
  if (systemHit) {
    return {
      available: true,
      executablePath: systemHit,
      toolSource: 'system',
    };
  }

  return {
    available: false,
    error:
      `gplaydl was not found. Place ${GPLAYDL_EXECUTABLE_NAME} under ` +
      `assets/tools/gplaydl/${process.platform}/ or install it on PATH.`,
  };
}

async function runGplaydl(args: string[]) {
  const resolved = resolveGplaydlExecutable();
  if (!resolved.available) {
    return {
      exitCode: -1,
      stdoutText: '',
      stderrText: '',
      error: resolved.error,
    } satisfies CommandResult;
  }

  const result = await runBufferedCommand({
    args,
    command: resolved.executablePath,
    envMode: 'sidecar',
    envOverrides: {
      ['CLICOLOR']: '0',
      ['NO_COLOR']: '1',
      ['TERM']: 'dumb',
    },
    timeoutMs: TOOL_TIMEOUT_MS,
  });

  return {
    error: result.timedOut ? 'gplaydl command timed out.' : result.error,
    exitCode: result.exitCode,
    stderrText: result.stderrText,
    stdoutText: result.stdoutText,
  } satisfies CommandResult;
}

function stripAnsi(text: string) {
  return text.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape parsing is intentional.
    /\u001b\[[0-9;?]*[ -/]*[@-~]/g,
    '',
  );
}

function parseRichTableRows(text: string, expectedColumns: number) {
  const rows: string[][] = [];

  for (const rawLine of stripAnsi(text).split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const delimiter = line.includes('│') ? '│' : line.includes('|') ? '|' : '';
    if (!delimiter) {
      continue;
    }

    const rawCells = line.split(delimiter);
    if (rawCells.length < expectedColumns + 2) {
      continue;
    }

    const cells = rawCells
      .slice(1, -1)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    if (cells.length !== expectedColumns) {
      continue;
    }

    if (cells.every((cell) => Array.from(cell).every((character) => '─━┄┈-'.includes(character)))) {
      continue;
    }

    rows.push(cells);
  }

  return rows;
}

function parseSearchResults(stdoutText: string): PlayStoreSearchResponse['results'] {
  return parseRichTableRows(stdoutText, 3)
    .map((cells) => {
      const [indexText = '', title = '', packageName = ''] = cells;
      return { indexText, title, packageName };
    })
    .filter((entry) => entry.indexText !== '#' && entry.packageName.toLowerCase() !== 'package')
    .map((entry) => ({
      title: entry.title || entry.packageName,
      packageName: entry.packageName,
    }))
    .filter((entry) => entry.packageName.length > 0);
}

function parseAppDetails(packageName: string, stdoutText: string) {
  const detailMap = new Map<string, string>();
  for (const cells of parseRichTableRows(stdoutText, 2)) {
    const [field, value] = cells;
    if (!field || !value) {
      continue;
    }

    detailMap.set(field.toLowerCase(), value);
  }

  const rawVersion = detailMap.get('version') || '';
  const versionMatch = rawVersion.match(/^(.*?)(?:\s*\(([^)]+)\))?$/);
  const versionName = versionMatch?.[1]?.trim() || undefined;
  const versionCode = versionMatch?.[2]?.trim() || undefined;

  return {
    title: packageName,
    packageName: detailMap.get('package') || packageName,
    versionName,
    versionCode,
    developer: detailMap.get('developer') || undefined,
    rating: detailMap.get('rating') || undefined,
    downloads: detailMap.get('downloads') || undefined,
    playUrl: detailMap.get('play store') || undefined,
  };
}

async function snapshotDownloadedFiles(rootPath: string) {
  const snapshots = new Map<string, FileSnapshotEntry>();
  if (!existsSync(rootPath)) {
    return snapshots;
  }

  const pending = [rootPath];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    if (!currentPath) {
      continue;
    }

    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const info = await stat(entryPath).catch(() => null);
      if (!info) {
        continue;
      }

      snapshots.set(entryPath, {
        fileName: basename(entryPath),
        fullPath: entryPath,
        relativePath: entryPath.replace(/\\/g, '/'),
        sizeBytes: info.size,
        modifiedAt: info.mtimeMs,
      });
    }
  }

  return snapshots;
}

function summarizeDownloadedArtifacts(rootPath: string, snapshots: Map<string, FileSnapshotEntry>) {
  const userHome = homedir();
  return [...snapshots.values()]
    .map((entry) => ({
      fileName: entry.fileName,
      fullPath: entry.fullPath,
      relativePath: entry.fullPath.startsWith(userHome)
        ? relative(userHome, entry.fullPath).replace(/\\/g, '/')
        : relative(rootPath, entry.fullPath).replace(/\\/g, '/'),
      sizeBytes: entry.sizeBytes,
      modifiedAt: entry.modifiedAt,
    }))
    .sort(
      (left, right) =>
        right.modifiedAt - left.modifiedAt || left.fileName.localeCompare(right.fileName),
    );
}

function parsePlayStoreArtifactGroup(fileName: string) {
  const match = fileName.match(/^([A-Za-z0-9._]+)-(\d+)(?:-(.+))?\.([A-Za-z0-9]+)$/);
  if (!match) {
    return null;
  }

  const [, packageName = '', versionCode = '', suffix = '', extension = ''] = match;
  return {
    packageName,
    versionCode,
    suffix: suffix || '',
    extension: extension.toLowerCase(),
  };
}

async function listDownloadedArtifacts(rootPath: string) {
  const snapshots = await snapshotDownloadedFiles(rootPath);
  return summarizeDownloadedArtifacts(rootPath, snapshots);
}

function summarizeDownloadedGroups(
  artifacts: PlayStoreDownloadResponse['artifacts'],
): PlayStoreDownloadsResponse['downloads'] {
  const groups = new Map<
    string,
    {
      id: string;
      packageName: string;
      versionCode?: string;
      totalSizeBytes: number;
      modifiedAt: number;
      apkArtifactCount: number;
      extraArtifactCount: number;
      artifacts: PlayStoreDownloadResponse['artifacts'];
    }
  >();

  for (const artifact of artifacts) {
    const parsed = parsePlayStoreArtifactGroup(artifact.fileName);
    const packageName = parsed?.packageName || artifact.fileName.replace(/\.[^.]+$/, '');
    const versionCode = parsed?.versionCode;
    const groupKey = versionCode ? `${packageName}@${versionCode}` : packageName;
    const current =
      groups.get(groupKey) ||
      ({
        id: groupKey,
        packageName,
        versionCode,
        totalSizeBytes: 0,
        modifiedAt: 0,
        apkArtifactCount: 0,
        extraArtifactCount: 0,
        artifacts: [],
      } satisfies PlayStoreDownloadsResponse['downloads'][number]);

    current.totalSizeBytes += artifact.sizeBytes || 0;
    current.modifiedAt = Math.max(current.modifiedAt, artifact.modifiedAt || 0);
    if (artifact.fileName.toLowerCase().endsWith('.apk')) {
      current.apkArtifactCount += 1;
    } else {
      current.extraArtifactCount += 1;
    }
    current.artifacts.push(artifact);
    groups.set(groupKey, current);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      artifacts: group.artifacts.sort((left, right) =>
        installArtifactSort(left.fileName, right.fileName),
      ),
    }))
    .sort(
      (left, right) =>
        right.modifiedAt - left.modifiedAt || left.packageName.localeCompare(right.packageName),
    );
}

function defaultArch(arch: PlayStoreSearchRequest['arch']) {
  return arch === 'armv7' ? 'armv7' : 'arm64';
}

function installArtifactSort(left: string, right: string) {
  const leftName = basename(left).toLowerCase();
  const rightName = basename(right).toLowerCase();
  const leftIsBase = /-\d+\.apk$/i.test(leftName);
  const rightIsBase = /-\d+\.apk$/i.test(rightName);
  if (leftIsBase !== rightIsBase) {
    return leftIsBase ? -1 : 1;
  }
  return leftName.localeCompare(rightName);
}

async function normalizeInstallArtifactPaths(artifactPaths: string[]) {
  const uniqueByHash = new Set<string>();
  const normalized: string[] = [];

  for (const artifactPath of artifactPaths.sort(installArtifactSort)) {
    if (!artifactPath.toLowerCase().endsWith('.apk')) {
      continue;
    }

    const content = await readFile(artifactPath).catch(() => null);
    if (!content) {
      continue;
    }

    const fingerprint = createHash('sha256').update(content).digest('hex');
    if (uniqueByHash.has(fingerprint)) {
      continue;
    }

    uniqueByHash.add(fingerprint);
    normalized.push(artifactPath);
  }

  return normalized;
}

async function checkInstalledPackage(packageName: string) {
  const result = await runCommand(
    'adb',
    ['shell', 'pm', 'path', packageName],
    ADB_INSTALL_TIMEOUT_MS,
  );
  if (result.exitCode !== 0) {
    return false;
  }

  return /^package:/im.test(result.stdoutText);
}

async function installViaMicroG(packageName: string, artifactPaths: string[]) {
  const hasMicroGVending = await checkInstalledPackage('com.android.vending');
  if (!hasMicroGVending) {
    return {
      ok: false,
      packageName,
      installedArtifactCount: artifactPaths.length,
      installMode: 'microg' as const,
      error:
        'microG install requires a com.android.vending-compatible package on the device. It was not detected.',
    } satisfies PlayStoreInstallResponse;
  }

  const installArgs =
    artifactPaths.length > 1
      ? ['install-multiple', '-r', '-i', 'com.android.vending', ...artifactPaths]
      : ['install', '-r', '-i', 'com.android.vending', artifactPaths[0] || ''];

  const installResult = await runCommand('adb', installArgs, ADB_INSTALL_TIMEOUT_MS);
  if (installResult.exitCode !== 0) {
    return {
      ok: false,
      packageName,
      installedArtifactCount: artifactPaths.length,
      installMode: 'microg' as const,
      error:
        installResult.stderrText.trim() ||
        installResult.stdoutText.trim() ||
        installResult.error ||
        'microG-compatible install failed.',
    } satisfies PlayStoreInstallResponse;
  }

  return {
    ok: true,
    packageName,
    installedArtifactCount: artifactPaths.length,
    installMode: 'microg' as const,
    detail:
      installResult.stdoutText.trim() ||
      'Installed using the com.android.vending-compatible installer identity.',
  } satisfies PlayStoreInstallResponse;
}

export async function getPlayStoreStatus(): Promise<PlayStoreStatusResponse> {
  const resolved = resolveGplaydlExecutable();
  const downloadRoot = getAppStoreDownloadDirectory();
  if (!resolved.available) {
    return {
      ok: true,
      available: false,
      downloadRoot,
      error: resolved.error,
    };
  }

  return {
    ok: true,
    available: true,
    toolPath: resolved.executablePath,
    toolSource: resolved.toolSource,
    downloadRoot,
  };
}

export async function listPlayStoreDownloads(): Promise<PlayStoreDownloadsResponse> {
  const downloadRoot = getAppStoreDownloadDirectory();
  if (!existsSync(downloadRoot)) {
    return {
      ok: true,
      downloadRoot,
      downloads: [],
    };
  }

  try {
    const artifacts = await listDownloadedArtifacts(downloadRoot);
    return {
      ok: true,
      downloadRoot,
      downloads: summarizeDownloadedGroups(artifacts),
    };
  } catch (error) {
    return {
      ok: false,
      downloadRoot,
      downloads: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function searchPlayStoreApps(
  payload: PlayStoreSearchRequest,
): Promise<PlayStoreSearchResponse> {
  const query = payload.query.trim();
  if (!query) {
    return {
      ok: false,
      results: [],
      error: 'Enter a search query first.',
    };
  }

  const result = await runGplaydl([
    'search',
    query,
    '--limit',
    String(Math.max(1, Math.min(payload.limit || 12, 30))),
    '--arch',
    defaultArch(payload.arch),
  ]);
  if (result.exitCode !== 0) {
    return {
      ok: false,
      results: [],
      error:
        result.error || result.stderrText.trim() || result.stdoutText.trim() || 'Search failed.',
    };
  }

  return {
    ok: true,
    results: parseSearchResults(result.stdoutText),
  };
}

export async function getPlayStoreAppDetails(payload: {
  packageName: string;
  arch?: PlayStoreSearchRequest['arch'];
}): Promise<PlayStoreAppDetailsResponse> {
  const packageName = payload.packageName.trim();
  if (!packageName) {
    return {
      ok: false,
      error: 'Missing package name.',
    };
  }

  const result = await runGplaydl(['info', packageName, '--arch', defaultArch(payload.arch)]);
  if (result.exitCode !== 0) {
    return {
      ok: false,
      error:
        result.error ||
        result.stderrText.trim() ||
        result.stdoutText.trim() ||
        'Could not load app details.',
    };
  }

  return {
    ok: true,
    data: parseAppDetails(packageName, result.stdoutText),
  };
}

export async function downloadPlayStoreApp(
  payload: PlayStoreDownloadRequest,
): Promise<PlayStoreDownloadResponse> {
  const packageName = payload.packageName.trim();
  const downloadRoot = getAppStoreDownloadDirectory();
  if (!packageName) {
    return {
      ok: false,
      packageName: '',
      downloadRoot,
      artifacts: [],
      error: 'Missing package name.',
    };
  }

  await mkdir(downloadRoot, { recursive: true });
  const before = await snapshotDownloadedFiles(downloadRoot);
  const args = [
    'download',
    packageName,
    '--output',
    downloadRoot,
    '--arch',
    defaultArch(payload.arch),
  ];
  if (payload.includeSplits === false) {
    args.push('--no-splits');
  }
  if (payload.includeExtras === false) {
    args.push('--no-extras');
  }

  const result = await runGplaydl(args);
  if (result.exitCode !== 0) {
    return {
      ok: false,
      packageName,
      downloadRoot,
      artifacts: [],
      error:
        result.error || result.stderrText.trim() || result.stdoutText.trim() || 'Download failed.',
    };
  }

  const after = await snapshotDownloadedFiles(downloadRoot);
  const changed = new Map<string, FileSnapshotEntry>();
  for (const [pathValue, entry] of after.entries()) {
    const previous = before.get(pathValue);
    if (
      !previous ||
      previous.modifiedAt !== entry.modifiedAt ||
      previous.sizeBytes !== entry.sizeBytes
    ) {
      changed.set(pathValue, entry);
    }
  }

  return {
    ok: true,
    packageName,
    downloadRoot,
    artifacts: summarizeDownloadedArtifacts(downloadRoot, changed),
  };
}

export async function installPlayStoreApp(
  payload: PlayStoreInstallRequest,
): Promise<PlayStoreInstallResponse> {
  const packageName = payload.packageName.trim();
  const installMode = payload.mode === 'microg' ? 'microg' : 'standard';
  const artifactPaths = await normalizeInstallArtifactPaths(
    payload.artifactPaths
      .map((artifactPath: string) => artifactPath.trim())
      .filter((artifactPath: string) => artifactPath.length > 0 && existsSync(artifactPath))
      .sort(installArtifactSort),
  );

  if (!packageName) {
    return {
      ok: false,
      packageName: '',
      installedArtifactCount: 0,
      installMode,
      error: 'Missing package name.',
    };
  }

  if (artifactPaths.length === 0) {
    return {
      ok: false,
      packageName,
      installedArtifactCount: 0,
      installMode,
      error: 'No downloaded APK files were provided for installation.',
    };
  }

  const connection = await checkAdbConnected();
  if (!connection.connected) {
    return {
      ok: false,
      packageName,
      installedArtifactCount: 0,
      installMode,
      error: connection.detail,
    };
  }

  if (installMode === 'microg') {
    return withSharedAdbCommandSession(() => installViaMicroG(packageName, artifactPaths));
  }

  const installArgs =
    artifactPaths.length > 1
      ? ['install-multiple', '-r', ...artifactPaths]
      : ['install', '-r', artifactPaths[0] || ''];

  const result = await withSharedAdbCommandSession(() =>
    runCommand('adb', installArgs, ADB_INSTALL_TIMEOUT_MS),
  );

  if (result.exitCode !== 0) {
    return {
      ok: false,
      packageName,
      installedArtifactCount: artifactPaths.length,
      installMode,
      error:
        result.stderrText.trim() || result.stdoutText.trim() || result.error || 'Install failed.',
    };
  }

  return {
    ok: true,
    packageName,
    installedArtifactCount: artifactPaths.length,
    installMode,
    detail: result.stdoutText.trim() || 'Install completed.',
  };
}
