import { mkdir, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type {
  DownloadProgressMessage,
  ExtractLocalFirmwareResponse,
  RescueFlashTransport,
  RescueLiteFirmwareResponse,
  RescueQdlStorage,
} from '../../../shared/rpc.ts';
import { downloadFirmwareWithProgress } from '../../download-manager.ts';
import { writeFirmwareMetadata } from '../../firmware-metadata.ts';
import {
  ensureExtractedFirmwarePackage,
  findReusableFirmwarePackagePath,
  getDownloadDirectory,
  getExtractDirForPackagePath,
  hasUsableExtractedRescueScripts,
} from '../../firmware-package-utils.ts';
import { qdlCommandDisplayName, resolveQdlCommand } from './commands/qdl-command.ts';
import { resolveUnisocPacToolCandidates } from './commands/rescue-command-policy.ts';
import { runRescueCommandPlan } from './commands/run-rescue-command-plan';
import { ensureWindowsQdloaderDriver } from './commands/windows-qdloader-driver-installer.ts';
import {
  hasFastbootDevice,
  isCommandAvailable,
  probeQualcommEdlUsb,
  tryAdbRebootBootloader,
  tryAdbRebootEdl,
} from './device-flasher.ts';
import { buildRescueCommandPlan } from './facade/rescue-command-plan-facade.ts';
import { type RescueRecipeHints, resolveRescueRecipeHints } from './recipe-resolver.ts';

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

function isAbortError<ErrorValue>(error: ErrorValue) {
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && /abort|cancel/i.test(error.message)) return true;
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
    } catch {
      /* ignore */
    }
    return true;
  }

  console.log(`[RescueManager] Canceling ${activeRescues.size} active rescue(s)...`);
  for (const [, rescue] of activeRescues.entries()) {
    try {
      rescue.canceled = true;
      rescue.controller.abort();
      rescue.activeProcess?.kill();
    } catch {
      /* ignore */
    }
  }
  activeRescues.clear();
  return true;
}

