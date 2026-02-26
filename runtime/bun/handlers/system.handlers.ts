import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Updater } from 'electrobun/bun';
import {
  checkDesktopIntegration,
  createDesktopIntegration,
  getAppInfo,
  getDesktopPromptPreference,
  setDesktopPromptPreference,
} from '../desktop-integration.ts';
import { installWindowsMtkDriverManually } from '../features/rescue/commands/windows-mtk-driver-installer.ts';
import {
  getWindowsQdloaderDriverStatus,
  installWindowsQdloaderDriverManually,
} from '../features/rescue/commands/windows-qdloader-driver-installer.ts';
import { installWindowsSpdDriverManually } from '../features/rescue/commands/windows-spd-driver-installer.ts';
import { cancelActiveRescue } from '../features/rescue/rescue-manager.ts';
import type { BunRpcRequestHandlers } from './types.ts';

export function createSystemHandlers(): Pick<
  BunRpcRequestHandlers,
  | 'checkDesktopIntegration'
  | 'createDesktopIntegration'
  | 'getDesktopPromptPreference'
  | 'setDesktopPromptPreference'
  | 'getAppInfo'
  | 'checkFrameworkUpdate'
  | 'downloadFrameworkUpdate'
  | 'applyFrameworkUpdate'
  | 'getWindowsQdloaderDriverStatus'
  | 'installWindowsQdloaderDriver'
  | 'installWindowsSpdDriver'
  | 'installWindowsMtkDriver'
