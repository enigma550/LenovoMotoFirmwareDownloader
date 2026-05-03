import { execSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

const BUILD_DIR: string = resolve(process.env.ELECTROBUN_BUILD_DIR as string);
const ARTIFACT_DIR: string = resolve(process.env.ELECTROBUN_ARTIFACT_DIR as string);
const TARGET_OS: string | undefined = process.env.ELECTROBUN_OS;
const IDENTIFIER: string =
  process.env.ELECTROBUN_APP_IDENTIFIER || 'com.github.enigma550.lenovomotofirmwaredownloader';
const DESKTOP_DISPLAY_NAME: string = 'Lenovo Moto Firmware Downloader';
const WM_CLASS: string = 'LenovoMotoFirmwareDown';
const APPIMAGE_SCRIPT_PATH: string = resolve(
  process.cwd(),
  'tooling',
  'build',
  'appimage',
  'make-appimage.sh',
);

type RcEditOptions = {
  icon: string;
  'version-string': Record<'ProductName' | 'FileDescription', string>;
};

type RcEditFn = (executablePath: string, options: RcEditOptions) => Promise<void>;

type ArchiverInstance = {
  pointer: () => number;
  on: (event: 'error', listener: (error: Error) => void) => ArchiverInstance;
  pipe: (stream: import('fs').WriteStream) => ArchiverInstance;
  file: (filename: string, data: { name: string }) => ArchiverInstance;
  finalize: () => Promise<void>;
};

type ArchiverFactory = (format: 'zip', options: { zlib: { level: number } }) => ArchiverInstance;

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

function resolveArchiver(moduleValue: ModuleLikeValue): ArchiverFactory {
  const record = asRecord(moduleValue);
  const candidate = record?.['default'] ?? moduleValue;
  if (typeof candidate !== 'function') {
    throw new Error('archiver module did not export a callable factory.');
  }
  return candidate as ArchiverFactory;
}

if (!BUILD_DIR) {
  process.exit(0);
}

if (process.env.ELECTROBUN_SKIP_POSTPACKAGE === '1') {
  console.log('FinalizeInstaller: Skipping postPackage work (ELECTROBUN_SKIP_POSTPACKAGE=1).');
  process.exit(0);
}

// Extract channel from buildDir (e.g. build/stable-linux-x64/... -> stable)
let channel: string = 'stable';
if (BUILD_DIR) {
  const MATCH: RegExpMatchArray | null = BUILD_DIR.match(/\/([^/]+)-(?:linux|mac|win)-/);
  if (MATCH?.[1]) {
    channel = MATCH[1];
  }
}

// ---------------------------------------------------------------------------
// Linux: Package as AppImage
// ---------------------------------------------------------------------------
async function buildLinuxAppImage(): Promise<void> {
  if (!ARTIFACT_DIR) return;
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const appDirName: string | undefined = readdirSync(BUILD_DIR).find(
    (f: string) =>
      !f.endsWith('.tar.gz') &&
      !f.endsWith('.json') &&
      !f.endsWith('.AppImage') &&
      !f.endsWith('.zst'),
  );

  if (!appDirName) {
    console.warn('FinalizeInstaller: No extracted app folder found to build AppImage.');
    return;
  }

  const appDirParentPath: string = join(BUILD_DIR, appDirName);

  const resourcesDir: string = join(appDirParentPath, 'Resources');
  let zstBundle: string = '';
  if (existsSync(resourcesDir)) {
    const found: string | undefined = readdirSync(resourcesDir).find((f: string) =>
      f.endsWith('.tar.zst'),
    );
    if (found) zstBundle = join(resourcesDir, found);
  }

  const stagingDir: string = join(BUILD_DIR, '_appimage-staging');
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, { recursive: true, force: true });
  }
  mkdirSync(stagingDir, { recursive: true });

  const appDirPath: string = join(stagingDir, appDirName);
  if (zstBundle) {
    console.log(`FinalizeInstaller: Extracting app payload ${zstBundle} for AppImage...`);
    try {
      execSync(`tar -xf "${zstBundle}" -C "${stagingDir}"`, {
        stdio: 'inherit',
      });
    } catch (e) {
      console.error('FinalizeInstaller: Failed to extract .tar.zst! You may be missing zstd.', e);
      return;
    }
  } else {
    console.log(
      'FinalizeInstaller: No .tar.zst payload found; staging app bundle directly for AppImage.',
    );
    try {
      execSync(`cp -a "${appDirParentPath}" "${stagingDir}/"`, {
        stdio: 'inherit',
      });
    } catch (e) {
      console.error('FinalizeInstaller: Failed to stage app bundle for AppImage creation.', e);
      return;
    }
  }

  if (existsSync(join(appDirPath, 'Info.plist'))) {
    rmSync(join(appDirPath, 'Info.plist'), { force: true });
  }

  let appVersion: string = '0.0.0';
  const versionJsonPath: string = join(appDirPath, 'Resources', 'version.json');
  if (existsSync(versionJsonPath)) {
    try {
      const parsed: { version?: string | null } = JSON.parse(readFileSync(versionJsonPath, 'utf8'));
      if (typeof parsed.version === 'string' && parsed.version.trim()) {
        appVersion = parsed.version;
      }
    } catch {
      /* use default */
    }
  }

  // Prevent double hash in Linux file names
  const cleanVersion: string = appVersion.split('-')[0] || '0.0.0';

  let shortSha: string = 'nogit';
  try {
    shortSha = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    const githubSha: string = (process.env.GITHUB_SHA || '').trim();
    if (githubSha) {
      shortSha = githubSha.slice(0, 7);
    }
  }

  const isArm: boolean = process.arch === 'arm64' || process.env.ELECTROBUN_ARCH === 'arm64';
  const appImageArch: string = isArm ? 'aarch64' : 'x86_64';
  const fileArch: string = isArm ? 'arm64' : 'x64';
  const nameBase: string = 'LMFD';
  const appImageOutName: string = `${channel}-anylinux-${fileArch}-v${cleanVersion}-${shortSha}-${nameBase}.AppImage`;
  const finalAppImagePath: string = join(ARTIFACT_DIR, appImageOutName);
  const tempAppImageOutName: string = `${appImageOutName}.tmp`;
  const tempAppImagePath: string = join(ARTIFACT_DIR, tempAppImageOutName);
  const zsyncPattern: string = `${channel}-anylinux-${fileArch}-v*-*-${nameBase}.AppImage.zsync`;

  let updateInfo: string = '';
  if (channel === 'stable') {
    updateInfo = `gh-releases-zsync|enigma550|LenovoMotoFirmwareDownloader|latest|${zsyncPattern}`;
  } else if (channel === 'canary') {
    updateInfo = `gh-releases-zsync|enigma550|LenovoMotoFirmwareDownloader|latest|${zsyncPattern}`;
  }

  console.log(`FinalizeInstaller: Building AnyLinux AppImage ${appImageOutName}...`);
  try {
    if (existsSync(tempAppImagePath)) {
      unlinkSync(tempAppImagePath);
    }

    if (existsSync(finalAppImagePath)) {
      renameSync(finalAppImagePath, `${finalAppImagePath}.previous`);
    }

    execSync(`bash ${JSON.stringify(APPIMAGE_SCRIPT_PATH)}`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ['APPDIR']: appDirPath,
        ['ARCH']: appImageArch,
        ['OUTPATH']: ARTIFACT_DIR,
        ['OUTNAME']: tempAppImageOutName,
        ['UPINFO']: updateInfo,
        ['MAIN_BIN']: 'launcher',
        ['VERSION']: cleanVersion,
        ['DESKTOP_NAME']: DESKTOP_DISPLAY_NAME,
        ['APP_IDENTIFIER']: IDENTIFIER,
        ['WM_CLASS']: WM_CLASS,
      },
    });

    if (existsSync(finalAppImagePath)) {
      unlinkSync(finalAppImagePath);
    }

    renameSync(tempAppImagePath, finalAppImagePath);

    const oldArtifacts: string[] = readdirSync(ARTIFACT_DIR).filter(
      (f: string) =>
        f.endsWith('.tar.gz') ||
        f.endsWith('.tar.zst') ||
        f.endsWith('.json') ||
        f.endsWith('.patch'),
    );
    for (const f of oldArtifacts) {
      unlinkSync(join(ARTIFACT_DIR, f));
    }
  } catch (error) {
    console.error('FinalizeInstaller: Failed to build AnyLinux AppImage.', error);
    throw error;
  } finally {
    if (existsSync(stagingDir)) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Windows: patch Setup.exe icon with rcedit, then re-zip the artifact.
// ---------------------------------------------------------------------------
async function patchWindowsInstaller(): Promise<void> {
  const iconPath: string = join(process.cwd(), 'assets/icons/windows-icon.ico');

  if (!existsSync(iconPath)) {
    console.error('FinalizeInstaller Error: Icon not found at', iconPath);
    process.exit(1);
  }

  const buildFiles: string[] = readdirSync(BUILD_DIR);
  const setupExeName: string | undefined = buildFiles.find(
    (f: string) => f.includes('-Setup') && f.endsWith('.exe'),
  );

  if (!setupExeName) {
    console.warn('FinalizeInstaller: No Setup.exe found in build dir.');
    process.exit(0);
  }

  const setupExePath: string = join(BUILD_DIR, setupExeName);
  const setupStem: string = setupExeName.replace('.exe', '');
  const metadataPath: string = join(BUILD_DIR, `${setupStem}.metadata.json`);
  const archivePath: string = join(BUILD_DIR, `${setupStem}.tar.zst`);

  // We MUST leave metadata.json alone!
  // Electrobun's self-extractor strictly uses metadata.name to find the
  // extracted folder name (LMFD-canary). Changing it breaks installation.

  const rceditModule: ModuleLikeValue = await import('rcedit');
  const rcedit: RcEditFn = resolveRcEdit(rceditModule);

  // We still patch the EXE so hovering over it and Task Manager shows the full name
  const rceditOptions: RcEditOptions = {
    icon: iconPath,
    'version-string': {
      ['ProductName']: DESKTOP_DISPLAY_NAME,
      ['FileDescription']: `${DESKTOP_DISPLAY_NAME} Setup`,
    },
  };

  console.log(`FinalizeInstaller: Patching -> ${setupExePath}`);
  await rcedit(setupExePath, rceditOptions);
  console.log(`FinalizeInstaller: Successfully patched ${setupExeName} ✨`);

  if (!ARTIFACT_DIR) return;

  const artifactZipName: string | undefined = readdirSync(ARTIFACT_DIR).find(
    (f: string) => f.includes('-Setup') && f.endsWith('.zip'),
  );

  if (!artifactZipName) {
    console.warn('FinalizeInstaller: No Setup.zip found in artifacts to re-package.');
    return;
  }

  const artifactZipPath: string = join(ARTIFACT_DIR, artifactZipName);
  console.log(`FinalizeInstaller: Re-zipping ${artifactZipName} with patched exe...`);

  unlinkSync(artifactZipPath);

  const archiverModule: ModuleLikeValue = await import('archiver');
  const createArchive: ArchiverFactory = resolveArchiver(archiverModule);
  const output: import('fs').WriteStream = createWriteStream(artifactZipPath);
  const archive: ArchiverInstance = createArchive('zip', {
    zlib: { level: 9 },
  });

  await new Promise<void>((resolve, reject) => {
    output.on('close', () => {
      console.log(
        `FinalizeInstaller: Re-zipped ${artifactZipName} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB) ✨`,
      );
      resolve();
    });
    archive.on('error', reject);
    archive.pipe(output);

    archive.file(setupExePath, { name: basename(setupExePath) });

    if (existsSync(metadataPath)) {
      archive.file(metadataPath, {
        name: `.installer/${basename(metadataPath)}`,
      });
    }
    if (existsSync(archivePath)) {
      archive.file(archivePath, {
        name: `.installer/${basename(archivePath)}`,
      });
    }

    archive.finalize();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  if (TARGET_OS === 'linux') {
    await buildLinuxAppImage();
  } else if (TARGET_OS === 'win') {
    await patchWindowsInstaller();
  }
}

main().catch((err) => {
  console.error('FinalizeInstaller: Failed:', err);
  process.exit(1);
});