export async function extractLocalFirmwarePackage(
  payload: {
    filePath: string;
    fileName: string;
    extractedDir?: string;
  },
  onProgress?: RescueProgressEmitter,
): Promise<ExtractLocalFirmwareResponse> {
  const downloadId = `extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rescueController = new AbortController();
  activeRescues.set(downloadId, {
    controller: rescueController,
    canceled: false,
    activeProcess: null,
  });

  const emit = (
    progress: Partial<DownloadProgressMessage> & {
      status: DownloadProgressMessage['status'];
    },
  ) => {
    if (!onProgress) {
      return;
    }

    onProgress({
      downloadId,
      romUrl: payload.filePath,
      romName: payload.fileName,
      dryRun: false,
      flashTransport: 'fastboot',
      qdlStorage: 'auto',
      downloadedBytes: 0,
      speedBytesPerSecond: 0,
      commandSource: 'local-extract',
      ...progress,
    });
  };

  try {
    const packagePath = payload.filePath;
    if (!packagePath?.trim()) {
      emit({
        status: 'failed',
        phase: 'prepare',
        stepLabel: 'Missing local firmware package path.',
        error: 'Missing local firmware package path.',
      });
      return {
        ok: false,
        filePath: payload.filePath,
        fileName: payload.fileName,
        error: 'Missing local firmware package path.',
      };
    }

    if (!(await Bun.file(packagePath).exists())) {
      emit({
        status: 'failed',
        phase: 'prepare',
        stepLabel: 'Local firmware package not found.',
        error: `Local firmware package not found: ${packagePath}`,
      });
      return {
        ok: false,
        filePath: payload.filePath,
        fileName: payload.fileName,
        error: `Local firmware package not found: ${packagePath}`,
      };
    }

    emit({
      status: 'starting',
      phase: 'prepare',
      stepLabel: `Started extraction: ${payload.fileName}`,
    });

    const extraction = await ensureExtractedFirmwarePackage({
      packagePath,
      extractedDir: payload.extractedDir,
      signal: rescueController.signal,
      onProcess: (process) => {
        const active = activeRescues.get(downloadId);
        if (active) {
          active.activeProcess = process;
        }
      },
      onLog: (line) => {
        emit({
          status: 'preparing',
          phase: 'prepare',
          stepLabel: `[extract] ${line}`,
        });
      },
    });

    emit({
      status: 'completed',
      phase: 'prepare',
      stepLabel: extraction.reusedExtraction
        ? 'Extraction skipped (already extracted).'
        : 'Extraction completed.',
    });

    return {
      ok: true,
      filePath: payload.filePath,
      fileName: payload.fileName,
      extractedDir: extraction.extractDir,
      reusedExtraction: extraction.reusedExtraction,
    };
  } catch (error) {
    if (isAbortError(error) || activeRescues.get(downloadId)?.canceled) {
      emit({
        status: 'canceled',
        phase: 'prepare',
        stepLabel: 'Extraction canceled by user.',
      });
      return {
        ok: false,
        filePath: payload.filePath,
        fileName: payload.fileName,
        error: 'Extraction canceled by user.',
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    emit({
      status: 'failed',
      phase: 'prepare',
      stepLabel: `Extraction failed: ${message}`,
      error: message,
    });
    return {
      ok: false,
      filePath: payload.filePath,
      fileName: payload.fileName,
      error: message,
    };
  } finally {
    activeRescues.delete(downloadId);
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
    dataReset: 'yes' | 'no';
    dryRun?: boolean;
    flashTransport?: RescueFlashTransport;
    qdlStorage?: RescueQdlStorage;
    qdlSerial?: string;
    localPackagePath?: string;
    localExtractedDir?: string;
    romMatchIdentifier?: string;
  },
  onProgress: RescueProgressEmitter,
): Promise<RescueLiteFirmwareResponse> {
  const { downloadId, romUrl, romName, dataReset } = payload;
  const isDryRun = Boolean(payload.dryRun);
  const flashTransport = payload.flashTransport || 'fastboot';
  const qdlStorage = payload.qdlStorage || 'auto';
  const qdlSerial = payload.qdlSerial?.trim() || undefined;
  const rescueController = new AbortController();
  activeRescues.set(downloadId, {
    controller: rescueController,
    canceled: false,
    activeProcess: null,
  });

  let savePath = '';
  let bytesDownloaded = 0;
  let totalBytes = 0;
  let workDir = '';

  const emit = (
    progress: Partial<DownloadProgressMessage> & {
      status: DownloadProgressMessage['status'];
    },
  ) => {
    onProgress({
      downloadId,
      romUrl,
      romName,
      dryRun: isDryRun,
      flashTransport,
      qdlStorage,
      qdlSerial,
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
        throw new Error(`Local firmware package not found: ${payload.localPackagePath}`);
      }
      savePath = payload.localPackagePath;
      const packageStats = await stat(savePath);
      bytesDownloaded = packageStats.size;
      totalBytes = packageStats.size;
      reusedPackage = true;

      try {
        await writeFirmwareMetadata(savePath, {
          source: 'rescue-lite',
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
        status: 'starting',
        savePath,
        phase: 'download',
        stepLabel: 'Using selected local firmware package.',
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
            source: 'rescue-lite',
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
          status: 'starting',
          savePath,
          phase: 'download',
          stepLabel: 'Reusing existing firmware package from Downloads.',
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

            if (progress.status === 'completed') {
              emit({
                status: 'preparing',
                savePath: progress.savePath,
                phase: 'prepare',
                stepLabel: 'Download finished. Preparing firmware package...',
              });
              return;
            }

            emit({
              ...progress,
              phase: 'download',
            });
          },
        );

        if (!downloadResult.ok) {
          return {
            ok: false,
            downloadId,
            error: downloadResult.error || 'Rescue Lite download failed.',
          };
        }

        if (!downloadResult.savePath) {
          throw new Error('Downloaded package path is missing.');
        }

        savePath = downloadResult.savePath;
        bytesDownloaded = downloadResult.bytesDownloaded ?? bytesDownloaded;
        totalBytes = downloadResult.totalBytes ?? totalBytes;
      }
    }

    if (rescueController.signal.aborted || activeRescues.get(downloadId)?.canceled) {
      const abortError = new Error('Rescue Lite canceled by user.');
      abortError.name = 'AbortError';
      throw abortError;
    }

    // Package is ready. We can now proceed to extraction or command processing.
    const linkedExtractDir =
      payload.localExtractedDir?.trim() || getExtractDirForPackagePath(savePath);
    workDir = linkedExtractDir;

    if (hasUsableExtractedRescueScripts(workDir)) {
      reusedExtraction = true;
      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel: 'Reusing existing extracted firmware directory.',
      });
    } else {
      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel: 'Extracting firmware package...',
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
      onLog: (line) => {
        emit({
          status: 'preparing',
          savePath,
          phase: 'prepare',
          stepLabel: `[extract] ${line}`,
        });
      },
    });
    workDir = extraction.extractDir;
    reusedExtraction = reusedExtraction || extraction.reusedExtraction;

    let recipeHints: RescueRecipeHints | undefined;
    try {
      recipeHints = await resolveRescueRecipeHints(payload, dataReset);
      if (recipeHints) {
        emit({
          status: 'preparing',
          savePath,
          phase: 'prepare',
          stepLabel: `Recipe hints loaded (${recipeHints.referenceCount} references) from ${recipeHints.source}.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel: `Recipe hints unavailable (${message}). Continuing with local script detection.`,
      });
    }

    const { commands, commandPlan, commandSource, xmlWarnings } = await buildRescueCommandPlan({
      workDir,
      dataReset,
      flashTransport,
      qdlStorage,
      qdlSerial,
      recipeHints,
    });

    emit({
      status: 'preparing',
      savePath,
      phase: 'prepare',
      commandSource,
      stepLabel: `Using rescue command source: ${commandSource}`,
    });
    if (isDryRun) {
      console.log(
        `[RescueLite:dry-run] ${downloadId} source=${commandSource} commands=${commandPlan.length}`,
      );
      for (const command of commandPlan) {
        console.log(`[RescueLite:dry-run] ${command}`);
      }

      for (let index = 0; index < commands.length; index += 1) {
        const command = commands[index];
        if (!command) {
          continue;
        }
        emit({
          status: 'flashing',
          savePath,
          phase: 'flash',
          commandSource,
          stepIndex: index + 1,
          stepTotal: commands.length,
          stepLabel: command.label,
        });
      }

      emit({
        status: 'completed',
        savePath,
        phase: 'flash',
        commandSource,
        stepIndex: commands.length,
        stepTotal: commands.length,
        stepLabel: 'Dry run completed. No commands executed.',
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
        flashTransport,
        qdlStorage,
        qdlSerial,
      };
    }

    const setActiveProcess = (process: Bun.Subprocess | null) => {
      const active = activeRescues.get(downloadId);
      if (active) {
        active.activeProcess = process;
      }
    };

    const hasFastbootCommands = commands.some((command) => command.tool === 'fastboot');
    const hasEdlCommands = commands.some((command) => command.tool === 'edl-firehose');
    const hasUnisocCommands = commands.some((command) => command.tool === 'unisoc-pac');

    if (hasEdlCommands) {
      const qdlCommand = await resolveQdlCommand();
      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel:
          qdlCommand.source === 'bundled' || qdlCommand.source === 'custom'
            ? `Checking QDL executable availability (${qdlCommandDisplayName(qdlCommand.command)})...`
            : 'Checking QDL executable availability...',
      });
      const qdlAvailable = await isCommandAvailable({
        command: qdlCommand.command,
        args: ['--help'],
        cwd: workDir,
        signal: rescueController.signal,
        onProcess: setActiveProcess,
      });
      if (!qdlAvailable) {
        if (qdlCommand.source === 'bundled' || qdlCommand.source === 'custom') {
          throw new Error(
            `EDL/firehose rescue could not execute ${qdlCommandDisplayName(qdlCommand.command)}.`,
          );
        }
        throw new Error('EDL/firehose rescue requires `qdl` in PATH. Install qdl and retry.');
      }

      if (process.platform === 'win32') {
        emit({
          status: 'preparing',
          savePath,
          phase: 'prepare',
          stepLabel: 'Ensuring Windows Qualcomm 9008 USB driver...',
        });
        const driverEnsureResult = await ensureWindowsQdloaderDriver({
          cwd: workDir,
          signal: rescueController.signal,
          onProcess: setActiveProcess,
        });
        emit({
          status: 'preparing',
          savePath,
          phase: 'prepare',
          stepLabel: driverEnsureResult.detail,
        });
      }

      const usbProbe = await probeQualcommEdlUsb({
        cwd: workDir,
        signal: rescueController.signal,
        onProcess: setActiveProcess,
      });
      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel: usbProbe.detail,
      });

      let edlReady = usbProbe.detected === true;
      if (!edlReady) {
        emit({
          status: 'preparing',
          savePath,
          phase: 'prepare',
          stepLabel: 'No EDL device found. Trying adb reboot edl...',
        });

        const rebootedToEdl = await tryAdbRebootEdl(
          rescueController.signal,
          workDir,
          setActiveProcess,
        );

        if (rebootedToEdl) {
          emit({
            status: 'preparing',
            savePath,
            phase: 'prepare',
            stepLabel: 'adb reboot edl sent. Waiting for EDL USB device...',
          });

          if (process.platform === 'linux') {
            for (let attempt = 0; attempt < 20; attempt += 1) {
              if (rescueController.signal.aborted) {
                const abortError = new Error('Operation aborted.');
                abortError.name = 'AbortError';
                throw abortError;
              }

              await wait(1000);
              const followUpProbe = await probeQualcommEdlUsb({
                cwd: workDir,
                signal: rescueController.signal,
                onProcess: setActiveProcess,
              });
              if (followUpProbe.detected) {
                edlReady = true;
                emit({
                  status: 'preparing',
                  savePath,
                  phase: 'prepare',
                  stepLabel: followUpProbe.detail,
                });
                break;
              }
            }
          }
        }

        if (!edlReady && process.platform === 'linux') {
          throw new Error(
            'No Qualcomm EDL USB device detected (05c6:9008). Put the phone in EDL mode manually and retry.',
          );
        }
      }
    }

    if (hasFastbootCommands) {
      let fastbootReady = await hasFastbootDevice(
        rescueController.signal,
        workDir,
        setActiveProcess,
      );
      if (!fastbootReady) {
        emit({
          status: 'preparing',
          savePath,
          phase: 'prepare',
          stepLabel: 'No fastboot device found. Trying adb reboot bootloader...',
        });
        await tryAdbRebootBootloader(rescueController.signal, workDir, setActiveProcess);
        for (let attempt = 0; attempt < 30; attempt += 1) {
          if (rescueController.signal.aborted) {
            const abortError = new Error('Operation aborted.');
            abortError.name = 'AbortError';
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
        throw new Error('No fastboot device detected. Put the phone in fastboot mode and retry.');
      }
    }

    if (hasUnisocCommands) {
      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel: 'Checking Unisoc PAC tool availability...',
      });

      const unisocToolCandidates = resolveUnisocPacToolCandidates();
      let resolvedTool = '';
      for (const candidate of unisocToolCandidates) {
        const available = await isCommandAvailable({
          command: candidate,
          args: [],
          cwd: workDir,
          signal: rescueController.signal,
          onProcess: setActiveProcess,
        });
        if (!available) {
          continue;
        }
        resolvedTool = candidate;
        break;
      }

      if (!resolvedTool) {
        throw new Error(
          `Unisoc PAC rescue requires spd-tool in PATH (${unisocToolCandidates.join(', ')}). ` +
            'Install github:enigma550/spd-tool-bun or set RESCUE_UNISOC_TOOL to override the executable path.',
        );
      }

      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel: `Using Unisoc PAC tool: ${resolvedTool}`,
      });
    }

    if (xmlWarnings.length > 0) {
      emit({
        status: 'preparing',
        savePath,
        phase: 'prepare',
        stepLabel: `XML parsing notes: ${xmlWarnings.length} step(s) skipped/adjusted.`,
      });
    }

    await runRescueCommandPlan({
      preparedCommands: commands,
      workDir,
      signal: rescueController.signal,
      onProcess: setActiveProcess,
      onStep: ({ stepIndex, stepTotal, stepLabel }) => {
        emit({
          status: 'flashing',
          savePath,
          phase: 'flash',
          commandSource,
          stepIndex,
          stepTotal,
          stepLabel,
        });
      },
    });

    emit({
      status: 'completed',
      savePath,
      phase: 'flash',
      commandSource,
      stepIndex: commands.length,
      stepTotal: commands.length,
      stepLabel: 'Rescue Lite completed.',
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
      flashTransport,
      qdlStorage,
      qdlSerial,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isAbortError(error) || activeRescues.get(downloadId)?.canceled) {
      emit({
        status: 'canceled',
        savePath: savePath || undefined,
        phase: 'flash',
        error: '',
      });
      return {
        ok: false,
        downloadId,
        error: 'Rescue Lite canceled by user.',
      };
    }

    emit({
      status: 'failed',
      savePath: savePath || undefined,
      phase: 'flash',
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
