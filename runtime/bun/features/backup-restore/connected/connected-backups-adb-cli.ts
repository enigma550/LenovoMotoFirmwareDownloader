import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstalledPackageInfo } from './connected-backups-shared.ts';

function isWindows() {
  return process.platform === 'win32';
}

function commandName(base: string) {
  return isWindows() ? `${base}.exe` : base;
}

function candidateSdkRoots() {
  const localAppData = process.env.LOCALAPPDATA || '';
  return [
    process.env.LMFD_ANDROID_SDK_ROOT || '',
    process.env.ANDROID_SDK_ROOT || '',
    process.env.ANDROID_HOME || '',
    join(homedir(), 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
    localAppData ? join(localAppData, 'Android', 'Sdk') : '',
    join(homedir(), '.cache', 'apie', 'android-sdk'),
  ].filter((value, index, array) => value && array.indexOf(value) === index);
}

export async function resolveCliAdbExecutable() {
  const envHit = process.env.LMFD_ADB_EXECUTABLE?.trim();
  if (envHit && existsSync(envHit)) {
    return envHit;
  }

  const pathValue = process.env.PATH || '';
  for (const segment of pathValue.split(isWindows() ? ';' : ':')) {
    const candidate = join(segment, commandName('adb'));
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  for (const root of candidateSdkRoots()) {
    const candidate = join(root, 'platform-tools', commandName('adb'));
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

function normalizePackageName(rawPackageName: string) {
  return rawPackageName
    .trim()
    .replace(/^package:/i, '')
    .trim();
}

export function parsePackageList(output: string) {
  const parsed = output
    .split(/\r?\n/)
    .map((line) => normalizePackageName(line))
    .filter((value) => value.length > 0);

  return Array.from(new Set(parsed));
}

export function parsePackageListWithPrimaryApkPaths(output: string): InstalledPackageInfo[] {
  const packageInfos: InstalledPackageInfo[] = [];
  const seenPackages = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const withoutPrefix = trimmed.replace(/^package:/i, '').trim();
    const equalsIndex = withoutPrefix.lastIndexOf('=');

    let packageName = '';
    let primaryApkPath = '';
    if (equalsIndex > 0) {
      packageName = normalizePackageName(withoutPrefix.slice(equalsIndex + 1));
      primaryApkPath = withoutPrefix.slice(0, equalsIndex).trim();
    } else {
      packageName = normalizePackageName(trimmed);
    }

    if (!packageName || seenPackages.has(packageName)) {
      continue;
    }
    seenPackages.add(packageName);

    packageInfos.push({
      packageName,
      primaryApkPath: primaryApkPath || undefined,
    });
  }

  return packageInfos;
}

export function parseApkPaths(output: string) {
  const paths = output
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.toLowerCase().startsWith('package:'))
    .map((value) => value.replace(/^package:/i, '').trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(paths));
}

function apkPathPriority(remoteApkPath: string) {
  const normalized = remoteApkPath.toLowerCase();
  let score = 0;
  if (normalized.endsWith('/base.apk')) score += 100;
  if (normalized.includes('/base.apk')) score += 40;
  if (normalized.includes('split_config')) score -= 20;
  if (normalized.includes('config.')) score -= 10;
  if (normalized.includes('xxxhdpi')) score += 110;
  if (normalized.includes('xxhdpi')) score += 95;
  if (normalized.includes('xhdpi')) score += 80;
  if (normalized.includes('hdpi')) score += 65;
  if (normalized.includes('mdpi')) score += 50;
  if (normalized.includes('nodpi')) score += 35;
  if (normalized.includes('anydpi')) score += 35;
  if (normalized.includes('dpi')) score += 20;
  if (normalized.includes('master')) score += 25;
  if (/(split_config\.[a-z]{2}(?:-r[a-z]{2})?)(?:\.apk)?$/i.test(normalized)) score -= 40;
  if (/split_config\.(?:arm|arm64|armeabi|x86|x86_64|mips)/i.test(normalized)) score -= 30;
  return score;
}

export function prioritizeApkPaths(remoteApkPaths: string[]) {
  return [...remoteApkPaths].sort((left, right) => apkPathPriority(right) - apkPathPriority(left));
}
