import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { APKMirrorDownloader } from 'apkmirror-downloader';
import type { PlayStoreAppDetails, PlayStoreArch } from '../../../shared/desktop-rpc';
import { sanitizeFileName } from '../../firmware-package-utils.ts';

type ApkMirrorLookupApk = {
  [key: string]: unknown;
  link?: string;
};

type ApkMirrorLookupApp = {
  [key: string]: unknown;
  link?: string;
  name?: string;
};

type ApkMirrorLookupData = {
  apks?: ApkMirrorLookupApk[];
  app?: ApkMirrorLookupApp;
  exists?: boolean;
  pname?: string;
  developer?: {
    name?: string;
  };
  release?: ApkMirrorLookupRelease;
};

type ApkMirrorLookupResponse = {
  data?: ApkMirrorLookupData[];
};

type ApkMirrorLookupRelease = {
  downloads?: string;
  link?: string;
  version?: string;
};

type ApkMirrorPackageTarget = {
  developer?: string;
  downloads?: string;
  iconUrl?: string;
  org: string;
  repo: string;
  releaseLink?: string;
  title: string;
  versionCode: string;
  versionName?: string;
};

const APKMIRROR_APP_EXISTS_URL = 'https://www.apkmirror.com/wp-json/apkm/v1/app_exists/';
const APKMIRROR_AUTHORIZATION = 'Basic YXBpLWFwa3VwZGF0ZXI6cm01cmNmcnVVakt5MDRzTXB5TVBKWFc4';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asLookupData(value: unknown): ApkMirrorLookupData | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return record as ApkMirrorLookupData;
}

function parseApkMirrorAppSlug(link: string) {
  const parts = link.split('/').filter(Boolean);
  const apkIndex = parts.indexOf('apk');
  const org = apkIndex >= 0 ? parts[apkIndex + 1] : undefined;
  const repo = apkIndex >= 0 ? parts[apkIndex + 2] : undefined;
  if (!org || !repo) {
    return null;
  }

  return { org, repo };
}

function apkMirrorArch(arch: PlayStoreArch | undefined) {
  return arch === 'armv7' ? 'armeabi-v7a' : 'arm64-v8a';
}

function apkMirrorFallbackArch(arch: PlayStoreArch | undefined) {
  return arch === 'armv7' ? undefined : 'armeabi-v7a';
}

async function lookupApkMirrorPackage(packageName: string): Promise<ApkMirrorPackageTarget> {
  const response = await fetch(APKMIRROR_APP_EXISTS_URL, {
    body: JSON.stringify({
      exclude: ['alpha', 'beta'],
      pnames: [packageName],
    }),
    headers: {
      authorization: APKMIRROR_AUTHORIZATION,
      'Content-Type': 'application/json',
      'User-Agent': 'APKUpdater-v3.0.3',
    },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`APKMirror lookup failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as ApkMirrorLookupResponse;
  const result = payload.data?.map(asLookupData).find((entry) => entry?.pname === packageName);
  if (!result?.exists) {
    throw new Error(`APKMirror does not list ${packageName}.`);
  }

  const selectedSlug = parseApkMirrorAppSlug(result.app?.link || result.apks?.[0]?.link || '');
  if (!selectedSlug) {
    throw new Error(`APKMirror did not return a usable app slug for ${packageName}.`);
  }

  const versionCode = String(result.apks?.[0]?.version_code || '').trim();
  if (!versionCode) {
    throw new Error(`APKMirror did not return a version code for ${packageName}.`);
  }

  return {
    developer: result.developer?.name,
    downloads: result.release?.downloads,
    iconUrl: typeof result.app?.['icon_url'] === 'string' ? result.app['icon_url'] : undefined,
    ...selectedSlug,
    releaseLink: result.release?.link,
    title: result.app?.name || packageName,
    versionCode,
    versionName: result.release?.version,
  };
}

export async function getApkMirrorFallbackAppDetails(
  packageName: string,
): Promise<PlayStoreAppDetails> {
  const target = await lookupApkMirrorPackage(packageName);

  return {
    developer: target.developer,
    downloads: target.downloads,
    packageName,
    playUrl: target.releaseLink ? `https://www.apkmirror.com${target.releaseLink}` : undefined,
    title: target.title,
    versionCode: target.versionCode,
    versionName: target.versionName,
  };
}

async function downloadWithVariantFallback(options: {
  arch?: PlayStoreArch;
  destinationBaseName: string;
  outDir: string;
  target: ApkMirrorPackageTarget;
}) {
  const arch = apkMirrorArch(options.arch);
  const fallbackArch = apkMirrorFallbackArch(options.arch);
  const attempts = [
    { arch, dpi: 'nodpi' },
    { arch, dpi: '*' },
    { arch: 'universal', dpi: '*' },
  ];
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      return await APKMirrorDownloader.download(
        {
          org: options.target.org,
          repo: options.target.repo,
        },
        {
          arch: attempt.arch,
          dpi: attempt.dpi,
          fallbackArch,
          outDir: options.outDir,
          outFile: options.destinationBaseName,
          overwrite: true,
          type: 'apk',
          version: 'stable',
        },
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function downloadApkMirrorFallbackApp(options: {
  arch?: PlayStoreArch;
  downloadRoot: string;
  packageName: string;
}) {
  const target = await lookupApkMirrorPackage(options.packageName);
  const destinationBaseName = sanitizeFileName(
    `${options.packageName}-${target.versionCode}-apkmirror.apk`,
    'app-apkmirror.apk',
  );
  const result = await downloadWithVariantFallback({
    arch: options.arch,
    destinationBaseName,
    outDir: options.downloadRoot,
    target,
  });
  const info = await stat(result.dest);

  return {
    destinationPath: join(options.downloadRoot, destinationBaseName),
    packageName: options.packageName,
    sizeBytes: info.size,
    source: 'apkmirror' as const,
    title: target.title,
    versionCode: target.versionCode,
    versionName: target.versionName,
  };
}
