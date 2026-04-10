import { execFileSync, execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

type ExitCodeCarrier = {
  status?: number;
};

function getExitCode(error: ExitCodeCarrier | Error | null | undefined, fallback = 1): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = error.status;
    if (typeof status === 'number' && Number.isFinite(status)) {
      return status;
    }
  }
  return fallback;
}

function sleepSync(ms: number) {
  const shared = new SharedArrayBuffer(4);
  const view = new Int32Array(shared);
  Atomics.wait(view, 0, 0, ms);
}

const PROJECT_ROOT = process.cwd();
const BUILD_ROOT = resolve(PROJECT_ROOT, 'build');
const DEV_INSTANCES_ROOT = resolve(BUILD_ROOT, 'dev-instances');
const BASE_DEV_IDENTIFIER = 'com.github.enigma550.lenovomotofirmwaredownloader';
const APP_BASE_NAME = 'LMFD-dev';
const DEFAULT_RETAINED_DEV_INSTANCES = 1;

type PackagedDevApp = {
  appRootPath: string;
  launcherPath: string;
  versionJsonPath: string;
  relativeLauncherPath: string;
  relativeVersionJsonPath: string;
};

function sanitizeInstanceSuffix(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);

  return normalized || 'main';
}

function createDevInstanceSuffix() {
  const explicitSuffix = process.env.LMFD_DEV_INSTANCE || '';
  if (explicitSuffix.trim()) {
    return sanitizeInstanceSuffix(explicitSuffix);
  }
  return 'main';
}

function prepareDevVersionMetadata(versionJsonPath: string, instanceSuffix: string) {
  const rawVersionJson = readFileSync(versionJsonPath, 'utf8');
  const versionInfo = JSON.parse(rawVersionJson) as {
    identifier?: string;
  };

  const instanceIdentifier = `${BASE_DEV_IDENTIFIER}.dev-${instanceSuffix}`;
  versionInfo.identifier = instanceIdentifier;
  writeFileSync(versionJsonPath, `${JSON.stringify(versionInfo)}\n`, 'utf8');

  return instanceIdentifier;
}

function findVersionJsonFiles(rootPath: string) {
  if (!existsSync(rootPath)) {
    return [] as string[];
  }

  const results: string[] = [];
  const directories = [rootPath];

  while (directories.length > 0) {
    const currentPath = directories.pop();
    if (!currentPath) {
      continue;
    }

    const entries = readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (currentPath === BUILD_ROOT && entry.name === 'dev-instances') {
          continue;
        }
        directories.push(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === 'version.json') {
        results.push(entryPath);
      }
    }
  }

  return results;
}

function scoreVersionJsonPath(versionJsonPath: string) {
  const normalizedPath = versionJsonPath.replaceAll('\\', '/');
  let score = 0;

  if (normalizedPath.includes(`dev-${process.platform}-${process.arch}`)) {
    score += 100;
  }

  if (normalizedPath.includes(`dev-${process.platform}`)) {
    score += 50;
  }

  if (normalizedPath.includes(`/${APP_BASE_NAME}.app/`)) {
    score += 40;
  }

  if (normalizedPath.includes(`/${APP_BASE_NAME}/`)) {
    score += 30;
  }

  if (
    normalizedPath.endsWith('/Resources/version.json') ||
    normalizedPath.endsWith('/resources/version.json')
  ) {
    score += 10;
  }

  return score;
}

function resolvePackagedAppRoot(versionJsonPath: string) {
  const normalizedPath = versionJsonPath.replaceAll('\\', '/');

  if (
    normalizedPath.endsWith('/Contents/Resources/version.json') ||
    normalizedPath.endsWith('/Contents/resources/version.json')
  ) {
    return dirname(dirname(dirname(versionJsonPath)));
  }

  return dirname(dirname(versionJsonPath));
}

