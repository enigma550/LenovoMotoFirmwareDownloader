import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

const buildDir: string | undefined = process.env.ELECTROBUN_BUILD_DIR;
const targetOS: string | undefined = process.env.ELECTROBUN_OS;
const envAppName: string | undefined = process.env.ELECTROBUN_APP_NAME;
const identifier: string =
    process.env.ELECTROBUN_APP_IDENTIFIER || "com.github.enigma550.lenovomotofwdl";
const desktopDisplayName: string = "Lenovo Moto Firmware Downloader";

const wmClass: string = "LenovoMotoFirmwareDown";
const originalWmClass: string = "ElectrobunKitchenSink-dev";

if (!buildDir) {
    process.exit(0);
}

const pickAppFolder = (): { appFolder: string; appName: string } | null => {
    const launcherName: string = targetOS === "win" ? "launcher.exe" : "launcher";

    const checkFolder = (folderPath: string): boolean => {
        if (existsSync(join(folderPath, "bin", launcherName))) return true;
        if (existsSync(join(folderPath, "Contents", "MacOS", launcherName))) return true;
        return false;
    };

    const directMatch: string | null = envAppName ? join(buildDir, envAppName) : null;
    const directMatchApp: string | null = envAppName ? join(buildDir, `${envAppName}.app`) : null;

    if (directMatch && existsSync(directMatch) && checkFolder(directMatch)) {
        return { appFolder: directMatch, appName: envAppName! };
    }

    if (directMatchApp && existsSync(directMatchApp) && checkFolder(directMatchApp)) {
        return { appFolder: directMatchApp, appName: envAppName! };
    }

    const candidates: string[] = readdirSync(buildDir, { withFileTypes: true })
        .filter((entry: unknown) => entry.isDirectory())
        .map((entry: unknown) => entry.name)
        .filter((name: string) => checkFolder(join(buildDir, name)));

    if (candidates.length === 1) {
        const name: string = candidates[0]!;
        return { appFolder: join(buildDir, name), appName: envAppName || name.replace(".app", "") };
    }

    return null;
};

const patchLinuxWrapper = (appFolder: string): void => {
    const wrapperPath: string = join(appFolder, "bin", "libNativeWrapper.so");
    if (!existsSync(wrapperPath)) {
        console.warn(`Skipping WMClass patch: no wrapper found at ${wrapperPath}.`);
        return;
    }

    const encoder: TextEncoder = new TextEncoder();
    const original: Uint8Array = encoder.encode(originalWmClass);
    const replacement: Uint8Array = new Uint8Array(original.length);
    const classBytes: Uint8Array = encoder.encode(wmClass);

    if (classBytes.length > original.length) {
        console.warn(`WMClass '${wmClass}' is too long. Truncating to ${original.length} chars.`);
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
        console.warn(
            `Skipping WMClass patch: '${originalWmClass}' was not found in ${wrapperPath}.`,
        );
        return;
    }

    binary.set(replacement, offset);
    writeFileSync(wrapperPath, binary);
    const patchedName: string = new TextDecoder().decode(classBytes.length > original.length ? classBytes.subarray(0, original.length) : classBytes);
    console.log(`Patched WMClass in ${wrapperPath} -> ${patchedName}`);
};

