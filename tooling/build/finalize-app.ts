import {
  copyFileSync,
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { packageBundledRuntimeDependencies } from './runtime-dependency-packager.ts';

const BUILD_DIR: string | undefined = process.env.ELECTROBUN_BUILD_DIR;
const TARGET_OS: string | undefined = process.env.ELECTROBUN_OS;
const ENV_APP_NAME: string | undefined = process.env.ELECTROBUN_APP_NAME;
const IDENTIFIER: string =
  process.env.ELECTROBUN_APP_IDENTIFIER || 'com.github.enigma550.lenovomotofirmwaredownloader';
const DESKTOP_DISPLAY_NAME: string = 'Lenovo Moto Firmware Downloader';

const WM_CLASS: string = 'LenovoMotoFirmwareDown';
const ORIGINAL_WM_CLASS: string = 'ElectrobunKitchenSink-dev';

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

const PATCH_DESKTOP_ENTRY = (appFolder: string): void => {
  const desktopFiles: string[] = readdirSync(appFolder).filter((f: string) =>
    f.endsWith('.desktop'),
  );
  const targetDesktopName: string = `${IDENTIFIER}.desktop`;

  if (desktopFiles.length === 0) {
    console.warn(
      `Skipping desktop entry patch: no .desktop file found in ${appFolder}. Creating one.`,
    );
  }

  for (const desktopFile of desktopFiles) {
    if (desktopFile !== targetDesktopName) {
      unlinkSync(join(appFolder, desktopFile));
      console.log(`Removed old desktop file: ${desktopFile}`);
    }
  }

  const desktopFileContent: string = `[Desktop Entry]
Version=1.0
Type=Application
Name=${DESKTOP_DISPLAY_NAME}
Comment=${DESKTOP_DISPLAY_NAME} application
Exec=AppRun
Icon=${IDENTIFIER}
Terminal=false
StartupWMClass=${WM_CLASS}
Categories=Utility;Application;
`;

  writeFileSync(join(appFolder, targetDesktopName), desktopFileContent);
  console.log(`Patched desktop entry for AppImage: ${targetDesktopName}`);
};

const WRITE_LINUX_SCRIPTS = (appFolder: string): void => {
  const iconSource: string = join(appFolder, 'Resources', 'app', 'icon.png');
  if (existsSync(iconSource)) {
    copyFileSync(iconSource, join(appFolder, '.DirIcon'));
    copyFileSync(iconSource, join(appFolder, `${IDENTIFIER}.png`));
    console.log('Copied icons to AppDir root for AppImage generation.');
  } else {
    console.warn(`Icon source not found at ${iconSource}`);
  }
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
  PATCH_LINUX_WRAPPER(APP.appFolder);
  PATCH_DESKTOP_ENTRY(APP.appFolder);
  WRITE_LINUX_SCRIPTS(APP.appFolder);
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
