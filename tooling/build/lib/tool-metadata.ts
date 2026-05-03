import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

export async function readJsonFileIfExists<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return await readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
