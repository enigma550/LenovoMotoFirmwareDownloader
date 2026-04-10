import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { resetConnectedDeviceConnection } from '../../../device/connected-device-facade.ts';

const ICON_STREAM_BATCH_SIZE = 32;
const ICON_BATCH_TIMEOUT_MS = 45_000;
const ICON_SINGLE_TIMEOUT_MS = 15_000;

type ConnectedDeviceConnection =
  import('../../../device/device-transport-types.ts').ConnectedDeviceConnection;

type PreviewIconCacheEntry = {
  iconDataUrl?: string;
  appLabel?: string;
};

const previewIconCache = new Map<string, PreviewIconCacheEntry>();
let previewIconCacheScope = '';

type ExtractedIcon = {
  dataUrl?: string;
  extension?: string;
  bytes?: Uint8Array;
  sourceEntryPath?: string;
  appLabel?: string;
};

type StreamedExtractedIconEvent = {
  packageName: string;
  icon: ExtractedIcon;
};

type ApieService = {
  runShellCommand: (command: string) => Promise<string>;
  runShellCommandStreaming: (
    command: string,
    onLine: (line: string) => void | Promise<void>,
  ) => Promise<void>;
  pushFile: (localPath: string, remotePath: string) => Promise<void>;
  close: () => Promise<void>;
};

type ApieRuntimeAdapter = {
  extractPackageIcon: (packageName: string) => Promise<ExtractedIcon>;
  extractPackageIcons: (packageNames: string[]) => Promise<Map<string, ExtractedIcon>>;
  streamPackageIcons: (
    packageNames: string[],
    onResult: (event: StreamedExtractedIconEvent) => void | Promise<void>,
  ) => Promise<void>;
};

let apieRuntimeAdapterPromise: Promise<ApieRuntimeAdapter | null> | null = null;

const APIE_DEX_FILE_NAME = 'icon_extractor.dex';

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}

function getBundledApieDexCandidates() {
  const execPath = process.execPath;
  const argv0 = process.argv[0] || execPath;

  const packagedAppRoots = uniquePaths([
    join(execPath, '..', '..', 'Resources', 'app'),
    join(dirname(execPath), '..', 'Resources', 'app'),
    join(argv0, '..', '..', 'Resources', 'app'),
    join(dirname(argv0), '..', 'Resources', 'app'),
  ]);

  const packagedCandidates = packagedAppRoots.map((root) =>
    join(root, 'node_modules', 'apie', 'on-device', APIE_DEX_FILE_NAME),
  );

  const developmentCandidates = uniquePaths([
    join(process.cwd(), 'node_modules', 'apie', 'on-device', APIE_DEX_FILE_NAME),
    join(process.cwd(), 'build', 'node_modules', 'apie', 'on-device', APIE_DEX_FILE_NAME),
  ]);

  return uniquePaths([...packagedCandidates, ...developmentCandidates]);
}

function resolveApieDexPath(localPath: string) {
  if (existsSync(localPath)) {
    return localPath;
  }

  if (basename(localPath) !== APIE_DEX_FILE_NAME) {
    return localPath;
  }

  for (const candidate of getBundledApieDexCandidates()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return localPath;
}

function createApieService(connection: ConnectedDeviceConnection): ApieService {
  return {
    runShellCommand: async (command: string) => {
      const output = await connection.adb.subprocess.noneProtocol.spawnWaitText(command);
      return output.trim();
    },
    runShellCommandStreaming: async (command, onLine) => {
      // Buffered shell output is more reliable than long-lived streamed shell
      // sockets with the packaged Bun/WebUSB/Tango stack.
      const output = await connection.adb.subprocess.noneProtocol.spawnWaitText(command);
      for (const line of output
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)) {
        await onLine(line);
      }
    },
    pushFile: async (localPath, remotePath) => {
      const resolvedLocalPath = resolveApieDexPath(localPath);
      const sync = await connection.adb.sync();
      try {
        await sync.write({
          filename: remotePath,
          file: Bun.file(resolvedLocalPath).stream() as never,
        });
      } finally {
        await sync.dispose().catch(() => {});
      }
    },
    close: async () => {},
  };
}

