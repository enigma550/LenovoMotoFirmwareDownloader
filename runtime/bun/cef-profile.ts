import { chmod, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

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
  if (process.platform !== "linux") {
    return;
  }

  const cefRoot = join(userCachePath, "CEF");
  const partitionsDir = join(cefRoot, "Partitions");
  const defaultPartitionDir = join(partitionsDir, "default");
  const defaultProfileDir = join(cefRoot, "Default");

  try {
    await ensureDirectory(cefRoot);
    await rm(partitionsDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
    await rm(defaultProfileDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
    await ensureDirectory(defaultPartitionDir);

    await chmod(cefRoot, 0o700).catch(() => undefined);
    await chmod(defaultPartitionDir, 0o700).catch(() => undefined);

    const cefEntries = await readdir(cefRoot).catch(() => []);
    for (const entryName of cefEntries) {
      if (entryName.startsWith("Singleton")) {
        await rm(join(cefRoot, entryName), {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }
    }

    for (const lockName of [
      "LOCK",
      "SingletonLock",
      "SingletonSocket",
      "SingletonCookie",
    ]) {
      await rm(join(defaultPartitionDir, lockName), {
        recursive: true,
        force: true,
      }).catch(() => undefined);
    }
  } catch (error) {
    console.warn(
      "[CEF] Failed to clean profile locks. Continuing without cleanup.",
      error,
    );
  }
}
