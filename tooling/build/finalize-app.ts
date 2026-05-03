import {
  copyFileSync,
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { packageBundledRuntimeDependencies } from './runtime-dependency-packager.ts';

const BUILD_DIR: string | undefined = process.env.ELECTROBUN_BUILD_DIR;
const TARGET_OS: string | undefined = process.env.ELECTROBUN_OS;
const ENV_APP_NAME: string | undefined = process.env.ELECTROBUN_APP_NAME;
const DESKTOP_DISPLAY_NAME: string = 'Lenovo Moto Firmware Downloader';
const WM_CLASS: string = 'LenovoMotoFirmwareDown';
const ORIGINAL_WM_CLASS: string = 'ElectrobunKitchenSink-dev';
const TARGET_ARCH: string = process.env.ELECTROBUN_ARCH || process.arch;
const LEGACY_USB_ADDON_PATH: string = join(
  process.cwd(),
  'assets',
  'tools',
  'usb',
  'linux-x64',
  'node.napi.glibc.node',
);

type RcEditOptions = {
  icon: string;
  'version-string': Record<'ProductName' | 'FileDescription', string>;
};

type RcEditFn = (executablePath: string, options: RcEditOptions) => Promise<void>;

type ModuleLikeValue =
  | string
  | number
  | boolean
  | null
  | object
  | ((...args: never[]) => object | string | number | boolean | null | undefined)
  | undefined;

type ModuleLikeRecord = Record<string, ModuleLikeValue>;

function asRecord(value: ModuleLikeValue): ModuleLikeRecord | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return value as ModuleLikeRecord;
}

function resolveRcEdit(moduleValue: ModuleLikeValue): RcEditFn {
  const record = asRecord(moduleValue);
  const named = record?.['rcedit'];
  const fallback = record?.['default'];
  const candidate = named ?? fallback ?? moduleValue;
  if (typeof candidate !== 'function') {
    throw new Error('rcedit module did not export a callable function.');
  }
  return candidate as RcEditFn;
}

if (!BUILD_DIR) {
  process.exit(0);
}

function removeIfExists(path: string): void {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function pruneRuntimeNodeModules(nodeModulesRoot: string): void {
  const pruneRecursive = (root: string): void => {
    if (!existsSync(root)) return;

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const entryPath = join(root, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === '.git' ||
          entry.name === '.github' ||
          entry.name === '.settings' ||
          entry.name === '.vscode' ||
          entry.name === 'doc' ||
          entry.name === 'docs' ||
          entry.name === 'example' ||
          entry.name === 'examples' ||
          entry.name === 'test' ||
          entry.name === 'tests'
        ) {
          removeIfExists(entryPath);
          continue;
        }
        pruneRecursive(entryPath);
        continue;
      }

      if (
        entry.name === '.bun-tag' ||
        entry.name === '.classpath' ||
        entry.name === '.gitignore' ||
        entry.name === '.project' ||
        entry.name === 'bun.lock' ||
        entry.name === 'tsconfig.json' ||
        entry.name.endsWith('.build.tsbuildinfo') ||
        entry.name.endsWith('.d.ts') ||
        entry.name.endsWith('.d.ts.map') ||
        entry.name.endsWith('.js.map') ||
        entry.name.endsWith('.md')
      ) {
        removeIfExists(entryPath);
      }
    }
  };

  removeIfExists(join(nodeModulesRoot, '@types'));
  removeIfExists(join(nodeModulesRoot, 'usb', 'libusb'));
  removeIfExists(join(nodeModulesRoot, 'usb', 'src'));
  removeIfExists(join(nodeModulesRoot, 'usb', 'test'));
  pruneRecursive(nodeModulesRoot);
}

function pruneLinuxBundle(appFolder: string): void {
  const resourcesAppPath: string = join(appFolder, 'Resources', 'app');
  const toolsRoot: string = join(resourcesAppPath, 'tools');
  const nodeModulesRoot: string = join(resourcesAppPath, 'node_modules');
  const usbPrebuildsPath: string = join(nodeModulesRoot, 'usb', 'prebuilds');
  const keepUsbPrebuild: string = TARGET_ARCH === 'arm64' ? 'linux-arm64' : 'linux-x64';

  removeIfExists(join(appFolder, 'Info.plist'));
  removeIfExists(join(appFolder, 'bin', 'zig-zstd'));
  removeIfExists(join(appFolder, 'bin', 'bspatch'));
  removeIfExists(join(appFolder, 'bin', 'bsdiff'));

  removeIfExists(join(toolsRoot, 'drivers'));
  removeIfExists(join(toolsRoot, 'qdl', 'win32-x64'));
  removeIfExists(join(toolsRoot, 'qdl', 'darwin-arm64'));
  removeIfExists(join(toolsRoot, 'qdl', 'darwin-x64'));
  removeIfExists(join(toolsRoot, 'gplaydl', 'win32'));
  removeIfExists(join(toolsRoot, 'gplaydl', 'darwin'));

  if (existsSync(usbPrebuildsPath)) {
    for (const entry of readdirSync(usbPrebuildsPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name !== keepUsbPrebuild) {
        removeIfExists(join(usbPrebuildsPath, entry.name));
      }
    }
  }

  if (TARGET_ARCH !== 'arm64') {
    removeIfExists(join(nodeModulesRoot, '@img', 'sharp-libvips-linuxmusl-x64'));
    removeIfExists(join(nodeModulesRoot, '@img', 'sharp-linuxmusl-x64'));
  }

  pruneRuntimeNodeModules(nodeModulesRoot);
}

