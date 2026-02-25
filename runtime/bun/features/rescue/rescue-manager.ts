import { mkdir, stat } from "fs/promises";
import { basename } from "path";
import type {
  DownloadProgressMessage,
  ExtractLocalFirmwareResponse,
  RescueLiteFirmwareResponse,
} from "../../../shared/rpc.ts";
import { downloadFirmwareWithProgress } from "../../download-manager.ts";
import {
  collectFilesRecursive,
  createFileIndex,
  ensureExtractedFirmwarePackage,
  findReusableFirmwarePackagePath,
  getDownloadDirectory,
  getExtractDirForPackagePath,
  hasUsableExtractedRescueScripts,
} from "../../firmware-package-utils.ts";
import { writeFirmwareMetadata } from "../../firmware-metadata.ts";
import {
  hasFastbootDevice,
  runCommandWithAbort,
  tryAdbRebootBootloader,
} from "./device-flasher.ts";
import { resolveRescueRecipeHints, type RescueRecipeHints } from "./recipe-resolver.ts";
import {
  pickFlashScript,
  pickScriptCommands,
  prepareCommandsFromXml,
  type PreparedFastbootCommand
} from "./fastboot-parser.ts";

type RescueProgressEmitter = (progress: DownloadProgressMessage) => void;

type ActiveRescue = {
  controller: AbortController;
  canceled: boolean;
  activeProcess: Bun.Subprocess | null;
};

const activeRescues = new Map<string, ActiveRescue>();

function wait(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isAbortError(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && /abort|cancel/i.test(error.message))
    return true;
  return false;
}

/**
 * Cancels active rescue operations.
 * If downloadId is provided, cancels only that specific operation.
 * If no downloadId is provided, cancels ALL active rescue operations (used during app updates).
 */
export function cancelActiveRescue(downloadId?: string) {
  if (downloadId) {
    const active = activeRescues.get(downloadId);
    if (!active) return false;

    active.canceled = true;
    active.controller.abort();
    try {
      active.activeProcess?.kill();
    } catch { /* ignore */ }
    return true;
  }

  console.log(`[RescueManager] Canceling ${activeRescues.size} active rescue(s)...`);
  for (const [id, rescue] of activeRescues.entries()) {
    try {
      rescue.canceled = true;
      rescue.controller.abort();
      rescue.activeProcess?.kill();
    } catch { /* ignore */ }
  }
  activeRescues.clear();
  return true;
}

