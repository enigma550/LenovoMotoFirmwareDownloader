import { mkdir, rename, rm, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";

const PROJECT_NAME = "lenovo_moto_firmware_downloader";

async function isProjectRoot(dir: string) {
  const packageJsonPath = join(dir, "package.json");
  const electrobunConfigPath = join(dir, "electrobun.config.ts");
  if (!(await Bun.file(packageJsonPath).exists()) || !(await Bun.file(electrobunConfigPath).exists())) {
    return false;
  }

  try {
    const packageJson = await Bun.file(packageJsonPath).json() as {
      name?: string;
    };
    return packageJson.name === PROJECT_NAME;
  } catch {
    return false;
  }
}

type ProjectRootLookup = {
  dir: string;
  found: boolean;
};

async function findProjectRoot() {
  const starts = [process.cwd(), dirname(process.argv[1] || process.cwd())];
  const visited = new Set<string>();

  for (const start of starts) {
    let current = resolve(start);
    while (!visited.has(current)) {
      visited.add(current);
      if (await isProjectRoot(current)) {
        return { dir: current, found: true } satisfies ProjectRootLookup;
      }

      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return {
    dir: resolve(process.cwd()),
    found: false,
  } satisfies ProjectRootLookup;
}

function getAppDataDir() {
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support");
  }
  if (process.platform === "win32") {
    return process.env.APPDATA || join(home, "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME || join(home, ".config");
}

async function findElectrobunVersionInfo() {
  const starts = [process.cwd(), dirname(process.argv[1] || process.cwd())];
  const visited = new Set<string>();

  for (const start of starts) {
    let current = resolve(start);
    while (!visited.has(current)) {
      visited.add(current);
      const versionPath = join(current, "Resources", "version.json");
      const versionFile = Bun.file(versionPath);
      if (await versionFile.exists()) {
        try {
          const parsed = await versionFile.json() as {
            identifier?: string;
            channel?: string;
            version?: string;
          };
          if (
            typeof parsed.identifier === "string" &&
            parsed.identifier.length > 0 &&
            typeof parsed.channel === "string" &&
            parsed.channel.length > 0
          ) {
            return {
              identifier: parsed.identifier,
              channel: parsed.channel,
              version: parsed.version,
            };
          }
        } catch {
          // Ignore parse errors and keep searching.
        }
      }

      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return null;
}

async function migrateLegacyFile(legacyPath: string, targetPath: string) {
  if (legacyPath === targetPath) return;

  const targetFile = Bun.file(targetPath);
  if (await targetFile.exists()) return;

  const legacyFile = Bun.file(legacyPath);
  if (!(await legacyFile.exists())) return;

  try {
    await rename(legacyPath, targetPath);
  } catch {
    const legacyContent = await legacyFile.text();
    await writeFile(targetPath, legacyContent, "utf8");
    await rm(legacyPath, { force: true });
  }
}

const projectRootLookup = await findProjectRoot();
const runtimeVersionInfo = await findElectrobunVersionInfo();
const runtimeUserDataDir = runtimeVersionInfo
  ? join(
    getAppDataDir(),
    runtimeVersionInfo.identifier,
    runtimeVersionInfo.channel,
  )
  : null;
const shouldUseRuntimeUserData = runtimeVersionInfo
  ? runtimeVersionInfo.channel !== "dev"
  : !projectRootLookup.found;
const shouldUseProjectData =
  projectRootLookup.found && !shouldUseRuntimeUserData;

export const PROJECT_ROOT = projectRootLookup.dir;
export const DATA_DIR = shouldUseProjectData
  ? resolve(PROJECT_ROOT, "assets", "data")
  : resolve(runtimeUserDataDir || process.cwd(), "assets", "data");
export const CONFIG_PATH = resolve(DATA_DIR, "config.json");
export const MODEL_CATALOG_PATH = resolve(DATA_DIR, "models-catalog.json");

const LEGACY_CONFIG_PATH = shouldUseProjectData
  ? resolve(PROJECT_ROOT, "config.json")
  : null;
const LEGACY_MODEL_CATALOG_PATH = shouldUseProjectData
  ? resolve(PROJECT_ROOT, "models-catalog.json")
  : null;

let storageReadyPromise: Promise<void> | null = null;

export function ensureProjectStorageReady() {
  if (!storageReadyPromise) {
    storageReadyPromise = (async () => {
      await mkdir(DATA_DIR, { recursive: true });
      if (LEGACY_CONFIG_PATH) {
        await migrateLegacyFile(LEGACY_CONFIG_PATH, CONFIG_PATH);
      }
      if (LEGACY_MODEL_CATALOG_PATH) {
        await migrateLegacyFile(LEGACY_MODEL_CATALOG_PATH, MODEL_CATALOG_PATH);
      }
    })();
  }

  return storageReadyPromise;
}