function resolvePackagedAppLauncher(appRootPath: string) {
  const appName = basename(appRootPath).replace(/\.app$/i, '');
  const isMacBundle = appRootPath.toLowerCase().endsWith('.app');
  const candidates = [
    isMacBundle ? resolve(appRootPath, 'Contents', 'MacOS', appName) : '',
    resolve(appRootPath, 'bin', 'launcher'),
    resolve(appRootPath, 'launcher'),
    resolve(appRootPath, 'bin', `${appName}.exe`),
    resolve(appRootPath, `${appName}.exe`),
    resolve(appRootPath, 'launcher.exe'),
    resolve(appRootPath, appName),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not locate the packaged launcher inside ${appRootPath}.`);
}

function resolvePackagedDevApp() {
  const versionJsonCandidates = findVersionJsonFiles(BUILD_ROOT)
    .filter((entryPath) => entryPath.includes(APP_BASE_NAME))
    .sort((leftPath, rightPath) => {
      return scoreVersionJsonPath(rightPath) - scoreVersionJsonPath(leftPath);
    });

  const versionJsonPath = versionJsonCandidates[0];
  if (!versionJsonPath) {
    throw new Error(
      'Could not locate a packaged dev app. Expected an Electrobun build output with version.json.',
    );
  }

  const appRootPath = resolvePackagedAppRoot(versionJsonPath);
  const launcherPath = resolvePackagedAppLauncher(appRootPath);

  return {
    appRootPath,
    launcherPath,
    versionJsonPath,
    relativeLauncherPath: relative(appRootPath, launcherPath),
    relativeVersionJsonPath: relative(appRootPath, versionJsonPath),
  } satisfies PackagedDevApp;
}

function cloneDirectoryWithLinkedFiles(sourcePath: string, destinationPath: string) {
  const sourceStats = lstatSync(sourcePath);

  if (sourceStats.isSymbolicLink()) {
    symlinkSync(readlinkSync(sourcePath), destinationPath);
    return;
  }

  if (!sourceStats.isDirectory()) {
    try {
      linkSync(sourcePath, destinationPath);
    } catch {
      cpSync(sourcePath, destinationPath);
    }
    return;
  }

  mkdirSync(destinationPath, { recursive: true });
  const entries = readdirSync(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const sourceEntryPath = join(sourcePath, entry.name);
    const destinationEntryPath = join(destinationPath, entry.name);
    cloneDirectoryWithLinkedFiles(sourceEntryPath, destinationEntryPath);
  }
}

function stagePackagedDevApp(packagedApp: PackagedDevApp, instanceSuffix: string) {
  const stagedInstanceRoot = resolve(
    DEV_INSTANCES_ROOT,
    `${process.platform}-${process.arch}`,
    instanceSuffix,
  );
  const stagedAppRootPath = resolve(stagedInstanceRoot, basename(packagedApp.appRootPath));

  mkdirSync(stagedInstanceRoot, { recursive: true });
  rmSync(stagedAppRootPath, { recursive: true, force: true });
  cloneDirectoryWithLinkedFiles(packagedApp.appRootPath, stagedAppRootPath);

  const stagedVersionJsonPath = resolve(stagedAppRootPath, packagedApp.relativeVersionJsonPath);
  const instanceIdentifier = prepareDevVersionMetadata(stagedVersionJsonPath, instanceSuffix);

  const stagedLauncherPath = resolve(stagedAppRootPath, packagedApp.relativeLauncherPath);

  return {
    instanceIdentifier,
    stagedAppRootPath,
    stagedLauncherPath,
  };
}

function resolveDevInstanceRetentionLimit() {
  const raw = process.env.LMFD_DEV_INSTANCE_RETENTION?.trim();
  if (!raw) {
    return DEFAULT_RETAINED_DEV_INSTANCES;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_RETAINED_DEV_INSTANCES;
  }

  return parsed;
}

function pruneStaleDevInstances(currentInstanceSuffix: string) {
  const platformRoot = resolve(DEV_INSTANCES_ROOT, `${process.platform}-${process.arch}`);
  if (!existsSync(platformRoot)) {
    return;
  }

  const retentionLimit = resolveDevInstanceRetentionLimit();
  const instanceDirectories = readdirSync(platformRoot, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const entryPath = resolve(platformRoot, entry.name);
      let mtimeMs = 0;
      try {
        mtimeMs = lstatSync(entryPath).mtimeMs;
      } catch {
        // Ignore transient filesystem races.
      }

      return {
        name: entry.name,
        path: entryPath,
        mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  const retainedNames = new Set(
    instanceDirectories
      .slice(0, retentionLimit)
      .map((entry) => entry.name)
      .concat(currentInstanceSuffix),
  );

  let removedCount = 0;
  for (const instanceDirectory of instanceDirectories) {
    if (retainedNames.has(instanceDirectory.name)) {
      continue;
    }

    try {
      rmSync(instanceDirectory.path, { recursive: true, force: true });
      removedCount += 1;
    } catch (error) {
      console.warn(
        `[DevLauncher] Failed to prune stale dev instance ${instanceDirectory.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (removedCount > 0) {
    console.log(
      `[DevLauncher] Pruned ${removedCount} stale dev instance${removedCount === 1 ? '' : 's'} (retaining ${retentionLimit}).`,
    );
  }
}

function resolveUserCacheRoot() {
  const xdgCache = process.env.XDG_CACHE_HOME?.trim() || '';
  if (xdgCache) {
    return xdgCache;
  }

  const homeDirectory = process.env.HOME?.trim() || '';
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA?.trim() || '';
    if (localAppData) {
      return localAppData;
    }

    const appData = process.env.APPDATA?.trim() || '';
    if (appData) {
      return resolve(appData, '..', 'Local');
    }

    const userProfile = process.env.USERPROFILE?.trim() || homeDirectory;
    if (userProfile) {
      return resolve(userProfile, 'AppData', 'Local');
    }
    return '';
  }

  if (process.platform === 'darwin') {
    if (!homeDirectory) {
      return '';
    }
    return resolve(homeDirectory, 'Library', 'Caches');
  }

  if (!homeDirectory) {
    return '';
  }
  return resolve(homeDirectory, '.cache');
}

function pruneStaleDevCacheDirectories(currentInstanceSuffix: string) {
  const cacheRoot = resolveUserCacheRoot();
  if (!cacheRoot || !existsSync(cacheRoot)) {
    return;
  }

  const cachePrefix = `${BASE_DEV_IDENTIFIER}.dev-`;
  const retentionLimit = resolveDevInstanceRetentionLimit();
  const currentCacheName = `${cachePrefix}${currentInstanceSuffix}`;

  const cacheDirectories = readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(cachePrefix))
    .map((entry) => {
      const entryPath = resolve(cacheRoot, entry.name);
      let mtimeMs = 0;
      try {
        mtimeMs = lstatSync(entryPath).mtimeMs;
      } catch {
        // Ignore transient filesystem races.
      }
      return {
        name: entry.name,
        path: entryPath,
        mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  const retainedNames = new Set(
    cacheDirectories
      .slice(0, retentionLimit)
      .map((entry) => entry.name)
      .concat(currentCacheName),
  );

  let removedCount = 0;
  for (const cacheDirectory of cacheDirectories) {
    if (retainedNames.has(cacheDirectory.name)) {
      continue;
    }

    try {
      rmSync(cacheDirectory.path, { recursive: true, force: true });
      removedCount += 1;
    } catch (error) {
      console.warn(
        `[DevLauncher] Failed to prune stale cache ${cacheDirectory.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (removedCount > 0) {
    console.log(
      `[DevLauncher] Pruned ${removedCount} stale dev cache director${removedCount === 1 ? 'y' : 'ies'}.`,
    );
  }
}

function runWithRetries(command: string, attempts: number, sleepMs: number) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      execSync(command, { stdio: 'inherit' });
      return { ok: true as const, error: null };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        const sleepSeconds = Math.max(1, Math.round(sleepMs / 1000));
        console.warn(
          `[DevLauncher] Command failed (attempt ${attempt}/${attempts}). Retrying in ${sleepSeconds}s...`,
        );
        sleepSync(sleepMs);
      }
    }
  }

  return { ok: false as const, error: lastError };
}

/**
 * launch-dev.ts
 *
 * Starts development mode using a per-instance packaged wrapper.
 */

console.log('\n[DevLauncher] Starting development flow...\n');

const TOTAL_STEPS = 7;

// 1. Release ADB lock
// If ADB is running from the build/ folder, it will lock the directory.
console.log(`[1/${TOTAL_STEPS}] Stopping ADB server to release folder locks...`);
try {
  execSync('adb kill-server', { stdio: 'ignore' });
} catch (_e) {
  // Ignore if adb is not in PATH or not running
}

console.log(`[2/${TOTAL_STEPS}] Running formatter and linter`);
try {
  execSync('bun run biome:check', { stdio: 'inherit' });
} catch (e) {
  process.exit(getExitCode(e as ExitCodeCarrier | Error));
}

console.log(`[3/${TOTAL_STEPS}] Preparing bundled QDL binary for local platform...`);
const QDL_PREPARE_RESULT = runWithRetries('bun run qdl:prepare', 1, 3000);
if (!QDL_PREPARE_RESULT.ok) {
  console.warn(
    '[DevLauncher] QDL prepare failed. Continuing with existing local QDL assets (if present).',
  );
}

console.log(`[4/${TOTAL_STEPS}] Preparing bundled FFmpeg fallback for local platform...`);
const FFMPEG_PREPARE_RESULT = runWithRetries('bun run ffmpeg:prepare', 2, 2000);
if (!FFMPEG_PREPARE_RESULT.ok) {
  console.warn(
    '[DevLauncher] FFmpeg prepare failed after retries. Continuing (media thumbnails may require system ffmpeg in PATH).',
  );
}

// 1. Build Angular frontend (Always prepare the views)
// This catches syntax errors and updates the /runtime/views folder.
console.log(`[5/${TOTAL_STEPS}] Preparing application views...`);
try {
  execSync('bun run prepare:all', { stdio: 'inherit' });
} catch (e) {
  console.error('\\n[Error] Angular build failed. Fix the errors and try again.\\n');
  const TYPED_ERROR = e as ExitCodeCarrier | Error;
  process.exit(getExitCode(TYPED_ERROR));
}

console.log(`[6/${TOTAL_STEPS}] Building desktop wrapper...`);
try {
  execSync('bunx electrobun build --env=dev', {
    stdio: 'inherit',
    env: {
      ...process.env,
      ['ELECTROBUN_SKIP_POSTPACKAGE']: '1',
    },
  });
} catch {
  console.error('\n[Fatal] Desktop wrapper build failed.');
  process.exit(1);
}

const INSTANCE_SUFFIX = createDevInstanceSuffix();
let instanceIdentifier = BASE_DEV_IDENTIFIER;
let stagedLauncherPath = '';

try {
  const PACKAGED_APP = resolvePackagedDevApp();
  const STAGED_APP = stagePackagedDevApp(PACKAGED_APP, INSTANCE_SUFFIX);
  instanceIdentifier = STAGED_APP.instanceIdentifier;
  stagedLauncherPath = STAGED_APP.stagedLauncherPath;
  pruneStaleDevInstances(INSTANCE_SUFFIX);
  pruneStaleDevCacheDirectories(INSTANCE_SUFFIX);
} catch (error) {
  console.error('\n[Fatal] Could not prepare a per-instance dev app.', error);
  process.exit(1);
}

console.log(`[7/${TOTAL_STEPS}] Launching application (${INSTANCE_SUFFIX})...`);
console.log(`[DevLauncher] Using dev identifier: ${instanceIdentifier}\n`);

try {
  execFileSync(stagedLauncherPath, [], {
    cwd: dirname(stagedLauncherPath),
    stdio: 'inherit',
    env: {
      ...process.env,
      ['LMFD_DEV_INSTANCE']: INSTANCE_SUFFIX,
    },
  });
} catch {
  console.error('\n[Fatal] Application failed to launch.');
  process.exit(1);
}
