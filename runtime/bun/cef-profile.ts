import { chmod, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

async function ensureDirectory(path: string) {
  try {
    const stats = await lstat(path);
    if (stats.isDirectory()) {
      return;
    }

    await rm(path, { recursive: true, force: true });
  } catch {
    // Directory does not exist yet, create below.
  }

  await mkdir(path, { recursive: true, mode: 0o700 });
}

export async function cleanupLinuxCefProfileLocks(userCachePath: string) {
  if (process.platform !== 'linux') {
    return;
  }

  const cefRoot = join(userCachePath, 'CEF');
  const partitionsDir = join(cefRoot, 'Partitions');
  const candidateProfileDirs = [
    join(cefRoot, 'Default'),
    partitionsDir,
    join(partitionsDir, 'default'),
  ];

  try {
    await ensureDirectory(cefRoot);
    await chmod(cefRoot, 0o700).catch(() => undefined);
    for (const profileDir of candidateProfileDirs) {
      await ensureDirectory(profileDir);
      await chmod(profileDir, 0o700).catch(() => undefined);
    }

    const cefEntries = await readdir(cefRoot).catch(() => []);
    for (const entryName of cefEntries) {
      if (entryName.startsWith('Singleton') || entryName.startsWith('.org.chromium.Chromium.')) {
        await rm(join(cefRoot, entryName), {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }
    }

    for (const profileDir of candidateProfileDirs) {
      let stats: Awaited<ReturnType<typeof lstat>> | null = null;
      try {
        stats = await lstat(profileDir);
      } catch {
        stats = null;
      }
      if (!stats?.isDirectory()) {
        continue;
      }

      await chmod(profileDir, 0o700).catch(() => undefined);
      for (const lockName of ['LOCK', 'SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
        await rm(join(profileDir, lockName), {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }

      const profileEntries = await readdir(profileDir).catch(() => []);
      for (const profileEntryName of profileEntries) {
        if (profileEntryName.startsWith('.org.chromium.Chromium.')) {
          await rm(join(profileDir, profileEntryName), {
            recursive: true,
            force: true,
          }).catch(() => undefined);
        }
      }
    }
  } catch (error) {
    console.warn('[CEF] Failed to clean profile locks. Continuing without cleanup.', error);
  }
}