function applyLegacyLinuxUsbAddon(appFolder: string): void {
  if (TARGET_ARCH !== 'x64') {
    return;
  }

  if (!existsSync(LEGACY_USB_ADDON_PATH)) {
    console.warn(`Skipping legacy usb addon override: no file at ${LEGACY_USB_ADDON_PATH}.`);
    return;
  }

  const usbModuleRoot = join(appFolder, 'Resources', 'app', 'node_modules', 'usb');
  const bundledAddonPath = join(usbModuleRoot, 'prebuilds', 'linux-x64', 'node.napi.glibc.node');
  const buildReleaseDir = join(usbModuleRoot, 'build', 'Release');
  const buildReleaseAddonPath = join(buildReleaseDir, 'usb_bindings.node');
  const muslAddonPath = join(usbModuleRoot, 'prebuilds', 'linux-x64', 'node.napi.musl.node');

  if (!existsSync(bundledAddonPath)) {
    console.warn(`Skipping legacy usb addon override: no bundled addon at ${bundledAddonPath}.`);
    return;
  }

  mkdirSync(buildReleaseDir, { recursive: true });
  copyFileSync(LEGACY_USB_ADDON_PATH, buildReleaseAddonPath);
  copyFileSync(LEGACY_USB_ADDON_PATH, bundledAddonPath);

  if (existsSync(muslAddonPath)) {
    removeIfExists(muslAddonPath);
  }

  console.log(`Installed legacy usb addon at ${buildReleaseAddonPath}`);
  console.log(`Replaced bundled usb linux-x64 addon with legacy build -> ${bundledAddonPath}`);
}

const PICK_APP_FOLDER = (): { appFolder: string; appName: string } | null => {
  const launcherName: string = TARGET_OS === 'win' ? 'launcher.exe' : 'launcher';

  const checkFolder = (folderPath: string): boolean => {
    if (existsSync(join(folderPath, 'bin', launcherName))) return true;
    if (existsSync(join(folderPath, 'Contents', 'MacOS', launcherName))) return true;
    return false;
  };

  const directMatch: string | null = ENV_APP_NAME ? join(BUILD_DIR, ENV_APP_NAME) : null;
  const directMatchApp: string | null = ENV_APP_NAME
    ? join(BUILD_DIR, `${ENV_APP_NAME}.app`)
    : null;

  if (directMatch && ENV_APP_NAME && existsSync(directMatch) && checkFolder(directMatch)) {
    return { appFolder: directMatch, appName: ENV_APP_NAME };
  }

  if (directMatchApp && ENV_APP_NAME && existsSync(directMatchApp) && checkFolder(directMatchApp)) {
    return { appFolder: directMatchApp, appName: ENV_APP_NAME };
  }

  const candidates: string[] = readdirSync(BUILD_DIR, { withFileTypes: true })
    .filter((entry: Dirent) => entry.isDirectory())
    .map((entry: Dirent) => entry.name)
    .filter((name: string) => checkFolder(join(BUILD_DIR, name)));

  if (candidates.length === 1) {
    const [name] = candidates;
    if (!name) {
      return null;
    }
    return {
      appFolder: join(BUILD_DIR, name),
      appName: ENV_APP_NAME || name.replace('.app', ''),
    };
  }

  return null;
};

const PATCH_LINUX_WRAPPER = (appFolder: string): void => {
  const wrapperPath: string = join(appFolder, 'bin', 'libNativeWrapper.so');
  if (!existsSync(wrapperPath)) {
    console.warn(`Skipping WMClass patch: no wrapper found at ${wrapperPath}.`);
    return;
  }

  const encoder: TextEncoder = new TextEncoder();
  const original: Uint8Array = encoder.encode(ORIGINAL_WM_CLASS);
  const replacement: Uint8Array = new Uint8Array(original.length);
  const classBytes: Uint8Array = encoder.encode(WM_CLASS);

  if (classBytes.length > original.length) {
    console.warn(`WMClass '${WM_CLASS}' is too long. Truncating to ${original.length} chars.`);
    replacement.set(classBytes.subarray(0, original.length));
  } else {
    replacement.set(classBytes);
  }

  const binary: Uint8Array = new Uint8Array(readFileSync(wrapperPath));

  const findPattern = (haystack: Uint8Array, needle: Uint8Array): number => {
    outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  };

  const offset: number = findPattern(binary, original);
  if (offset === -1) {
    console.warn(`Skipping WMClass patch: '${ORIGINAL_WM_CLASS}' was not found in ${wrapperPath}.`);
    return;
  }

  binary.set(replacement, offset);
  writeFileSync(wrapperPath, binary);
  const patchedName: string = new TextDecoder().decode(
    classBytes.length > original.length ? classBytes.subarray(0, original.length) : classBytes,
  );
  console.log(`Patched WMClass in ${wrapperPath} -> ${patchedName}`);
};