function toDataUrl(mimeType: string, bytes: Uint8Array) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void | Promise<void>,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          void onTimeout?.();
          reject(new Error(`Operation timed out after ${timeoutMs} ms.`));
        }, timeoutMs);
        timeoutId.unref?.();
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function getApieRuntimeAdapter(): Promise<ApieRuntimeAdapter | null> {
  if (apieRuntimeAdapterPromise) {
    return apieRuntimeAdapterPromise;
  }

  apieRuntimeAdapterPromise = (async () => {
    try {
      const apieModule = await import('apie');
      const { withConnectedDeviceConnection } = await import(
        '../../../device/connected-device-facade.ts'
      );
      const listAppsWithDevice =
        (apieModule.listAppsWithDevice as
          | ((
              service: ApieService,
              options?: { packageFilters?: string[] },
            ) => Promise<Array<{ packageName: string; label: string }>>)
          | undefined) ??
        (apieModule.onDevice?.listAppsWithDevice as
          | ((
              service: ApieService,
              options?: { packageFilters?: string[] },
            ) => Promise<Array<{ packageName: string; label: string }>>)
          | undefined);
      const renderExactDeviceSvgBatch = apieModule.onDevice?.renderExactDeviceSvgBatch as
        | ((
            service: ApieService,
            packageNames: string[],
            shape: string,
            options?: Record<string, never>,
          ) => Promise<
            Map<
              string,
              {
                svg: string;
                sourcePath: string;
                fidelity: string;
              }
            >
          >)
        | undefined;
      const streamExactDeviceSvgBatch = apieModule.onDevice?.streamExactDeviceSvgBatch as
        | ((
            service: ApieService,
            packageNames: string[],
            shape: string,
            options: Record<string, never>,
            onResult: (event: {
              packageName: string;
              result: {
                svg: string;
                sourcePath: string;
                fidelity: string;
              };
            }) => void | Promise<void>,
          ) => Promise<void>)
        | undefined;
      const maskShapes = apieModule.MaskShape as Record<string, string> | undefined;
      const squareMaskShape = maskShapes?.Square;

      if (
        typeof listAppsWithDevice !== 'function' ||
        typeof renderExactDeviceSvgBatch !== 'function' ||
        typeof streamExactDeviceSvgBatch !== 'function' ||
        typeof squareMaskShape !== 'string'
      ) {
        return null;
      }

      const labelCache = new Map<string, string>();

      const normalizePackageNames = (packageNames: string[]) =>
        Array.from(new Set(packageNames.map((packageName) => packageName.trim()).filter(Boolean)));

      const preloadLabels = async (apieService: ApieService, packageNames: string[]) => {
        const missingPackageNames = packageNames.filter(
          (packageName) => !labelCache.has(packageName),
        );
        if (missingPackageNames.length === 0) {
          return;
        }

        const installedApps = await listAppsWithDevice(apieService, {
          packageFilters: missingPackageNames,
        });
        for (const installedApp of installedApps) {
          if (installedApp.label) {
            labelCache.set(installedApp.packageName, installedApp.label);
          }
        }
      };

      const buildExtractedIcon = (
        packageName: string,
        svgResult:
          | {
              svg: string;
              sourcePath: string;
              fidelity: string;
            }
          | undefined,
      ): ExtractedIcon => {
        const appLabel = labelCache.get(packageName);
        if (!svgResult?.svg) {
          return appLabel ? { appLabel } : ({} as ExtractedIcon);
        }

        const bytes = Buffer.from(svgResult.svg, 'utf8');
        return {
          appLabel,
          bytes,
          extension: '.svg',
          sourceEntryPath: `apie:${svgResult.sourcePath || svgResult.fidelity || 'svg'}`,
          dataUrl: toDataUrl('image/svg+xml', bytes),
        } satisfies ExtractedIcon;
      };

      return {
        extractPackageIcon: async (packageName: string) => {
          return withConnectedDeviceConnection(
            async (connection) => {
              const apieService = createApieService(connection);
              const results = await renderExactDeviceSvgBatch(
                apieService,
                [packageName],
                squareMaskShape,
                {},
              );
              await preloadLabels(apieService, [packageName]);
              return buildExtractedIcon(packageName, results.get(packageName));
            },
            { label: `backup:icon-batch:${packageName}` },
          );
        },
        extractPackageIcons: async (packageNames: string[]) => {
          const uniquePackageNames = normalizePackageNames(packageNames);
          if (uniquePackageNames.length === 0) {
            return new Map<string, ExtractedIcon>();
          }

          return withConnectedDeviceConnection(
            async (connection) => {
              const apieService = createApieService(connection);
              await preloadLabels(apieService, uniquePackageNames);
              const results = await renderExactDeviceSvgBatch(
                apieService,
                uniquePackageNames,
                squareMaskShape,
                {},
              );

              const icons = new Map<string, ExtractedIcon>();
              for (const packageName of uniquePackageNames) {
                icons.set(packageName, buildExtractedIcon(packageName, results.get(packageName)));
              }
              return icons;
            },
            { label: `backup:icon-batch:${uniquePackageNames.join(',')}` },
          );
        },
        streamPackageIcons: async (packageNames: string[], onResult) => {
          const uniquePackageNames = normalizePackageNames(packageNames);
          if (uniquePackageNames.length === 0) {
            return;
          }

          await withConnectedDeviceConnection(
            async (connection) => {
              const apieService = createApieService(connection);
              await preloadLabels(apieService, uniquePackageNames);
              await streamExactDeviceSvgBatch(
                apieService,
                uniquePackageNames,
                squareMaskShape,
                {},
                async ({ packageName, result }) => {
                  await onResult({
                    packageName,
                    icon: buildExtractedIcon(packageName, result),
                  });
                },
              );
            },
            { label: `backup:icon-batch:${uniquePackageNames.join(',')}` },
          );
        },
      } satisfies ApieRuntimeAdapter;
    } catch {
      return null;
    }
  })();

  return apieRuntimeAdapterPromise;
}

