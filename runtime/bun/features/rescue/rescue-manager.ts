/**
 * Rescue Manager — orchestrator.
 *
 * Split into focused submodules:
 *   - rescue-active-tracker.ts     — Active rescue tracking, cancel, shared helpers
 *   - rescue-extract-local.ts      — Local firmware extraction
 *   - rescue-device-readiness.ts   — Device readiness checks and mode transitions
 *
 * This file keeps the main `rescueLiteFirmwareWithProgress` orchestration.
 */
import { mkdir, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type {
  DownloadProgressMessage,
  RescueFlashTransport,
  RescueLiteFirmwareResponse,
  RescueQdlStorage,
} from '../../../shared/desktop-rpc';
import { notifyTaskCompleted } from '../../desktop-notifications.ts';
import { downloadFirmwareWithProgress } from '../../download-manager.ts';
import { writeFirmwareMetadata } from '../../firmware-metadata.ts';
import {
  ensureExtractedFirmwarePackage,
  findReusableFirmwarePackagePath,
  getDownloadDirectory,
  getExtractDirForPackagePath,
  hasUsableExtractedRescueScripts,
} from '../../firmware-package-utils.ts';
import { runRescueCommandPlan } from './commands/run-rescue-command-plan';
import { buildRescueCommandPlan } from './facade/rescue-command-plan-facade.ts';
import { type RescueRecipeHints, resolveRescueRecipeHints } from './recipe-resolver.ts';
import {
  activeRescues,
  hasActiveRescue,
  isAbortError,
  type RescueProgressEmitter,
} from './rescue-active-tracker.ts';
import { ensureDeviceReadiness } from './rescue-device-readiness.ts';

// Re-export public API from submodules
export { cancelActiveRescue } from './rescue-active-tracker.ts';
export { extractLocalFirmwarePackage } from './rescue-extract-local.ts';

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

  if (hasActiveRescue(downloadId)) {
    return {
      ok: false,
      downloadId,
      error: 'Another Rescue Lite operation is already running.',
    };
  }

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

    await ensureDeviceReadiness({
      commands,
      workDir,
      signal: rescueController.signal,
      savePath,
      setActiveProcess,
      emit,
    });

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
      onConsoleLine: ({ message, tone }) => {
        emit({
          status: 'flashing',
          savePath,
          phase: 'flash',
          commandSource,
          consoleLine: message,
          consoleTone: tone,
        });
      },
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

    notifyTaskCompleted({
      title: 'Flash completed',
      body: romName,
      subtitle: flashTransport === 'qdl' ? 'Rescue Lite' : `Rescue Lite (${flashTransport})`,
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
