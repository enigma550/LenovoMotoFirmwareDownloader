import { rmSync, renameSync, existsSync } from "fs";
import { execSync } from "child_process";

/**
 * launch-dev.ts
 * 
 * Replicates the original 'git origin' build flow but with added protection 
 * against Windows file locks (EPERM/EBUSY) when multiple instances are running.
 */

console.log("\n[DevLauncher] Starting development flow...\n");

// 0. Release ADB lock
// If ADB is running from the build/ folder, it will lock the directory.
console.log("[0/3] Stopping ADB server to release folder locks...");
try {
    execSync("adb kill-server", { stdio: "ignore" });
} catch (e) {
    // Ignore if adb is not in PATH or not running
}

// 1. Build Angular frontend (Always prepare the views)
// This catches syntax errors and updates the /runtime/views folder.
console.log("[1/3] Preparing application views...");
try {
    execSync("bun run prepare:all", { stdio: "inherit" });
} catch (e: any) {
    console.error("\\n[Error] Angular build failed. Fix the errors and try again.\\n");
    process.exit(e.status || 1);
}

const launcherPath = "build/dev-win-x64/LenovoMotoFWDownloader-dev/bin/launcher.exe";
let canBuildNative = true;

// 2. Check if we can build the native Electrobun wrapper (the build/ folder)
if (existsSync("build")) {
    try {
        if (existsSync("build_trash")) {
            rmSync("build_trash", { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        }
        renameSync("build", "build_trash");
        // Cleanup in background
        rmSync("build_trash", { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (e: any) {
        // If we can't rename it, it's locked. 
        const isMissingBinary = !existsSync(launcherPath);

        if (isMissingBinary) {
            console.log("\n[Note] Launcher binary is missing but folder is locked. Attempting build anyway...");
            canBuildNative = true;
        } else {
            console.log(`\n[Lock] Could not move build/ folder: ${e.code}`);
            canBuildNative = false;
        }
    }
}

if (canBuildNative) {
    console.log("\n[2/3] Building native Electrobun app...\n");
    try {
        execSync("bunx electrobun build --env=dev", { stdio: "inherit" });
    } catch (e: any) {
        console.error("\n[Error] Native build failed. Usually because of a file lock or syntax error.");
        process.exit(1);
    }
} else {
    console.log("\n[2/3] Build folder is locked and app is present. Skipping build.\n");
}

// 3. Launch the application instance
console.log("[3/3] Launching application...\n");
try {
    execSync("bunx electrobun dev", { stdio: "inherit" });
} catch (e: any) {
    console.error("\n[Fatal] Application failed to launch.");
    process.exit(1);
}
