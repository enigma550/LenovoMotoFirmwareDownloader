import { existsSync } from 'node:fs';
import { readdir, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import {
  getDownloadDirectory,
  getRescueExtractDirectoryRoot,
} from '../../firmware-package-utils.ts';

export type StorageUsageInfo = {
  ok: boolean;
  freeBytes: number;
  totalBytes: number;
  downloadDir: string;
  totalPackageBytes: number;
  packageCount: number;
  totalExtractedBytes: number;
  extractedDirsCount: number;
};

export type CleanStorageResult = {
  ok: boolean;
  freedBytes: number;
  cleanedCount: number;
  error?: string;
};

async function getDirectorySize(dirPath: string): Promise<number> {
  if (!existsSync(dirPath)) {
    return 0;
  }
  let total = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySize(fullPath);
      } else if (entry.isFile()) {
        const stats = await stat(fullPath).catch(() => null);
        if (stats) total += stats.size;
      }
    }
  } catch {
    // Ignore inaccessible files
  }
  return total;
}

export async function getStorageUsage(): Promise<StorageUsageInfo> {
  const downloadDir = getDownloadDirectory();
  const extractRoot = getRescueExtractDirectoryRoot();

  let freeBytes = 0;
  let totalBytes = 0;

  try {
    const fsStats = await statfs(downloadDir);
    freeBytes = Number(fsStats.bavail) * Number(fsStats.bsize);
    totalBytes = Number(fsStats.blocks) * Number(fsStats.bsize);
  } catch {
    // Fallback if statfs fails
  }

  let totalPackageBytes = 0;
  let packageCount = 0;

  if (existsSync(downloadDir)) {
    try {
      const entries = await readdir(downloadDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.zip') || entry.name.endsWith('.pac'))) {
          const stats = await stat(join(downloadDir, entry.name)).catch(() => null);
          if (stats) {
            totalPackageBytes += stats.size;
            packageCount += 1;
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  let totalExtractedBytes = 0;
  let extractedDirsCount = 0;

  if (existsSync(extractRoot)) {
    try {
      const extractedEntries = await readdir(extractRoot, { withFileTypes: true });
      for (const entry of extractedEntries) {
        if (entry.isDirectory()) {
          extractedDirsCount += 1;
          totalExtractedBytes += await getDirectorySize(join(extractRoot, entry.name));
        }
      }
    } catch {
      // Ignore
    }
  }

  return {
    ok: true,
    freeBytes,
    totalBytes,
    downloadDir,
    totalPackageBytes,
    packageCount,
    totalExtractedBytes,
    extractedDirsCount,
  };
}

export async function cleanExtractedFirmwares(): Promise<CleanStorageResult> {
  const extractRoot = getRescueExtractDirectoryRoot();
  if (!existsSync(extractRoot)) {
    return { ok: true, freedBytes: 0, cleanedCount: 0 };
  }

  let freedBytes = 0;
  let cleanedCount = 0;

  try {
    const entries = await readdir(extractRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = join(extractRoot, entry.name);
        const dirSize = await getDirectorySize(dirPath);
        await rm(dirPath, { recursive: true, force: true });
        freedBytes += dirSize;
        cleanedCount += 1;
      }
    }

    return {
      ok: true,
      freedBytes,
      cleanedCount,
    };
  } catch (error) {
    return {
      ok: false,
      freedBytes,
      cleanedCount,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