const APP: { appFolder: string; appName: string } | null = PICK_APP_FOLDER();
if (!APP) {
  throw new Error(
    `Could not find app folder in ${BUILD_DIR}. Tried ELECTROBUN_APP_NAME=${ENV_APP_NAME || '<empty>'}.`,
  );
}

console.log(`FinalizeApp: Processing ${TARGET_OS}...`);
packageBundledRuntimeDependencies(APP.appFolder);

if (TARGET_OS === 'linux') {
  applyLegacyLinuxUsbAddon(APP.appFolder);
  pruneLinuxBundle(APP.appFolder);
  PATCH_LINUX_WRAPPER(APP.appFolder);
} else if (TARGET_OS === 'win') {
  const ICON_PATH: string = join(process.cwd(), 'assets/icons/windows-icon.ico');

  if (!existsSync(ICON_PATH)) {
    console.error(`FinalizeApp Error: Icon not found at ${ICON_PATH}`);
  } else {
    const RESOURCES_DIR: string = join(APP.appFolder, 'Resources');
    const APP_ICO_PATH: string = join(RESOURCES_DIR, 'app.ico');

    try {
      if (!existsSync(RESOURCES_DIR)) {
        mkdirSync(RESOURCES_DIR, { recursive: true });
      }
      copyFileSync(ICON_PATH, APP_ICO_PATH);
      console.log(`FinalizeApp: Copied icon to ${APP_ICO_PATH}`);
    } catch (err) {
      console.error(`FinalizeApp Error: Failed to copy icon to ${APP_ICO_PATH}`, err);
    }

    import('rcedit')
      .then((moduleValue: ModuleLikeValue) => {
        const rcedit: RcEditFn = resolveRcEdit(moduleValue);
        const launcherPath: string = join(APP.appFolder, 'bin', 'launcher.exe');
        const bunExePath: string = join(APP.appFolder, 'bin', 'bun.exe');

        const rceditPromises: Promise<void>[] = [];
        const rceditOptions: RcEditOptions = {
          icon: ICON_PATH,
          'version-string': {
            ['ProductName']: DESKTOP_DISPLAY_NAME,
            ['FileDescription']: DESKTOP_DISPLAY_NAME,
          },
        };

        if (existsSync(launcherPath)) {
          console.log(`FinalizeApp: Embedding icon and metadata into launcher -> ${launcherPath}`);
          rceditPromises.push(rcedit(launcherPath, rceditOptions));
        }

        if (existsSync(bunExePath)) {
          console.log(`FinalizeApp: Embedding icon and metadata into bun -> ${bunExePath}`);
          rceditPromises.push(rcedit(bunExePath, rceditOptions));
        }

        if (rceditPromises.length > 0) {
          Promise.all(rceditPromises)
            .then(() => {
              console.log('FinalizeApp: Successfully applied application icons and metadata.');
            })
            .catch((err) => {
              console.error('FinalizeApp Error: Failed to apply icons/metadata!', err);
            });
        }
      })
      .catch((err) => {
        console.error('FinalizeApp Error: rcedit module not found.', err);
      });
  }
} else if (TARGET_OS === 'mac') {
  const PLIST_PATH: string = join(APP.appFolder, 'Contents', 'Info.plist');

  if (existsSync(PLIST_PATH)) {
    try {
      let plistContent: string = readFileSync(PLIST_PATH, 'utf8');

      plistContent = plistContent.replace(
        /<key>CFBundleDisplayName<\/key>\s*<string>.*?<\/string>/,
        `<key>CFBundleDisplayName</key>\n\t<string>${DESKTOP_DISPLAY_NAME}</string>`,
      );

      plistContent = plistContent.replace(
        /<key>CFBundleName<\/key>\s*<string>.*?<\/string>/,
        `<key>CFBundleName</key>\n\t<string>${DESKTOP_DISPLAY_NAME}</string>`,
      );

      writeFileSync(PLIST_PATH, plistContent, 'utf8');
      console.log(
        `FinalizeApp: Patched Info.plist to use full name '${DESKTOP_DISPLAY_NAME}' for macOS.`,
      );
    } catch (error) {
      console.error('FinalizeApp: Could not patch Info.plist', error);
    }
  } else {
    console.warn(`FinalizeApp: Info.plist not found at ${PLIST_PATH}`);
  }
}