> {
  return {
    checkDesktopIntegration: async () => {
      return checkDesktopIntegration();
    },
    createDesktopIntegration: async () => {
      return createDesktopIntegration();
    },
    getDesktopPromptPreference: async () => {
      return getDesktopPromptPreference();
    },
    setDesktopPromptPreference: async ({ ask }) => {
      return setDesktopPromptPreference(ask);
    },
    getAppInfo: async () => {
      return getAppInfo();
    },
    checkFrameworkUpdate: async () => {
      return await Updater.checkForUpdate();
    },
    downloadFrameworkUpdate: async () => {
      await Updater.downloadUpdate();
    },
    getWindowsQdloaderDriverStatus: async () => {
      return getWindowsQdloaderDriverStatus();
    },
    installWindowsQdloaderDriver: async () => {
      return installWindowsQdloaderDriverManually();
    },
    installWindowsSpdDriver: async () => {
      return installWindowsSpdDriverManually();
    },
    installWindowsMtkDriver: async () => {
      return installWindowsMtkDriverManually();
    },
    applyFrameworkUpdate: async () => {
      try {
        console.log('[Updater] Preparing to apply update. Cleaning up processes...');

        cancelActiveRescue();

        try {
          const { execSync } = await import('node:child_process');
          execSync('adb kill-server', { stdio: 'ignore' });
          console.log('[Updater] ADB server stopped.');
        } catch {
          // Ignore if adb is not in PATH or not running.
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));

        console.log(`[Updater] execPath: ${process.execPath}`);
        console.log(`[Updater] cwd: ${process.cwd()}`);

        await Updater.getLocallocalInfo();
        const updateResult = await Updater.checkForUpdate();
        const latestHash = updateResult.hash;
        const appDataFolder = await Updater.appDataFolder();
        const extractionFolder = join(appDataFolder, 'self-extraction');
        const latestTarPath = join(extractionFolder, `${latestHash}.tar`);

        if (!(await Bun.file(latestTarPath).exists())) {
          throw new Error(`Latest tar not found at ${latestTarPath}`);
        }

        const extractionDir = join(extractionFolder, `temp-${latestHash}`);
        if (!existsSync(extractionDir)) {
          mkdirSync(extractionDir, { recursive: true });
        }

        console.log(`[Updater] Extracting update to ${extractionDir}...`);
        const tarBytes = await Bun.file(latestTarPath).arrayBuffer();
        const archive = new Bun.Archive(tarBytes);
        await archive.extract(extractionDir);

        const { readdirSync, statSync } = await import('node:fs');
        const extractedFiles = readdirSync(extractionDir);
        const appBundleDir = extractedFiles.find((file) => {
          const filePath = join(extractionDir, file);
          return statSync(filePath).isDirectory() && !file.startsWith('temp-');
        });

        if (!appBundleDir) {
          throw new Error(`Could not find app bundle in extracted files at ${extractionDir}`);
        }

        const newAppBundlePath = join(extractionDir, appBundleDir);
        const runningAppBundlePath = join(appDataFolder, 'app');

        console.log(`[Updater] Identified New App Path: ${newAppBundlePath}`);
        console.log(`[Updater] Target App Path: ${runningAppBundlePath}`);

        const parentDir = appDataFolder;
        const updateScriptPath = join(parentDir, 'update.bat');
        const logPath = join(parentDir, 'update_log.txt');
        const launcherPath = join(runningAppBundlePath, 'bin', 'launcher.exe');

        const runningAppWin = runningAppBundlePath.replace(/\//g, '\\');
        const newAppWin = newAppBundlePath.replace(/\//g, '\\');
        const extractionDirWin = extractionDir.replace(/\//g, '\\');
        const launcherPathWin = launcherPath.replace(/\//g, '\\');
        const logPathWin = logPath.replace(/\//g, '\\');

        const updateScript = `@echo off
echo Starting update at %DATE% %TIME% > "${logPathWin}"
echo Running App Dir: "${runningAppWin}" >> "${logPathWin}"
echo New App Dir: "${newAppWin}" >> "${logPathWin}"

echo Waiting for processes to exit... >> "${logPathWin}"

:waitloop
tasklist /FI "IMAGENAME eq launcher.exe" 2>NUL | find /I /N "launcher.exe" >NUL
if "%ERRORLEVEL%"=="0" (
    echo [WAIT] launcher.exe is still running... >> "${logPathWin}"
    timeout /t 1 /nobreak >nul
    goto waitloop
)

:bunloop
tasklist /FI "IMAGENAME eq bun.exe" 2>NUL | find /I /N "bun.exe" >NUL
if "%ERRORLEVEL%"=="0" (
    echo [WAIT] bun.exe is still running... >> "${logPathWin}"
    timeout /t 1 /nobreak >nul
    goto bunloop
)

echo Killing background tasks and orphaned renderers... >> "${logPathWin}"
:: Note: This kills ALL msedgewebview2 processes on the system. It's aggressive but ensures the bin folder is released.
taskkill /F /IM adb.exe /T >> "${logPathWin}" 2>&1
taskkill /F /IM fastboot.exe /T >> "${logPathWin}" 2>&1
taskkill /F /IM msedgewebview2.exe /T >> "${logPathWin}" 2>&1

echo Files released. Starting robust replacement with Robocopy... >> "${logPathWin}"
echo [INFO] Robocopy will handle retries automatically if files are briefly locked. >> "${logPathWin}"
timeout /t 5 /nobreak >nul

:: Robocopy /MIR ensures the target matches the source exactly.
:: /R:10 /W:3 tells it to retry 10 times with 3 seconds wait on locks.
robocopy "${newAppWin}" "${runningAppWin}" /MIR /IS /IT /R:10 /W:3 >> "${logPathWin}" 2>&1

:: Robocopy exit codes 0-7 are varying degrees of success. 8+ is failure.
if %ERRORLEVEL% GEQ 8 (
    echo [ERROR] Robocopy failed with exit code %ERRORLEVEL%. >> "${logPathWin}"
    echo [TIP] Close all File Explorers, Terminals, or IDEs that might be looking into the AppData folder. >> "${logPathWin}"
    goto finish
)

echo [SUCCESS] Files replaced successfully. >> "${logPathWin}"

echo [STEP] Cleaning up extraction directory... >> "${logPathWin}"
rmdir /s /q "${extractionDirWin}" >> "${logPathWin}" 2>&1

echo [STEP] Launching new version: "${launcherPathWin}" >> "${logPathWin}"
start "" "${launcherPathWin}" >> "${logPathWin}" 2>&1

:finish
echo Update script finished at %DATE% %TIME%. >> "${logPathWin}"
(goto) 2>nul & del "%~f0"
`;

        await Bun.write(updateScriptPath, updateScript);

        const { spawn } = await import('node:child_process');
        console.log(`[Updater] Launching update script: ${updateScriptPath}`);

        const child = spawn('cmd.exe', ['/c', 'start', '/min', 'cmd.exe', '/c', updateScriptPath], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();

        console.log('[Updater] Update script launched. Quitting app in 1s...');
        setTimeout(() => {
          process.exit(0);
        }, 1000);
      } catch (error) {
        console.error('[Updater] Failed to apply update manually:', error);
        throw error;
      }
    },
  };
}
