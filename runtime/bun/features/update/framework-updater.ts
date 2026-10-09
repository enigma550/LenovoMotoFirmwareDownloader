/**
 * Framework (packaged app) updater — extracted from the system RPC handlers so
 * the self-update flow has its own testable module and structured logging.
 *
 * Windows applies the update through a generated .bat script (the running exe
 * cannot replace itself); Linux/macOS rely on Electrobun's patch-based update.
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getLogger } from '../../../../core/common/logger.ts';
import type { FrameworkUpdateInfo } from '../../../../core/contracts/desktop/entries.ts';
import { cancelActiveRescue } from '../rescue/rescue-manager.ts';
import type { UpdateLogger } from './update-logger.ts';

const log = getLogger('updater');

type ElectrobunUpdater = typeof import('electrobun/bun').Updater;

/**
 * Lazy import: `electrobun/bun` has module-load side effects that only work
 * inside a packaged app, and source-mode updates never need it.
 */
async function loadUpdater(): Promise<ElectrobunUpdater> {
  const { Updater } = await import('electrobun/bun');
  return Updater;
}

export async function checkFrameworkUpdate(): Promise<FrameworkUpdateInfo> {
  const Updater = await loadUpdater();
  return await Updater.checkForUpdate();
}

export async function downloadFrameworkUpdate(): Promise<void> {
  const Updater = await loadUpdater();
  await Updater.downloadUpdate();
}

function escapeBatchPath(pathValue: string) {
  // Inside a .bat, `%` triggers environment expansion and `!` delayed expansion.
  return pathValue.replace(/\//g, '\\').replace(/%/g, '%%').replace(/!/g, '^^!');
}

export async function applyFrameworkUpdate(logger?: UpdateLogger): Promise<void> {
  logger?.info('Preparing to apply packaged app update. Cleaning up processes...');
  log.info('[Updater] Preparing to apply update. Cleaning up processes...');

  cancelActiveRescue();

  try {
    const { execSync } = await import('node:child_process');
    execSync('adb kill-server', { stdio: 'ignore' });
    log.info('[Updater] ADB server stopped.');
  } catch {
    // Ignore if adb is not in PATH or not running.
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  log.info(`[Updater] execPath: ${process.execPath}`);
  log.info(`[Updater] cwd: ${process.cwd()}`);

  const Updater = await loadUpdater();
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

  log.info(`[Updater] Extracting update to ${extractionDir}...`);
  logger?.info('Extracting update tarball', latestTarPath);
  const tarBytes = await Bun.file(latestTarPath).arrayBuffer();
  const archive = new Bun.Archive(tarBytes);
  await archive.extract(extractionDir);

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

  log.info(`[Updater] Identified New App Path: ${newAppBundlePath}`);
  log.info(`[Updater] Target App Path: ${runningAppBundlePath}`);

  const parentDir = appDataFolder;
  const updateScriptPath = join(parentDir, 'update.bat');
  const logPath = join(parentDir, 'update_log.txt');
  const launcherPath = join(runningAppBundlePath, 'bin', 'launcher.exe');

  const runningAppWin = escapeBatchPath(runningAppBundlePath);
  const newAppWin = escapeBatchPath(newAppBundlePath);
  const extractionDirWin = escapeBatchPath(extractionDir);
  const launcherPathWin = escapeBatchPath(launcherPath);
  const logPathWin = escapeBatchPath(logPath);

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
  logger?.info('Update script written', updateScriptPath);

  const { spawn } = await import('node:child_process');
  log.info(`[Updater] Launching update script: ${updateScriptPath}`);

  const child = spawn('cmd.exe', ['/c', 'start', '/min', 'cmd.exe', '/c', updateScriptPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  log.info('[Updater] Update script launched. Quitting app in 1s...');
  logger?.info('Update script launched; application will exit to let it run.');
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}
