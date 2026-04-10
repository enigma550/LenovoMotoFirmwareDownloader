#!/usr/bin/env bun

import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectFiles,
  commandName,
  findInPath,
  resolveBuildTool,
  run,
} from '../shared/build-support.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const JAVA_SRC = join(ROOT, 'java', 'src');
const JAVA_STUBS = join(ROOT, 'java', 'dev-stubs');
const BUILD_ROOT = join(ROOT, '.build');
const CLASSES_DIR = join(BUILD_ROOT, 'classes');
const OUTPUT_DEX = join(ROOT, 'system_prompt_helper.dex');

function usePrebuiltOrThrow(reason: string): never {
  if (existsSync(OUTPUT_DEX)) {
    console.warn(`[system-prompt] ${reason} Falling back to committed prebuilt DEX: ${OUTPUT_DEX}`);
    process.exit(0);
  }
  throw new Error(reason);
}

const javac = await findInPath(commandName('javac'));
if (!javac) {
  usePrebuiltOrThrow('javac not found. Install JDK 17+ and ensure javac is in PATH.');
}

const d8 = await resolveBuildTool('d8');
if (!d8) {
  usePrebuiltOrThrow('d8 not found. Set ANDROID_D8 or install Android build-tools.');
}
await rm(BUILD_ROOT, { recursive: true, force: true });
await mkdir(CLASSES_DIR, { recursive: true });

const sourceFiles = [
  ...(await collectFiles(JAVA_SRC, '.java')),
  ...(await collectFiles(JAVA_STUBS, '.java')),
];
if (sourceFiles.length === 0) {
  throw new Error('No prompt helper Java source files found.');
}

run(javac, ['-source', '17', '-target', '17', '-d', CLASSES_DIR, ...sourceFiles]);

const classFiles = await collectFiles(CLASSES_DIR, '.class');
if (classFiles.length === 0) {
  throw new Error('No compiled class files were produced.');
}

run(d8, ['--output', BUILD_ROOT, '--min-api', '26', ...classFiles]);

const classesDex = join(BUILD_ROOT, 'classes.dex');
if (!existsSync(classesDex)) {
  throw new Error('d8 completed without producing classes.dex.');
}

await Bun.write(OUTPUT_DEX, Bun.file(classesDex));
console.log(`Built ${OUTPUT_DEX}`);
