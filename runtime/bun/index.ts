import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { BrowserView, BrowserWindow, BuildConfig, Utils } from "electrobun/bun";
import { bootstrapSessionCookie } from "../../core/infra/lmsa/api.ts";
import { loadConfig } from "../../core/infra/config.ts";
import {
  authenticateWithWustToken,
  extractWustToken,
  openLoginBrowser,
} from "../../core/features/auth/login.ts";
import {
  getModelCatalog,
  refreshModelCatalogFromApi,
} from "../../core/features/catalog/model-catalog.ts";
import {
  discoverCountryOptionsForCatalogModel,
  fetchFirmwareVariantsForCatalogModel,
} from "../../core/features/firmware/catalog-manual-match.ts";
import {
  fetchFirmwareByImeiForModel,
  fetchFirmwareBySnForModel,
  fetchReadSupportFirmwareForModel,
  getReadSupportRequiredParameters,
} from "../../core/features/firmware/read-support-lookup.ts";
import type {
  AttachLocalRecipeFromModelRequest,
  AttachLocalRecipeMetadataRequest,
  AttachLocalRecipeResponse,
  AuthCompleteRequest,
  CancelDownloadRequest,
  ConnectedLookupResponse,
  DesktopApi,
  DesktopRpcSchema,
  DiscoverCountryOptionsRequest,
  DownloadFirmwareRequest,
  DownloadProgressMessage,
  ExtractLocalFirmwareRequest,
  GetCatalogModelsRequest,
  LocalDownloadedFilesResponse,
  LookupCatalogManualRequest,
  LookupReadSupportByImeiRequest,
  LookupReadSupportByParamsRequest,
  LookupReadSupportBySnRequest,
  ReadSupportHintsRequest,
  RescueLiteFirmwareFromLocalRequest,
  RescueLiteFirmwareRequest,
} from "../shared/rpc.ts";
import { cleanupLinuxCefProfileLocks } from "./cef-profile.ts";
import {
  isValidLmsaSerialNumber,
  lookupConnectedDeviceFirmware,
} from "./connected-lookup.ts";
import {
  cancelActiveDownload,
  downloadFirmwareWithProgress,
  pauseActiveDownload,
  resumePausedDownload,
} from "./download-manager.ts";
import {
  attachLocalRecipeMetadata,
  attachLocalRecipeFromModel,
  deleteLocalFile,
  listLocalDownloadedFiles,
} from "./local-downloads.ts";
import {
  cancelActiveRescue,
  extractLocalFirmwarePackage,
  rescueLiteFirmwareWithProgress,
} from "./features/rescue/rescue-manager.ts";
import { openExternalUrl } from "./browser";
import {
  type AppInfo,
  checkDesktopIntegration,
  createDesktopIntegration,
  getDesktopPromptPreference,
  setDesktopPromptPreference,
  getAppInfo,
} from "./desktop-integration.ts";
import { Updater } from "electrobun/bun";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const DOWNLOAD_RPC_TIMEOUT_MS = 6 * 60 * 60 * 1000;

type DesktopApiMethod = {
  [K in keyof DesktopApi]: DesktopApi[K] extends (...args: unknown[]) => unknown
  ? K
  : never;
}[keyof DesktopApi];

type RpcResponse<Method extends DesktopApiMethod> = Awaited<
  ReturnType<DesktopApi[Method]>
>;

type RpcHandler<Params, Response> = undefined extends Params
  ? (params?: Params) => Response | Promise<Response>
  : (params: Params) => Response | Promise<Response>;

