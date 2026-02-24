import {
  existsSync,
  readdirSync,
  unlinkSync,
  createWriteStream,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  copyFileSync,
} from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

const buildDir: string = process.env.ELECTROBUN_BUILD_DIR as string;
const artifactDir: string = process.env.ELECTROBUN_ARTIFACT_DIR as string;
const targetOS: string | undefined = process.env.ELECTROBUN_OS;
const identifier: string =
  process.env.ELECTROBUN_APP_IDENTIFIER ||
  "com.github.enigma550.lenovomotofirmwaredownloader";
const desktopDisplayName: string = "Lenovo Moto Firmware Downloader";
const wmClass: string = "LenovoMotoFirmwareDown";

if (!buildDir) {
  process.exit(0);
}

// Extract channel from buildDir (e.g. build/stable-linux-x64/... -> stable)
let channel: string = "stable";
if (buildDir) {
  const match: RegExpMatchArray | null = buildDir.match(/\/([^/]+)-(?:linux|mac|win)-/);
  if (match && match[1]) {
    channel = match[1];
  }
}

// ---------------------------------------------------------------------------
// Linux: Package as AppImage
// ---------------------------------------------------------------------------
async function buildLinuxAppImage(): Promise<void> {
  if (!artifactDir) return;

  const appDirName: string | undefined = readdirSync(buildDir).find(
    (f: string) =>
      !f.endsWith(".tar.gz") &&
      !f.endsWith(".json") &&
      !f.endsWith(".AppImage") &&
      !f.endsWith(".zst"),
  );

  if (!appDirName) {
    console.warn(
      "FinalizeInstaller: No extracted app folder found to build AppImage.",
    );
    return;
  }

  const appDirParentPath: string = join(buildDir, appDirName);

  const resourcesDir: string = join(appDirParentPath, "Resources");
  let zstBundle: string = "";
  if (existsSync(resourcesDir)) {
    const found: string | undefined = readdirSync(resourcesDir).find((f: string) => f.endsWith(".tar.zst"));
    if (found) zstBundle = join(resourcesDir, found);
  }

  if (!zstBundle) {
    console.warn(
      "FinalizeInstaller: Skipped AppImage creation. No .tar.zst uncompressed payload found in Resources.",
    );
    return;
  }

  const stagingDir: string = join(buildDir, "_appimage-staging");
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, { recursive: true, force: true });
  }
  mkdirSync(stagingDir, { recursive: true });

  console.log(
    `FinalizeInstaller: Extracting app payload ${zstBundle} for AppImage...`,
  );
  try {
    execSync(`tar -xf "${zstBundle}" -C "${stagingDir}"`, { stdio: "inherit" });
  } catch (e: any) {
    console.error(
      "FinalizeInstaller: Failed to extract .tar.zst! You may be missing zstd.",
      e,
    );
    return;
  }

  const appDirPath: string = join(stagingDir, appDirName);

  let appVersion: string = "0.0.0";
  const versionJsonPath: string = join(appDirPath, "Resources", "version.json");
  if (existsSync(versionJsonPath)) {
    try {
      const vInfo: any = JSON.parse(readFileSync(versionJsonPath, "utf8"));
      if (vInfo.version) appVersion = vInfo.version;
    } catch {
      /* use default */
    }
  }

  // Prevent double hash in Linux file names
  let cleanVersion: string = appVersion.split("-")[0] || "0.0.0";

  let shortSha: string = "unknown";
  try {
    shortSha = execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    /* fallback if git fails */
  }

  const zigZstdPath: string = join(appDirPath, "bin", "zig-zstd");
  const bsPatchPath: string = join(appDirPath, "bin", "bspatch");
  if (existsSync(zigZstdPath)) {
    unlinkSync(zigZstdPath);
  }
  if (existsSync(bsPatchPath)) {
    unlinkSync(bsPatchPath);
  }

  const appRunContent: string = `#!/bin/sh
HERE="$(dirname "$(readlink -f "\${0}")")"
exec "\${HERE}/bin/launcher" --class="${desktopDisplayName}" "$@"
`;
  const appRunPath: string = join(appDirPath, "AppRun");
  writeFileSync(appRunPath, appRunContent, { mode: 0o755 });

  const possibleIcons: string[] = [
    join(appDirPath, "Resources", "appIcon.png"),
    join(appDirPath, "Resources", "app", "icon.png"),
  ];
  let iconFound: boolean = false;
  for (const iconPath of possibleIcons) {
    if (existsSync(iconPath)) {
      copyFileSync(iconPath, join(appDirPath, ".DirIcon"));
      copyFileSync(iconPath, join(appDirPath, `${identifier}.png`));

      const hicolorDir: string = join(
        appDirPath,
        "usr",
        "share",
        "icons",
        "hicolor",
        "256x256",
        "apps",
      );
      mkdirSync(hicolorDir, { recursive: true });
      copyFileSync(iconPath, join(hicolorDir, `${identifier}.png`));
      iconFound = true;
      break;
    }
  }

  const desktopFiles: string[] = readdirSync(appDirPath).filter((f: string) =>
    f.endsWith(".desktop"),
  );
  const targetDesktopName: string = `${identifier}.desktop`;

  for (const desktopFile of desktopFiles) {
    if (desktopFile !== targetDesktopName) {
      unlinkSync(join(appDirPath, desktopFile));
    }
  }
  const desktopFileContent: string = `[Desktop Entry]
Version=1.0
Type=Application
Name=${desktopDisplayName}
Comment=${desktopDisplayName} application
Exec=AppRun
Icon=${identifier}
Terminal=false
StartupWMClass=${wmClass}
Categories=Utility;
X-AppImage-Version=${cleanVersion}
`;
  writeFileSync(join(appDirPath, targetDesktopName), desktopFileContent);

  const isArm: boolean =
    process.arch === "arm64" || process.env.ELECTROBUN_ARCH === "arm64";
  const appImageArch: string = isArm ? "aarch64" : "x86_64";
  const fileArch: string = isArm ? "arm64" : "x64";
  const uruntimeName: string = `uruntime-appimage-dwarfs-${appImageArch}`;
  const uruntimePath: string = join(process.cwd(), uruntimeName);

  if (!existsSync(uruntimePath)) {
    console.log(`FinalizeInstaller: Downloading ${uruntimeName}...`);
    try {
      execSync(
        `curl -L -o "${uruntimePath}" "https://github.com/VHSgunzo/uruntime/releases/latest/download/${uruntimeName}"`,
        { stdio: "inherit" },
      );
      execSync(`chmod +x "${uruntimePath}"`);
    } catch (error: any) {
      console.error("FinalizeInstaller: Failed to download uruntime.", error);
      return;
    }
  }

  const nameBase: string = "LMFD";
  const appImageOutName: string = `${channel}-linux-${fileArch}-v${cleanVersion}-${shortSha}-${nameBase}.AppImage`;
  const appImageOutPath: string = join(artifactDir, appImageOutName);
  const dwarfsImagePath: string = join(
    stagingDir,
    `${nameBase}-${appImageArch}.dwarfs`,
  );

  console.log(
    `FinalizeInstaller: Building DwarFS AppImage ${appImageOutName}...`,
  );
  try {
    execSync(
      `"${uruntimePath}" --appimage-mkdwarfs -i "${appDirPath}" -o "${dwarfsImagePath}"`,
      {
        stdio: "inherit",
      },
    );

    execSync(
      `cat "${uruntimePath}" "${dwarfsImagePath}" > "${appImageOutPath}"`,
      {
        stdio: "inherit",
      },
    );
    execSync(`chmod +x "${appImageOutPath}"`);

    const zsyncPattern: string = `${channel}-linux-${fileArch}-v*-*-${nameBase}.AppImage.zsync`;

    let updateInfo: string = "";
    if (channel === "stable") {
      updateInfo = `gh-releases-zsync|enigma550|LenovoMotoFirmwareDownloader|latest|${zsyncPattern}`;
    } else if (channel === "canary") {
      updateInfo = `gh-releases-zsync|enigma550|LenovoMotoFirmwareDownloader|latest-pre|${zsyncPattern}`;
    }

    if (updateInfo) {
      execSync(
        `TARGET_APPIMAGE="${appImageOutPath}" "${uruntimePath}" --appimage-addupdinfo "${updateInfo}"`,
        {
          stdio: "inherit",
        },
      );
    }

    if (channel === "stable" || channel === "canary") {
      const hasZsyncMake: boolean = (() => {
        try {
          execSync("command -v zsyncmake >/dev/null 2>&1", { stdio: "ignore" });
          return true;
        } catch {
          return false;
        }
      })();

      if (hasZsyncMake) {
        // We strictly define the output path so it ends up in the artifacts folder
        execSync(`zsyncmake -o "${appImageOutPath}.zsync" "${appImageOutPath}"`, {
          stdio: "inherit",
        });
        console.log(
          `FinalizeInstaller: Generated zsync metadata -> ${appImageOutPath}.zsync`,
        );
      }

      const oldArtifacts: string[] = readdirSync(artifactDir).filter(
        (f: string) => f.endsWith(".tar.gz") || f.endsWith(".tar.zst") || f.endsWith(".json") || f.endsWith(".patch")
      );
      for (const f of oldArtifacts) {
        unlinkSync(join(artifactDir, f));
      }
    }
  } catch (error: any) {
    console.error("FinalizeInstaller: Failed to build AppImage.", error);
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
  const iconPath: string = join(process.cwd(), "assets/icons/windows-icon.ico");

  if (!existsSync(iconPath)) {
    console.error("FinalizeInstaller Error: Icon not found at", iconPath);
    process.exit(1);
  }

  const buildFiles: string[] = readdirSync(buildDir);
  const setupExeName: string | undefined = buildFiles.find(
    (f: string) => f.includes("-Setup") && f.endsWith(".exe"),
  );

  if (!setupExeName) {
    console.warn("FinalizeInstaller: No Setup.exe found in build dir.");
    process.exit(0);
  }

  const setupExePath: string = join(buildDir, setupExeName);
  const setupStem: string = setupExeName.replace(".exe", "");
  const metadataPath: string = join(buildDir, `${setupStem}.metadata.json`);
  const archivePath: string = join(buildDir, `${setupStem}.tar.zst`);

  // We MUST leave metadata.json alone! 
  // Electrobun's self-extractor strictly uses metadata.name to find the 
  // extracted folder name (LMFD-canary). Changing it breaks installation.

  const m: any = await import("rcedit");
  const rcedit: any = (m as any).rcedit || (m as any).default || m;

  // We still patch the EXE so hovering over it and Task Manager shows the full name
  const rceditOptions: any = {
    icon: iconPath,
    "version-string": {
      ProductName: desktopDisplayName,
      FileDescription: `${desktopDisplayName} Setup`,
    }
  };

  console.log(`FinalizeInstaller: Patching -> ${setupExePath}`);
  await rcedit(setupExePath, rceditOptions);
  console.log(`FinalizeInstaller: Successfully patched ${setupExeName} ✨`);

  if (!artifactDir) return;

  const artifactZipName: string | undefined = readdirSync(artifactDir).find(
    (f: string) => f.includes("-Setup") && f.endsWith(".zip"),
  );

  if (!artifactZipName) {
    console.warn(
      "FinalizeInstaller: No Setup.zip found in artifacts to re-package.",
    );
    return;
  }

  const artifactZipPath: string = join(artifactDir, artifactZipName);
  console.log(
    `FinalizeInstaller: Re-zipping ${artifactZipName} with patched exe...`,
  );

  unlinkSync(artifactZipPath);

  const archiverModule: any = await import("archiver");
  const archiver: any = archiverModule.default;
  const output: import("fs").WriteStream = createWriteStream(artifactZipPath);
  const archive: any = archiver("zip", { zlib: { level: 9 } });

  await new Promise<void>((resolve, reject) => {
    output.on("close", () => {
      console.log(
        `FinalizeInstaller: Re-zipped ${artifactZipName} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB) ✨`,
      );
      resolve();
    });
    archive.on("error", reject);
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
  if (targetOS === "linux") {
    await buildLinuxAppImage();
  } else if (targetOS === "win") {
    await patchWindowsInstaller();
  }
}

main().catch((err: any) => {
  console.error("FinalizeInstaller: Failed:", err);
  process.exit(1);
});