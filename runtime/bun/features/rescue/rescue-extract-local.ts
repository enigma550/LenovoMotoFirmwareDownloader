/**
 * Local firmware extraction logic.
 * Extracts a firmware archive from a local file path with progress reporting.
 */
import type {
  DownloadProgressMessage,
  ExtractLocalFirmwareResponse,
} from '../../../shared/desktop-rpc';
import { ensureExtractedFirmwarePackage } from '../../firmware-package-utils.ts';
import {
  activeRescues,
  isAbortError,
  type RescueProgressEmitter,
} from './rescue-active-tracker.ts';

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