interface BunRpcRequestHandlers {
  authStart: RpcHandler<undefined, RpcResponse<"startAuth">>;
  authComplete: RpcHandler<AuthCompleteRequest, RpcResponse<"completeAuth">>;
  getStoredAuthState: RpcHandler<undefined, RpcResponse<"getStoredAuthState">>;
  authWithStoredToken: RpcHandler<
    undefined,
    RpcResponse<"authWithStoredToken">
  >;
  ping: RpcHandler<undefined, RpcResponse<"ping">>;
  getCatalogModels: RpcHandler<
    GetCatalogModelsRequest,
    RpcResponse<"getCatalogModels">
  >;
  lookupConnectedDeviceFirmware: RpcHandler<
    undefined,
    RpcResponse<"lookupConnectedDeviceFirmware">
  >;
  discoverCountryOptions: RpcHandler<
    DiscoverCountryOptionsRequest,
    RpcResponse<"discoverCountryOptions">
  >;
  lookupCatalogManual: RpcHandler<
    LookupCatalogManualRequest,
    RpcResponse<"lookupCatalogManual">
  >;
  getReadSupportHints: RpcHandler<
    ReadSupportHintsRequest,
    RpcResponse<"getReadSupportHints">
  >;
  lookupReadSupportByImei: RpcHandler<
    LookupReadSupportByImeiRequest,
    RpcResponse<"lookupReadSupportByImei">
  >;
  lookupReadSupportBySn: RpcHandler<
    LookupReadSupportBySnRequest,
    RpcResponse<"lookupReadSupportBySn">
  >;
  lookupReadSupportByParams: RpcHandler<
    LookupReadSupportByParamsRequest,
    RpcResponse<"lookupReadSupportByParams">
  >;
  downloadFirmware: RpcHandler<
    DownloadFirmwareRequest,
    RpcResponse<"downloadFirmware">
  >;
  rescueLiteFirmware: RpcHandler<
    RescueLiteFirmwareRequest,
    RpcResponse<"rescueLiteFirmware">
  >;
  rescueLiteFirmwareFromLocal: RpcHandler<
    RescueLiteFirmwareFromLocalRequest,
    RpcResponse<"rescueLiteFirmwareFromLocal">
  >;
  cancelDownload: RpcHandler<
    CancelDownloadRequest,
    RpcResponse<"cancelDownload">
  >;
  listLocalDownloadedFiles: RpcHandler<undefined, LocalDownloadedFilesResponse>;
  extractLocalFirmware: RpcHandler<
    ExtractLocalFirmwareRequest,
    RpcResponse<"extractLocalFirmware">
  >;
  attachLocalRecipeFromModel: RpcHandler<
    AttachLocalRecipeFromModelRequest,
    AttachLocalRecipeResponse
  >;
  attachLocalRecipeMetadata: RpcHandler<
    AttachLocalRecipeMetadataRequest,
    AttachLocalRecipeResponse
  >;
  checkDesktopIntegration: RpcHandler<undefined, RpcResponse<"checkDesktopIntegration">>;
  createDesktopIntegration: RpcHandler<undefined, RpcResponse<"createDesktopIntegration">>;
  getDesktopPromptPreference: RpcHandler<undefined, RpcResponse<"getDesktopPromptPreference">>;
  setDesktopPromptPreference: RpcHandler<
    { ask: boolean },
    RpcResponse<"setDesktopPromptPreference">
  >;
  getAppInfo: RpcHandler<undefined, RpcResponse<"getAppInfo">>;
  openUrl: RpcHandler<{ url: string }, { ok: boolean; error?: string }>;
  checkFrameworkUpdate: RpcHandler<undefined, RpcResponse<"checkFrameworkUpdate">>;
  downloadFrameworkUpdate: RpcHandler<undefined, void>;
  applyFrameworkUpdate: RpcHandler<undefined, void>;
  deleteLocalFile: RpcHandler<{ filePath: string }, { ok: boolean; error?: string }>;
  pauseDownload: RpcHandler<{ downloadId: string }, { ok: boolean; error?: string }>;
  resumeDownload: RpcHandler<{ downloadId: string }, RpcResponse<"downloadFirmware">>;
}

function asRpcRequestHandlers(handlers: BunRpcRequestHandlers) {
  return handlers as unknown as Record<string, (params?: unknown) => unknown>;
}

// Log all updater status changes to the console for easier remote debugging
Updater.onStatusChange((entry) => {
  console.log(`[Updater Status] ${entry.status}: ${entry.message}`, entry.details || "");
});