export function getCachedPreviewIcon(packageName: string) {
  return previewIconCache.get(packageName);
}

export function setPreviewIconCacheScope(scope: string) {
  const normalizedScope = scope.trim() || 'connected-device';
  if (normalizedScope === previewIconCacheScope) {
    return;
  }

  previewIconCache.clear();
  previewIconCacheScope = normalizedScope;
}

export function setCachedPreviewIcon(packageName: string, entry: PreviewIconCacheEntry) {
  previewIconCache.set(packageName, entry);
}

export async function getIconForPackage(packageName: string) {
  const apieRuntimeAdapter = await getApieRuntimeAdapter();
  if (!apieRuntimeAdapter) {
    return {} as ExtractedIcon;
  }

  return apieRuntimeAdapter.extractPackageIcon(packageName);
}

export async function getIconsForPackages(packageNames: string[]) {
  const apieRuntimeAdapter = await getApieRuntimeAdapter();
  if (!apieRuntimeAdapter) {
    return new Map<string, ExtractedIcon>();
  }

  return apieRuntimeAdapter.extractPackageIcons(packageNames);
}

export async function streamIconsForPackages(
  packageNames: string[],
  onResult: (event: StreamedExtractedIconEvent) => void | Promise<void>,
  appendLog?: (line: string) => void,
) {
  const apieRuntimeAdapter = await getApieRuntimeAdapter();
  if (!apieRuntimeAdapter) {
    return;
  }

  const pendingPackages = Array.from(
    new Set(packageNames.map((packageName) => packageName.trim()).filter(Boolean)),
  );
  if (pendingPackages.length === 0) {
    return;
  }

  for (let index = 0; index < pendingPackages.length; index += ICON_STREAM_BATCH_SIZE) {
    const batch = pendingPackages.slice(index, index + ICON_STREAM_BATCH_SIZE);
    const batchLabel = `${Math.floor(index / ICON_STREAM_BATCH_SIZE) + 1}/${Math.ceil(pendingPackages.length / ICON_STREAM_BATCH_SIZE)}`;

    try {
      await withTimeout(
        apieRuntimeAdapter.streamPackageIcons(batch, onResult),
        ICON_BATCH_TIMEOUT_MS,
        () => resetConnectedDeviceConnection(),
      );
      continue;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog?.(
        `Apps scan: icon batch ${batchLabel} failed (${message}). Retrying individually.`,
      );
      await resetConnectedDeviceConnection().catch(() => {});
    }

    for (const packageName of batch) {
      try {
        const icon = await withTimeout(
          apieRuntimeAdapter.extractPackageIcon(packageName),
          ICON_SINGLE_TIMEOUT_MS,
          () => resetConnectedDeviceConnection(),
        );
        await onResult({ packageName, icon });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog?.(`Apps scan: icon extraction failed for ${packageName} (${message}).`);
        await resetConnectedDeviceConnection().catch(() => {});
      }
    }
  }
}

export async function getIconFromLocalApkPaths(options: {
  packageName: string;
  localApkPaths: string[];
}) {
  return getIconForPackage(options.packageName);
}