export async function extractLocalFirmwarePackage(payload: {
  filePath: string;
  fileName: string;
  extractedDir?: string;
}): Promise<ExtractLocalFirmwareResponse> {
  try {
    const packagePath = payload.filePath;
    if (!packagePath?.trim()) {
      return {
        ok: false,
        filePath: payload.filePath,
        fileName: payload.fileName,
        error: "Missing local firmware package path.",
      };
    }

    if (!(await Bun.file(packagePath).exists())) {
      return {
        ok: false,
        filePath: payload.filePath,
        fileName: payload.fileName,
        error: `Local firmware package not found: ${packagePath}`,
      };
    }

    const extraction = await ensureExtractedFirmwarePackage({
      packagePath,
      extractedDir: payload.extractedDir,
    });

    return {
      ok: true,
      filePath: payload.filePath,
      fileName: payload.fileName,
      extractedDir: extraction.extractDir,
      reusedExtraction: extraction.reusedExtraction,
    };
  } catch (error) {
    return {
      ok: false,
      filePath: payload.filePath,
      fileName: payload.fileName,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function rescueLiteFirmwareWithProgress(
  payload: {
    downloadId: string;
    romUrl: string;
    romName: string;
    publishDate?: string;
    selectedParameters?: Record<string, string>;
    recipeUrl?: string;
    dataReset: "yes" | "no";
    dryRun?: boolean;
    localPackagePath?: string;
    localExtractedDir?: string;
    romMatchIdentifier?: string;
  },
  onProgress: RescueProgressEmitter,
): Promise<RescueLiteFirmwareResponse> {
  const { downloadId, romUrl, romName, dataReset } = payload;
  const isDryRun = Boolean(payload.dryRun);
  const rescueController = new AbortController();
  activeRescues.set(downloadId, {
    controller: rescueController,
    canceled: false,
    activeProcess: null,
  });

  let savePath = "";
  let bytesDownloaded = 0;
  let totalBytes = 0;
  let workDir = "";

  const emit = (
    progress: Partial<DownloadProgressMessage> & {
      status: DownloadProgressMessage["status"];
    },
  ) => {
    onProgress({
      downloadId,
      romUrl,
      romName,
      dryRun: isDryRun,
      downloadedBytes: bytesDownloaded,
      totalBytes: totalBytes || undefined,
      speedBytesPerSecond: 0,
      ...progress,
    });
  };

  try {
    const downloadDirectory = getDownloadDirectory();
    await mkdir(downloadDirectory, { recursive: true });
    let reusedPackage = false;
    let reusedExtraction = false;

    if (payload.localPackagePath) {
      if (!(await Bun.file(payload.localPackagePath).exists())) {
        throw new Error(
          `Local firmware package not found: ${payload.localPackagePath}`,
        );
      }
      savePath = payload.localPackagePath;
      const packageStats = await stat(savePath);
      bytesDownloaded = packageStats.size;
      totalBytes = packageStats.size;
      reusedPackage = true;

      try {
        await writeFirmwareMetadata(savePath, {
          source: "rescue-lite",
          romUrl,
          romName,
          publishDate: payload.publishDate,
          recipeUrl: payload.recipeUrl,
          romMatchIdentifier:
            payload.romMatchIdentifier ||
            payload.selectedParameters?.romMatchIdentifier ||
            payload.selectedParameters?.romMatchId,
          selectedParameters: payload.selectedParameters,
        });
      } catch {
        // Best effort
      }

      emit({
        status: "starting",
        savePath,
        phase: "download",
        stepLabel: "Using selected local firmware package.",
      });
    } else {
      const reusablePackagePath = await findReusableFirmwarePackagePath(
        downloadDirectory,
        romUrl,
        romName,
      );
      if (reusablePackagePath) {
        savePath = reusablePackagePath;
        const packageStats = await stat(savePath);
        bytesDownloaded = packageStats.size;
        totalBytes = packageStats.size;
        reusedPackage = true;

        try {
          await writeFirmwareMetadata(savePath, {
            source: "rescue-lite",
            romUrl,
            romName,
            publishDate: payload.publishDate,
            recipeUrl: payload.recipeUrl,
            romMatchIdentifier:
              payload.romMatchIdentifier ||
              payload.selectedParameters?.romMatchIdentifier ||
              payload.selectedParameters?.romMatchId,
            selectedParameters: payload.selectedParameters,
          });
        } catch {
          // Best effort
        }

        emit({
          status: "starting",
          savePath,
          phase: "download",
          stepLabel: "Reusing existing firmware package from Downloads.",
        });
      } else {
        const downloadResult = await downloadFirmwareWithProgress(
          {
            downloadId,
            romUrl,
            romName,
            publishDate: payload.publishDate,
            romMatchIdentifier: payload.romMatchIdentifier,
            recipeUrl: payload.recipeUrl,
            selectedParameters: payload.selectedParameters,
          },
          (progress) => {
            bytesDownloaded = progress.downloadedBytes;
            totalBytes = progress.totalBytes ?? progress.downloadedBytes;
            savePath = progress.savePath || savePath;

            if (progress.status === "completed") {
              emit({
                status: "preparing",
                savePath: progress.savePath,
                phase: "prepare",
                stepLabel: "Download finished. Preparing firmware package...",
              });
              return;
            }

            emit({
              ...progress,
              phase: "download",
            });
          },
        );

        if (!downloadResult.ok) {
          return {
            ok: false,
            downloadId,
            error: downloadResult.error || "Rescue Lite download failed.",
          };
        }

        if (!downloadResult.savePath) {
          throw new Error("Downloaded package path is missing.");
        }

        savePath = downloadResult.savePath;
        bytesDownloaded = downloadResult.bytesDownloaded ?? bytesDownloaded;
        totalBytes = downloadResult.totalBytes ?? totalBytes;
      }
    }

    if (
      rescueController.signal.aborted ||
      activeRescues.get(downloadId)?.canceled
    ) {
      const abortError = new Error("Rescue Lite canceled by user.");
      abortError.name = "AbortError";
      throw abortError;
    }

    // Package is ready. We can now proceed to extraction or command processing.
    const linkedExtractDir =
      payload.localExtractedDir?.trim() ||
      getExtractDirForPackagePath(savePath);
    workDir = linkedExtractDir;

    if (hasUsableExtractedRescueScripts(workDir)) {
      reusedExtraction = true;
      emit({
        status: "preparing",
        savePath,
        phase: "prepare",
        stepLabel: "Reusing existing extracted firmware directory.",
      });
    } else {
      emit({
        status: "preparing",
        savePath,
        phase: "prepare",
        stepLabel: "Extracting firmware package...",
      });
    }

    const extraction = await ensureExtractedFirmwarePackage({
      packagePath: savePath,
      extractedDir: linkedExtractDir,
      signal: rescueController.signal,
      onProcess: (process) => {
        const active = activeRescues.get(downloadId);
        if (active) {
          active.activeProcess = process;
        }
      },
    });
    workDir = extraction.extractDir;
    reusedExtraction = reusedExtraction || extraction.reusedExtraction;

    let recipeHints: RescueRecipeHints | undefined;
    try {
      recipeHints = await resolveRescueRecipeHints(payload, dataReset);
      if (recipeHints) {
        emit({
          status: "preparing",
          savePath,
          phase: "prepare",
          stepLabel: `Recipe hints loaded (${recipeHints.referenceCount} references) from ${recipeHints.source}.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit({
        status: "preparing",
        savePath,
        phase: "prepare",
        stepLabel: `Recipe hints unavailable (${message}). Continuing with local script detection.`,
      });
    }

    const extractedFiles = await collectFilesRecursive(workDir);
    const fileIndex = createFileIndex(extractedFiles);
    const { scriptPath, steps } = await pickFlashScript(
      workDir,
      dataReset,
      recipeHints,
    );
    const xmlPrepared = await prepareCommandsFromXml(
      steps,
      dataReset,
      workDir,
      fileIndex,
    );
    const scriptPrepared = await pickScriptCommands(
      workDir,
      extractedFiles,
      dataReset,
      fileIndex,
      recipeHints,
    );

    let commands: PreparedFastbootCommand[] = xmlPrepared.commands;
    let commandSource = `xml:${basename(scriptPath)}`;
    if (
      recipeHints?.preferredFileNames.has(basename(scriptPath).toLowerCase())
    ) {
      commandSource += " (recipe-guided)";
    }
    if (commands.length === 0 && scriptPrepared) {
      commands = scriptPrepared.commands;
      commandSource = `script:${basename(scriptPrepared.scriptPath)}`;
      if (
        recipeHints?.preferredFileNames.has(
          basename(scriptPrepared.scriptPath).toLowerCase(),
        )
      ) {
        commandSource += " (recipe-guided)";
      }
    } else if (
      commands.length > 0 &&
      scriptPrepared &&
      scriptPrepared.commands.length > commands.length + 5
    ) {
      commands = scriptPrepared.commands;
      commandSource = `script:${basename(scriptPrepared.scriptPath)}`;
      if (
        recipeHints?.preferredFileNames.has(
          basename(scriptPrepared.scriptPath).toLowerCase(),
        )
      ) {
        commandSource += " (recipe-guided)";
      }
    }

    emit({
      status: "preparing",
      savePath,
      phase: "prepare",
      commandSource,
      stepLabel: `Using rescue command source: ${commandSource}`,
    });

    if (commands.length === 0) {
      throw new Error(
        "No executable fastboot commands found in XML/script resources for this firmware package.",
      );
    }

    const commandPlan = commands.map((command) => command.label);
    if (isDryRun) {
      console.log(
        `[RescueLite:dry-run] ${downloadId} source=${commandSource} commands=${commandPlan.length}`,
      );
      for (const command of commandPlan) {
        console.log(`[RescueLite:dry-run] ${command}`);
      }

      for (let index = 0; index < commands.length; index += 1) {
        const command = commands[index] as PreparedFastbootCommand;
        emit({
          status: "flashing",
          savePath,
          phase: "flash",
          commandSource,
          stepIndex: index + 1,
          stepTotal: commands.length,
          stepLabel: command.label,
        });
      }

      emit({
        status: "completed",
        savePath,
        phase: "flash",
        commandSource,
        stepIndex: commands.length,
        stepTotal: commands.length,
        stepLabel: "Dry run completed. No commands executed.",
      });

      return {
        ok: true,
        downloadId,
        savePath,
        fileName: basename(savePath),
        bytesDownloaded,
        totalBytes: totalBytes || bytesDownloaded,
        workDir,
        dryRun: true,
        reusedPackage,
        reusedExtraction,
        commandSource,
        commandPlan,
      };
    }

    const setActiveProcess = (process: Bun.Subprocess | null) => {
      const active = activeRescues.get(downloadId);
      if (active) {
        active.activeProcess = process;
      }
    };

    let fastbootReady = await hasFastbootDevice(
      rescueController.signal,
      workDir,
      setActiveProcess,
    );
    if (!fastbootReady) {
      emit({
        status: "preparing",
        savePath,
        phase: "prepare",
        stepLabel: "No fastboot device found. Trying adb reboot bootloader...",
      });
      await tryAdbRebootBootloader(
        rescueController.signal,
        workDir,
        setActiveProcess,
      );
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (rescueController.signal.aborted) {
          const abortError = new Error("Operation aborted.");
          abortError.name = "AbortError";
          throw abortError;
        }
        fastbootReady = await hasFastbootDevice(
          rescueController.signal,
          workDir,
          setActiveProcess,
        );
        if (fastbootReady) {
          break;
        }
        await wait(1000);
      }
    }

    if (!fastbootReady) {
      throw new Error(
        "No fastboot device detected. Put the phone in fastboot mode and retry.",
      );
    }

    if (xmlPrepared.warnings.length > 0) {
      emit({
        status: "preparing",
        savePath,
        phase: "prepare",
        stepLabel: `XML parsing notes: ${xmlPrepared.warnings.length} step(s) skipped/adjusted.`,
      });
    }

    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index] as PreparedFastbootCommand;
      emit({
        status: "flashing",
        savePath,
        phase: "flash",
        commandSource,
        stepIndex: index + 1,
        stepTotal: commands.length,
        stepLabel: command.label,
      });

      try {
        await runCommandWithAbort({
          command: "fastboot",
          args: command.args,
          cwd: workDir,
          signal: rescueController.signal,
          onProcess: setActiveProcess,
        });
      } catch (error) {
        if (command.softFail && !isAbortError(error)) {
          continue;
        }
        throw error;
      }
    }

    emit({
      status: "completed",
      savePath,
      phase: "flash",
      commandSource,
      stepIndex: commands.length,
      stepTotal: commands.length,
      stepLabel: "Rescue Lite completed.",
    });

    return {
      ok: true,
      downloadId,
      savePath,
      fileName: basename(savePath),
      bytesDownloaded,
      totalBytes: totalBytes || bytesDownloaded,
      workDir,
      dryRun: false,
      reusedPackage,
      reusedExtraction,
      commandSource,
      commandPlan,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isAbortError(error) || activeRescues.get(downloadId)?.canceled) {
      emit({
        status: "canceled",
        savePath: savePath || undefined,
        phase: "flash",
        error: "",
      });
      return {
        ok: false,
        downloadId,
        error: "Rescue Lite canceled by user.",
      };
    }

    emit({
      status: "failed",
      savePath: savePath || undefined,
      phase: "flash",
      error: message,
    });
    return {
      ok: false,
      downloadId,
      error: message,
    };
  } finally {
    activeRescues.delete(downloadId);
  }
}