const requestHandlers: BunRpcRequestHandlers = {
  openUrl: async ({ url }) => {
    try {
      await openExternalUrl(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  authStart: async () => {
    try {
      await bootstrapSessionCookie();
      const loginUrl = await openLoginBrowser();

      return {
        ok: true,
        loginUrl,
      };
    } catch (error) {
      return {
        ok: false,
        error: toErrorMessage(error),
      };
    }
  },
  authComplete: async ({ callbackUrlOrToken }) => {
    const wustToken = extractWustToken(callbackUrlOrToken || "");
    if (!wustToken) {
      return {
        ok: false,
        error: "Missing callback URL or wust token.",
      };
    }

    const config = await loadConfig();
    const authResult = await authenticateWithWustToken(config, wustToken);
    if (!authResult.ok) {
      return {
        ok: false,
        code: authResult.code,
        description: authResult.description,
        error: "WUST token rejected or expired.",
      };
    }

    return {
      ok: true,
      code: authResult.code,
      description: authResult.description,
    };
  },
  getStoredAuthState: async () => {
    try {
      const config = await loadConfig();
      return {
        ok: true,
        hasStoredWustToken: Boolean(config.wustToken?.trim()),
      };
    } catch (error) {
      return {
        ok: false,
        hasStoredWustToken: false,
        error: toErrorMessage(error),
      };
    }
  },
  authWithStoredToken: async () => {
    try {
      const config = await loadConfig();
      const storedToken = config.wustToken?.trim() || "";

      if (!storedToken) {
        return {
          ok: false,
          error: "No stored WUST token found in data/config.json.",
        };
      }

      const authResult = await authenticateWithWustToken(config, storedToken);
      if (!authResult.ok) {
        return {
          ok: false,
          code: authResult.code,
          description: authResult.description,
          error: "Stored WUST token rejected or expired.",
        };
      }

      return {
        ok: true,
        code: authResult.code,
        description: authResult.description,
      };
    } catch (error) {
      return {
        ok: false,
        error: toErrorMessage(error),
      };
    }
  },
  ping: async () => {
    return {
      ok: true,
      serverTime: Date.now(),
    };
  },
  getCatalogModels: async ({ refresh }) => {
    try {
      let usedLmsaRefresh = Boolean(refresh);
      let models = usedLmsaRefresh
        ? await refreshModelCatalogFromApi()
        : await getModelCatalog();

      if (!usedLmsaRefresh && models.length === 0) {
        console.log(
          "[Catalog] Local catalog is empty. Refreshing from LMSA API...",
        );
        models = await refreshModelCatalogFromApi();
        usedLmsaRefresh = true;
      }

      return {
        ok: true,
        models,
        usedLmsaRefresh,
      };
    } catch (error) {
      return {
        ok: false,
        models: [],
        usedLmsaRefresh: false,
        error: toErrorMessage(error),
      };
    }
  },
  lookupConnectedDeviceFirmware: async () => {
    try {
      return await lookupConnectedDeviceFirmware();
    } catch (error) {
      return {
        ok: false,
        adbAvailable: false,
        fastbootAvailable: false,
        attempts: [],
        variants: [],
        error: toErrorMessage(error),
      } satisfies ConnectedLookupResponse;
    }
  },
  discoverCountryOptions: async ({ model }) => {
    try {
      const data = await discoverCountryOptionsForCatalogModel(model);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  },
  lookupCatalogManual: async ({ model, countryValue, allCountries }) => {
    try {
      let initialParametersOverride: Record<string, string> | undefined;

      if (countryValue || allCountries) {
        const countryOptions =
          await discoverCountryOptionsForCatalogModel(model);
        if (
          countryOptions.foundCountrySelector &&
          countryOptions.countryValues.length > 0
        ) {
          if (countryValue) {
            initialParametersOverride = {
              ...countryOptions.baseParametersBeforeCountry,
              [countryOptions.countryParameterKey]: countryValue,
            };
          } else if (allCountries) {
            initialParametersOverride = {
              ...countryOptions.baseParametersBeforeCountry,
            };
          }
        }
      }

      const data = await fetchFirmwareVariantsForCatalogModel(
        model,
        initialParametersOverride,
        Boolean(allCountries),
      );

      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  },
  getReadSupportHints: async ({ modelName }) => {
    try {
      const data = await getReadSupportRequiredParameters(modelName);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  },
  lookupReadSupportByImei: async ({
    model,
    imei,
    imei2,
    sn,
    roCarrier,
    channelId,
  }) => {
    try {
      const data = await fetchFirmwareByImeiForModel(model, {
        imei,
        imei2,
        sn,
        roCarrier,
        channelId,
      });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  },
  lookupReadSupportBySn: async ({ model, sn, channelId }) => {
    try {
      if (!isValidLmsaSerialNumber(sn)) {
        return {
          ok: false,
          error:
            "Serial number format invalid for LMSA SN lookup (8 chars: 1 letter + 7 alphanumeric excluding i/o).",
        };
      }

      const data = await fetchFirmwareBySnForModel(model, {
        sn,
        channelId,
      });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  },
  lookupReadSupportByParams: async ({
    model,
    params,
    imei,
    imei2,
    sn,
    channelId,
  }) => {
    try {
      const data = await fetchReadSupportFirmwareForModel(model, params, {
        imei,
        imei2,
        sn,
        channelId,
      });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  },
  downloadFirmware: async ({
    downloadId,
    romUrl,
    romName,
    publishDate,
    romMatchIdentifier,
    selectedParameters,
    recipeUrl,
  }) => {
    return downloadFirmwareWithProgress(
      {
        downloadId,
        romUrl,
        romName,
        publishDate,
        romMatchIdentifier,
        selectedParameters,
        recipeUrl,
      },
      (progressEvent) => {
        sendDownloadProgress(progressEvent);
      },
    );
  },
  rescueLiteFirmware: async ({
    downloadId,
    romUrl,
    romName,
    publishDate,
    selectedParameters,
    romMatchIdentifier,
    recipeUrl,
    dataReset,
    dryRun,
  }) => {
    return rescueLiteFirmwareWithProgress(
      {
        downloadId,
        romUrl,
        romName,
        publishDate,
        selectedParameters,
        romMatchIdentifier,
        recipeUrl,
        dataReset,
        dryRun,
      },
      (progressEvent) => {
        sendDownloadProgress(progressEvent);
      },
    );
  },
  rescueLiteFirmwareFromLocal: async ({
    downloadId,
    filePath,
    fileName,
    extractedDir,
    publishDate,
    selectedParameters,
    romMatchIdentifier,
    recipeUrl,
    dataReset,
    dryRun,
  }) => {
    return rescueLiteFirmwareWithProgress(
      {
        downloadId,
        romUrl: filePath,
        romName: fileName,
        publishDate,
        selectedParameters,
        romMatchIdentifier,
        recipeUrl,
        dataReset,
        dryRun,
        localPackagePath: filePath,
        localExtractedDir: extractedDir,
      },
      (progressEvent) => {
        sendDownloadProgress(progressEvent);
      },
    );
  },
  cancelDownload: async ({ downloadId }) => {
    const canceledDownload = cancelActiveDownload(downloadId);
    if (canceledDownload.ok) {
      return canceledDownload;
    }

    if (cancelActiveRescue(downloadId)) {
      return {
        ok: true,
        downloadId,
        status: "canceling",
      } as const;
    }

    return canceledDownload;
  },
  listLocalDownloadedFiles: async () => {
    return listLocalDownloadedFiles();
  },
  extractLocalFirmware: async ({ filePath, fileName, extractedDir }) => {
    return extractLocalFirmwarePackage({
      filePath,
      fileName,
      extractedDir,
    });
  },
  attachLocalRecipeFromModel: async ({
    filePath,
    fileName,
    modelName,
    marketName,
    category,
  }) => {
    return attachLocalRecipeFromModel({
      filePath,
      fileName,
      modelName,
      marketName,
      category,
    });
  },
  attachLocalRecipeMetadata: async ({
    filePath,
    fileName,
    recipeUrl,
    romName,
    romUrl,
    publishDate,
    romMatchIdentifier,
    selectedParameters,
    source,
  }) => {
    return attachLocalRecipeMetadata({
      filePath,
      fileName,
      recipeUrl,
      romName,
      romUrl,
      publishDate,
      romMatchIdentifier,
      selectedParameters,
      source,
    });
  },
  deleteLocalFile: async ({ filePath }: { filePath: string }) => {
    return deleteLocalFile({ filePath });
  },
  pauseDownload: async ({ downloadId }: { downloadId: string }) => {
    return pauseActiveDownload(downloadId);
  },
  resumeDownload: async ({ downloadId }: { downloadId: string }) => {
    return resumePausedDownload(downloadId, (progress) => {
      sendDownloadProgress(progress);
    });
  },
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
  applyFrameworkUpdate: async () => {
    try {
      console.log("[Updater] Preparing to apply update. Cleaning up processes...");

      // 1. Cancel any active rescue operations
      cancelActiveRescue();

      // 2. Kill ADB server to release potential file locks in the app bundle
      try {
        const { execSync } = await import("child_process");
        execSync("adb kill-server", { stdio: "ignore" });
        console.log("[Updater] ADB server stopped.");
      } catch (e) {
        // Ignore if adb is not in PATH or not running
      }

      // 3. Small delay to let the OS release file handles
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log(`[Updater] execPath: ${process.execPath}`);
      console.log(`[Updater] cwd: ${process.cwd()}`);

      const localInfo = await Updater.getLocallocalInfo();
      const updateResult = await Updater.checkForUpdate();
      const latestHash = updateResult.hash;
      const appDataFolder = await Updater.appDataFolder();
      const extractionFolder = join(appDataFolder, "self-extraction");
      const latestTarPath = join(extractionFolder, `${latestHash}.tar`);

      if (!(await Bun.file(latestTarPath).exists())) {
        throw new Error(`Latest tar not found at ${latestTarPath}`);
      }

      // 4. Extract
      const extractionDir = join(extractionFolder, `temp-${latestHash}`);
      if (!existsSync(extractionDir)) {
        mkdirSync(extractionDir, { recursive: true });
      }

      console.log(`[Updater] Extracting update to ${extractionDir}...`);
      const tarBytes = await Bun.file(latestTarPath).arrayBuffer();
      const archive = new Bun.Archive(tarBytes);
      await archive.extract(extractionDir);

      // 5. Identify App Bundle naming by scanning extracted directory
      const { readdirSync, statSync } = await import("node:fs");
      const extractedFiles = readdirSync(extractionDir);
      const appBundleDir = extractedFiles.find(file => {
        const filePath = join(extractionDir, file);
        return statSync(filePath).isDirectory() && !file.startsWith('temp-');
      });

      if (!appBundleDir) {
        throw new Error(`Could not find app bundle in extracted files at ${extractionDir}`);
      }

      const newAppBundlePath = join(extractionDir, appBundleDir);
      const runningAppBundlePath = join(appDataFolder, "app");

      console.log(`[Updater] Identified New App Path: ${newAppBundlePath}`);
      console.log(`[Updater] Target App Path: ${runningAppBundlePath}`);

      // 6. Create robust Update Batch for Windows
      const parentDir = appDataFolder;
      const updateScriptPath = join(parentDir, "update.bat");
      const logPath = join(parentDir, "update_log.txt");

      const launcherPath = join(runningAppBundlePath, "bin", "launcher.exe");

      const runningAppWin = runningAppBundlePath.replace(/\//g, "\\");
      const newAppWin = newAppBundlePath.replace(/\//g, "\\");
      const extractionDirWin = extractionDir.replace(/\//g, "\\");
      const launcherPathWin = launcherPath.replace(/\//g, "\\");
      const logPathWin = logPath.replace(/\//g, "\\");

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

      // 7. Launch Batch detached
      const { spawn } = await import("node:child_process");
      console.log(`[Updater] Launching update script: ${updateScriptPath}`);

      const child = spawn("cmd.exe", ["/c", "start", "/min", "cmd.exe", "/c", updateScriptPath], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();

      console.log("[Updater] Update script launched. Quitting app in 1s...");
      setTimeout(() => {
        process.exit(0);
      }, 1000);

    } catch (error) {
      console.error("[Updater] Failed to apply update manually:", error);
      throw error;
    }
  },
};

const rpc = BrowserView.defineRPC<DesktopRpcSchema>({
  maxRequestTime: DOWNLOAD_RPC_TIMEOUT_MS,
  handlers: {
    requests: asRpcRequestHandlers(requestHandlers),
    messages: {},
  },
});

type DownloadProgressPayload = DownloadProgressMessage;
type DownloadProgressSendFn = (
  message: "downloadProgress",
  payload: DownloadProgressPayload,
) => void;

function sendDownloadProgress(payload: DownloadProgressPayload) {
  (rpc.send as unknown as DownloadProgressSendFn)("downloadProgress", payload);
}

const buildConfig = await BuildConfig.get();
const rendererOptions = new Set(buildConfig.availableRenderers || []);
const requestedLinuxRenderer = (
  Bun.env.LE_MOTO_RENDERER_LINUX || ""
).toLowerCase();

let selectedRenderer: "native" | "cef" = buildConfig.defaultRenderer;
if (process.platform === "linux" && requestedLinuxRenderer) {
  if (requestedLinuxRenderer === "native" && rendererOptions.has("native")) {
    selectedRenderer = "native";
  } else if (requestedLinuxRenderer === "cef" && rendererOptions.has("cef")) {
    selectedRenderer = "cef";
  } else {
    console.warn(
      `[Renderer] Requested '${requestedLinuxRenderer}' is unavailable in this build. Using '${selectedRenderer}'.`,
    );
  }
}

if (selectedRenderer === "cef") {
  await cleanupLinuxCefProfileLocks(Utils.paths.userCache);
}

const mainWindow = new BrowserWindow({
  title: "Lenovo Moto Firmware Downloader",
  url: "views://mainview/browser/index.html",
  preload: "views://bridge/index.js",
  rpc,
  renderer: selectedRenderer,
  frame: {
    width: 1600,
    height: 900,
    x: 50,
    y: 30,
  },
});
mainWindow.webview.on("did-navigate", () => {
  mainWindow.maximize();
});

if (process.platform === "win32") {
  const fs = require("fs");
  const path = require("path");

  // In development, the icon is in assets/icons.
  // In production (bundled), the icon is extracted to Resources/app.ico
  const candidates = [
    path.join(process.cwd(), "assets/icons/windows-icon.ico"), // Development
    path.join(process.argv[0], "..", "..", "Resources", "app.ico"), // Production
    path.join(process.execPath, "..", "..", "Resources", "app.ico") // Production fallback
  ];

  let iconPath = "";
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      iconPath = c;
      break;
    }
  }

  if (mainWindow.ptr && iconPath) {
    try {
      const { dlopen, FFIType } = require("bun:ffi");
      const user32 = dlopen("user32.dll", {
        FindWindowW: {
          args: [FFIType.ptr, FFIType.ptr],
          returns: FFIType.ptr,
        },
        LoadImageW: {
          args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32],
          returns: FFIType.ptr,
        },
        SendMessageW: {
          args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr],
          returns: FFIType.ptr,
        }
      });

      const toUtf16LE = (str: string) => {
        const buf = Buffer.alloc((str.length + 1) * 2);
        buf.write(str, 0, "utf16le");
        return buf;
      };

      // Set a small delay to ensure the window is drawn before we find it
      setTimeout(() => {
        const titlePtr = toUtf16LE("Lenovo Moto Firmware Downloader");
        const hwnd = user32.symbols.FindWindowW(null, titlePtr);
        if (hwnd) {
          const iconPtr = toUtf16LE(iconPath);
          // IMAGE_ICON = 1, LR_LOADFROMFILE = 0x00000010
          const hIcon = user32.symbols.LoadImageW(null, iconPtr, 1, 0, 0, 0x00000010);
          if (hIcon) {
            // WM_SETICON = 0x0080, ICON_SMALL = 0, ICON_BIG = 1
            user32.symbols.SendMessageW(hwnd, 0x0080, 0, hIcon);
            user32.symbols.SendMessageW(hwnd, 0x0080, 1, hIcon);
          } else {
            console.error("WINDOW ICON: Failed to load icon image via Win32.");
          }
        } else {
          console.error("WINDOW ICON: Failed to find window HWND.");
        }
      }, 500);

    } catch (err) {
      console.error("WINDOW ICON SET ERROR:", err);
    }
  }
}