const patchDesktopEntry = (appFolder: string): void => {
    const desktopFiles: string[] = readdirSync(appFolder).filter((f: string) => f.endsWith(".desktop"));
    const targetDesktopName: string = `${identifier}.desktop`;

    if (desktopFiles.length === 0) {
        console.warn(`Skipping desktop entry patch: no .desktop file found in ${appFolder}. Creating one.`);
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
Name=${desktopDisplayName}
Comment=${desktopDisplayName} application
Exec=AppRun
Icon=${identifier}
Terminal=false
StartupWMClass=${wmClass}
Categories=Utility;Application;
`;

    writeFileSync(join(appFolder, targetDesktopName), desktopFileContent);
    console.log(`Patched desktop entry for AppImage: ${targetDesktopName}`);
};

const writeLinuxScripts = (appFolder: string, appName: string): void => {
    const iconSource: string = join(appFolder, "Resources", "app", "icon.png");
    if (existsSync(iconSource)) {
        copyFileSync(iconSource, join(appFolder, ".DirIcon"));
        copyFileSync(iconSource, join(appFolder, `${identifier}.png`));
        console.log("Copied icons to AppDir root for AppImage generation.");
    } else {
        console.warn(`Icon source not found at ${iconSource}`);
    }
};

const app: { appFolder: string; appName: string } | null = pickAppFolder();
if (!app) {
    throw new Error(
        `Could not find app folder in ${buildDir}. Tried ELECTROBUN_APP_NAME=${envAppName || "<empty>"}.`,
    );
}

console.log(`FinalizeApp: Processing ${targetOS}...`);

if (targetOS === "linux") {
    patchLinuxWrapper(app.appFolder);
    patchDesktopEntry(app.appFolder);
    writeLinuxScripts(app.appFolder, app.appName);
} else if (targetOS === "win") {
    const iconPath: string = join(process.cwd(), "assets/icons/windows-icon.ico");

    if (!existsSync(iconPath)) {
        console.error(`FinalizeApp Error: Icon not found at ${iconPath}`);
    } else {
        const resourcesDir: string = join(app.appFolder, "Resources");
        const appIcoPath: string = join(resourcesDir, "app.ico");

        try {
            if (!existsSync(resourcesDir)) {
                mkdirSync(resourcesDir, { recursive: true });
            }
            copyFileSync(iconPath, appIcoPath);
            console.log(`FinalizeApp: Copied icon to ${appIcoPath}`);
        } catch (err: unknown) {
            console.error(`FinalizeApp Error: Failed to copy icon to ${appIcoPath}`, err);
        }

        import("rcedit").then((m: unknown) => {
            const rcedit: unknown = (m as unknown).rcedit || (m as unknown).default || m;
            const launcherPath: string = join(app.appFolder, "bin", "launcher.exe");
            const bunExePath: string = join(app.appFolder, "bin", "bun.exe");

            const rceditPromises: Promise<void>[] = [];
            const rceditOptions: unknown = {
                icon: iconPath,
                "version-string": {
                    ProductName: desktopDisplayName,
                    FileDescription: desktopDisplayName,
                }
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
                        console.log("FinalizeApp: Successfully applied application icons and metadata.");
                    })
                    .catch((err: unknown) => {
                        console.error("FinalizeApp Error: Failed to apply icons/metadata!", err);
                    });
            }
        }).catch((err: unknown) => {
            console.error("FinalizeApp Error: rcedit module not found.", err);
        });
    }
} else if (targetOS === "mac") {
    const plistPath: string = join(app.appFolder, "Contents", "Info.plist");

    if (existsSync(plistPath)) {
        try {
            let plistContent: string = readFileSync(plistPath, "utf8");

            plistContent = plistContent.replace(
                /<key>CFBundleDisplayName<\/key>\s*<string>.*?<\/string>/,
                `<key>CFBundleDisplayName</key>\n\t<string>${desktopDisplayName}</string>`
            );

            plistContent = plistContent.replace(
                /<key>CFBundleName<\/key>\s*<string>.*?<\/string>/,
                `<key>CFBundleName</key>\n\t<string>${desktopDisplayName}</string>`
            );

            writeFileSync(plistPath, plistContent, "utf8");
            console.log(`FinalizeApp: Patched Info.plist to use full name '${desktopDisplayName}' for macOS.`);
        } catch (error: unknown) {
            console.error("FinalizeApp: Could not patch Info.plist", error);
        }
    } else {
        console.warn(`FinalizeApp: Info.plist not found at ${plistPath}`);
    }
}