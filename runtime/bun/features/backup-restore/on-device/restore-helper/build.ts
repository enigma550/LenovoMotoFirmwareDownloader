#!/usr/bin/env bun

import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  candidateSdkRoots,
  collectFiles,
  commandName,
  findInPath,
  resolveBuildTool,
  resolveSdkManager,
  run,
  runWithInput,
  sdkRoot,
} from '../shared/build-support.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const JAVA_SRC = join(ROOT, 'java', 'src');
const MANIFEST_PATH = join(ROOT, 'java', 'AndroidManifest.xml');
const BUILD_ROOT = join(ROOT, '.build');
const CLASSES_DIR = join(BUILD_ROOT, 'classes');
const APK_ALIGNED = join(BUILD_ROOT, 'lmfd_restore_helper-aligned.apk');
const APK_UNSIGNED = join(BUILD_ROOT, 'lmfd_restore_helper-unsigned.apk');
const OUTPUT_APK = join(ROOT, 'lmfd_restore_helper.apk');
const DEBUG_KEYSTORE = join(ROOT, '.debug.keystore');
const DEBUG_ALIAS = 'androiddebugkey';
const DEBUG_PASSWORD = 'android';
const TARGET_API = '35';
const MIN_API = '26';

function usePrebuiltOrThrow(reason: string): never {
  if (existsSync(OUTPUT_APK)) {
    console.warn(
      `[restore-helper] ${reason} Falling back to committed prebuilt APK: ${OUTPUT_APK}`,
    );
    process.exit(0);
  }
  throw new Error(reason);
}

async function ensureAndroidPlatform() {
  for (const root of candidateSdkRoots()) {
    const candidate = join(root, 'platforms', `android-${TARGET_API}`, 'android.jar');
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const sdkmanager = await resolveSdkManager();
  if (!sdkmanager) {
    throw new Error(
      `android.jar not found and sdkmanager is unavailable. Expected platforms/android-${TARGET_API}/android.jar in a known SDK root.`,
    );
  }

  await runWithInput(
    sdkmanager,
    [`--sdk_root=${sdkRoot()}`, `platforms;android-${TARGET_API}`],
    'y\ny\ny\ny\ny\ny\ny\n',
  );

  const candidate = join(sdkRoot(), 'platforms', `android-${TARGET_API}`, 'android.jar');
  if (!existsSync(candidate)) {
    throw new Error(`sdkmanager completed but ${candidate} was not created.`);
  }
  return candidate;
}

async function ensureDebugKeystore(keytool: string) {
  if (existsSync(DEBUG_KEYSTORE)) {
    return;
  }

  run(keytool, [
    '-genkeypair',
    '-v',
    '-keystore',
    DEBUG_KEYSTORE,
    '-storepass',
    DEBUG_PASSWORD,
    '-alias',
    DEBUG_ALIAS,
    '-keypass',
    DEBUG_PASSWORD,
    '-dname',
    'CN=Android Debug,O=Android,C=US',
    '-keyalg',
    'RSA',
    '-keysize',
    '2048',
    '-validity',
    '10000',
  ]);
}

const javac = await findInPath(commandName('javac'));
if (!javac) {
  usePrebuiltOrThrow('javac not found. Install JDK 17+ and ensure javac is in PATH.');
}

const keytool = await findInPath(commandName('keytool'));
if (!keytool) {
  usePrebuiltOrThrow('keytool not found. Install JDK 17+ and ensure keytool is in PATH.');
}

const jar = await findInPath(commandName('jar'));
if (!jar) {
  usePrebuiltOrThrow('jar not found. Install JDK 17+ and ensure jar is in PATH.');
}

const d8 = await resolveBuildTool('d8');
const aapt2 = await resolveBuildTool('aapt2');
const zipalign = await resolveBuildTool('zipalign');
const apksigner = await resolveBuildTool('apksigner');

if (!d8 || !aapt2 || !zipalign || !apksigner) {
  usePrebuiltOrThrow(
    'Missing Android build tools. Ensure d8, aapt2, zipalign and apksigner are installed.',
  );
}

const androidJar = await ensureAndroidPlatform();
await ensureDebugKeystore(keytool);

await rm(BUILD_ROOT, { recursive: true, force: true });
await mkdir(CLASSES_DIR, { recursive: true });

const sourceFiles = await collectFiles(JAVA_SRC, '.java');
if (sourceFiles.length === 0) {
  throw new Error('No helper Java source files found.');
}

run(javac, [
  '-source',
  '17',
  '-target',
  '17',
  '-cp',
  androidJar,
  '-d',
  CLASSES_DIR,
  ...sourceFiles,
]);

const classFiles = await collectFiles(CLASSES_DIR, '.class');
if (classFiles.length === 0) {
  throw new Error('No compiled class files were produced.');
}

run(d8, ['--output', BUILD_ROOT, '--min-api', MIN_API, ...classFiles]);

const classesDex = join(BUILD_ROOT, 'classes.dex');
if (!existsSync(classesDex)) {
  throw new Error('d8 completed without producing classes.dex.');
}

run(aapt2, [
  'link',
  '-o',
  APK_UNSIGNED,
  '--manifest',
  MANIFEST_PATH,
  '-I',
  androidJar,
  '--min-sdk-version',
  MIN_API,
  '--target-sdk-version',
  TARGET_API,
  '--auto-add-overlay',
]);

run(jar, ['uf', APK_UNSIGNED, '-C', BUILD_ROOT, 'classes.dex']);
run(zipalign, ['-f', '4', APK_UNSIGNED, APK_ALIGNED]);
run(apksigner, [
  'sign',
  '--ks',
  DEBUG_KEYSTORE,
  '--ks-key-alias',
  DEBUG_ALIAS,
  '--ks-pass',
  `pass:${DEBUG_PASSWORD}`,
  '--key-pass',
  `pass:${DEBUG_PASSWORD}`,
  '--out',
  OUTPUT_APK,
  APK_ALIGNED,
]);

console.log(`Built ${OUTPUT_APK}`);
