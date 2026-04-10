/**
 * Download Workflow Service — orchestrator.
 *
 * Split into focused submodules:
 *   - download-progress-handler.service.ts — Desktop bridge progress event handler
 *   - download-local-files.service.ts      — Local file management (already separate)
 *   - download-utils.ts                    — Shared utility functions (already separate)
 *
 * This file keeps the public download API and history management.
 */
import { computed, Injectable, inject, signal } from '@angular/core';
import { DownloadsDesktopApiService } from '../../../core/api/desktop';
import type {
  FirmwareVariant,
  LocalDownloadedFile,
  RescueFlashTransport,
  RescueLiteFirmwareResponse,
  RescueQdlStorage,
} from '../../../core/models/desktop-api.ts';
import type {
  DataResetChoice,
  DownloadHistoryEntry,
  DownloadMode,
  FirmwareDownloadState,
  RescueDryRunPlanDialog,
} from '../../../shared/state/workflow.types';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';
import { DownloadLocalFilesService } from './download-local-files.service';
import { DownloadProgressHandlerService } from './download-progress-handler.service';
import {
  canceledStatusLabel,
  cancelingStatusLabel,
  completedStatusLabel,
  dataResetLabel,
  findBestLocalFileMatchForVariant,
  flashTransportLabel,
  getPreferredVariantFileName,
  isInProgressStatus,
} from './download-utils';

function createIdleDownloadState(): FirmwareDownloadState {
  return {
    downloadId: '',
    romUrl: '',
    romName: '',
    status: 'idle',
    mode: 'download',
    dryRun: false,
    dataReset: 'no',
    flashTransport: 'fastboot',
    qdlStorage: 'auto',
    qdlSerial: '',
    savePath: '',
    downloadedBytes: 0,
    totalBytes: null,
    speedBytesPerSecond: 0,
    phase: undefined,
    stepIndex: null,
    stepTotal: null,
    stepLabel: '',
    commandSource: '',
    consoleLine: '',
    consoleTone: undefined,
    error: '',
  };
}

type DownloadStartOptions = {
  mode: DownloadMode;
  dryRun: boolean;
  dataReset: DataResetChoice;
  flashTransport: RescueFlashTransport;
  qdlStorage: RescueQdlStorage;
  qdlSerial?: string;
  localFile?: LocalDownloadedFile;
};

function isActiveRescueEntry(state: FirmwareDownloadState) {
  return state.mode === 'rescue-lite' && isInProgressStatus(state.status);
}

@Injectable({ providedIn: 'root' })
export class DownloadWorkflowService {
  private readonly backend = inject(DownloadsDesktopApiService);
  private readonly ui = inject(WorkflowUiService);
  private readonly localFiles = inject(DownloadLocalFilesService);
  private readonly progressHandler = inject(DownloadProgressHandlerService);
  private readonly dismissedDownloadIds = new Set<string>();
  private readonly recentFailureToasts = new Set<string>();

  readonly firmwareDownload = signal<FirmwareDownloadState>(createIdleDownloadState());
  readonly downloadHistory = signal<DownloadHistoryEntry[]>([]);
  readonly localDownloadedFiles = this.localFiles.localDownloadedFiles;
  readonly rescueDryRunPlanDialog = signal<RescueDryRunPlanDialog | null>(null);

  readonly isDownloadActive = computed(() =>
    this.downloadHistory().some((entry) => isInProgressStatus(entry.status)),
  );
  readonly isRescueActive = computed(() =>
    this.downloadHistory().some((entry) => isActiveRescueEntry(entry)),
  );

  readonly firmwareDownloadPercent = computed<number | null>(() => {
    const download = this.firmwareDownload();
    if (!download.totalBytes || download.totalBytes <= 0) {
      return download.status === 'completed' ? 100 : null;
    }
    return Math.min(100, (download.downloadedBytes / download.totalBytes) * 100);
  });

  constructor() {
    this.progressHandler.registerAccessor({
      firmwareDownload: () => this.firmwareDownload(),
      setFirmwareDownload: (state) => this.firmwareDownload.set(state),
      findDownloadHistoryEntry: (id) => this.findDownloadHistoryEntry(id),
      upsertDownloadHistory: (state) => this.upsertDownloadHistory(state),
      isDismissed: (id) => this.dismissedDownloadIds.has(id),
      removeDismissed: (id) => this.dismissedDownloadIds.delete(id),
      isDownloadActive: () => this.isDownloadActive(),
      showFailureToastOnce: (id, msg, ms) => this.showFailureToastOnce(id, msg, ms),
    });
    this.progressHandler.startListening();
  }

  async downloadFirmwareVariant(variant: FirmwareVariant) {
    await this.startVariantDownload(variant, {
      mode: 'download',
      dryRun: false,
      dataReset: 'no',
      flashTransport: 'fastboot',
      qdlStorage: 'auto',
      qdlSerial: '',
    });
  }

  async rescueLiteDownloadVariant(
    variant: FirmwareVariant,
    dataReset: DataResetChoice,
    dryRun = false,
    flashTransport: RescueFlashTransport = 'fastboot',
    qdlStorage: RescueQdlStorage = 'auto',
    qdlSerial = '',
  ) {
    await this.startVariantDownload(variant, {
      mode: 'rescue-lite',
      dryRun,
      dataReset,
      flashTransport,
      qdlStorage,
      qdlSerial,
    });
  }

  async rescueLiteLocalFile(
    file: LocalDownloadedFile,
    dataReset: DataResetChoice,
    dryRun = false,
    flashTransport: RescueFlashTransport = 'fastboot',
    qdlStorage: RescueQdlStorage = 'auto',
    qdlSerial = '',
  ) {
    const variant = {
      romName: file.fileName,
      romUrl: file.fullPath,
      publishDate: file.publishDate,
      romMatchIdentifier: file.romMatchIdentifier || '',
      recipeUrl: file.recipeUrl,
      selectedParameters: file.selectedParameters || {},
    } as FirmwareVariant;
    await this.startVariantDownload(variant, {
      mode: 'rescue-lite',
      dryRun,
      dataReset,
      flashTransport,
      qdlStorage,
      qdlSerial,
      localFile: file,
    });
  }

  async extractLocalFirmware(file: LocalDownloadedFile) {
    await this.localFiles.extractLocalFirmware(file);
  }

  async attachLocalRecipeFromModel(
    file: LocalDownloadedFile,
    model: { modelName: string; marketName?: string; category?: string },
  ) {
    await this.localFiles.attachLocalRecipeFromModel(file, model);
  }

  async attachLocalRecipeFromVariant(file: LocalDownloadedFile, variant: FirmwareVariant) {
    return this.localFiles.attachLocalRecipeFromVariant(file, variant);
  }

  async attachVariantRecipeToMatchingLocalZip(variant: FirmwareVariant) {
    return this.localFiles.attachVariantRecipeToMatchingLocalZip(variant);
  }

  clearRescueDryRunPlanDialog() {
    this.rescueDryRunPlanDialog.set(null);
  }

  private async startVariantDownload(variant: FirmwareVariant, options: DownloadStartOptions) {
    if (options.mode === 'rescue-lite' && this.isRescueActive()) {
      const message = 'Another Rescue Lite operation is already running.';
      this.ui.errorMessage.set(message);
      this.ui.status.set('Rescue Lite already running.');
      this.ui.showToast(message, 'info', 3200);
      return;
    }

    if (options.mode === 'download' && !options.localFile) {
      await this.refreshLocalDownloadedFiles();
      const existingLocalFile = findBestLocalFileMatchForVariant(
        variant,
        this.localDownloadedFiles(),
      );
      if (existingLocalFile) {
        const preferredFileName = getPreferredVariantFileName(variant);
        const message = `Download skipped. Archive already exists: ${existingLocalFile.fileName}`;
        this.ui.errorMessage.set(message);
        this.ui.status.set('Download skipped (already exists).');
        this.ui.showToast(
          `Already downloaded: ${preferredFileName}. Use the local file from Downloads.`,
          'info',
          4200,
        );
        return;
      }
    }

    const downloadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.dismissedDownloadIds.delete(downloadId);
    if (options.mode === 'rescue-lite' && options.dryRun) {
      this.rescueDryRunPlanDialog.set(null);
    }
    this.ui.errorMessage.set('');
    const nextState: FirmwareDownloadState = {
      downloadId,
      romUrl: options.localFile?.fullPath || variant.romUrl,
      romName: options.localFile?.fileName || variant.romName,
      status: 'starting',
      mode: options.mode,
      dryRun: options.dryRun,
      dataReset: options.dataReset,
      flashTransport: options.flashTransport,
      qdlStorage: options.qdlStorage,
      qdlSerial: options.qdlSerial?.trim() || '',
      savePath: '',
      publishDate: variant.publishDate,
      romMatchIdentifier: variant.romMatchIdentifier,
      downloadedBytes: 0,
      totalBytes: null,
      speedBytesPerSecond: 0,
      phase: undefined,
      stepIndex: null,
      stepTotal: null,
      stepLabel: '',
      commandSource: '',
      consoleLine: '',
      consoleTone: undefined,
      error: '',
    };
    this.firmwareDownload.set(nextState);
    this.upsertDownloadHistory(nextState);
    if (options.mode === 'rescue-lite') {
      this.ui.status.set('Rescue Lite: Starting firmware package download...');
      this.ui.showToast(
        `Rescue Lite${options.dryRun ? ' (Dry run)' : ''} started (${options.localFile?.fileName || variant.romName}) | Data reset: ${dataResetLabel(options.dataReset)} | Transport: ${flashTransportLabel(options.flashTransport)}`,
        'info',
        2600,
      );
    } else {
      this.ui.status.set('Starting download...');
      this.ui.showToast(`Starting download: ${variant.romName}`, 'info', 1800);
    }

    try {
      const response =
        options.mode === 'rescue-lite'
          ? options.localFile
            ? await this.backend.rescueLiteFirmwareFromLocal({
                downloadId,
                filePath: options.localFile.fullPath,
                fileName: options.localFile.fileName,
                extractedDir: options.localFile.extractedDir,
                publishDate: variant.publishDate,
                romMatchIdentifier: variant.romMatchIdentifier,
                selectedParameters: variant.selectedParameters,
                recipeUrl: variant.recipeUrl,
                dataReset: options.dataReset,
                dryRun: options.dryRun,
                flashTransport: options.flashTransport,
                qdlStorage: options.qdlStorage,
                qdlSerial: options.qdlSerial?.trim() || undefined,
              })
            : await this.backend.rescueLiteFirmware({
                downloadId,
                romUrl: variant.romUrl,
                romName: variant.romName,
                publishDate: variant.publishDate,
                romMatchIdentifier: variant.romMatchIdentifier,
                selectedParameters: variant.selectedParameters,
                recipeUrl: variant.recipeUrl,
                dataReset: options.dataReset,
                dryRun: options.dryRun,
                flashTransport: options.flashTransport,
                qdlStorage: options.qdlStorage,
                qdlSerial: options.qdlSerial?.trim() || undefined,
              })
          : await this.backend.downloadFirmware({
              downloadId,
              romUrl: variant.romUrl,
              romName: variant.romName,
              publishDate: variant.publishDate,
              romMatchIdentifier: variant.romMatchIdentifier,
              selectedParameters: variant.selectedParameters,
              recipeUrl: variant.recipeUrl,
            });

      if (this.dismissedDownloadIds.has(downloadId)) {
        return;
      }

      if (!response.ok) {
        const message = response.error || 'Download failed.';
        const existing = this.findDownloadHistoryEntry(downloadId);
        if (existing && (existing.status === 'canceling' || existing.status === 'canceled')) {
          this.ui.status.set(canceledStatusLabel(options.mode));
          return;
        }

        const failedState: FirmwareDownloadState = {
          downloadId,
          romUrl: options.localFile?.fullPath || variant.romUrl,
          romName: options.localFile?.fileName || variant.romName,
          status: /cancel/i.test(message) ? 'canceled' : 'failed',
          mode: existing?.mode || options.mode,
          dryRun: existing?.dryRun ?? options.dryRun,
          dataReset: existing?.dataReset || options.dataReset,
          flashTransport: existing?.flashTransport || options.flashTransport,
          qdlStorage: existing?.qdlStorage || options.qdlStorage,
          qdlSerial: existing?.qdlSerial || options.qdlSerial?.trim() || '',
          savePath: existing?.savePath || '',
          downloadedBytes: existing?.downloadedBytes || 0,
          totalBytes: existing?.totalBytes ?? null,
          speedBytesPerSecond: 0,
          phase: existing?.phase,
          stepIndex: existing?.stepIndex ?? null,
          stepTotal: existing?.stepTotal ?? null,
          stepLabel: existing?.stepLabel || '',
          commandSource: existing?.commandSource || '',
          consoleLine: '',
          consoleTone: undefined,
          error: /cancel/i.test(message) ? '' : message,
        };
        this.firmwareDownload.set(failedState);
        this.upsertDownloadHistory(failedState);

        if (failedState.status === 'canceled') {
          this.ui.status.set(canceledStatusLabel(options.mode));
          return;
        }

        this.ui.errorMessage.set(message);
        this.ui.status.set('Idle');
        this.showFailureToastOnce(downloadId, message, 4200);
        return;
      }

      const existing = this.findDownloadHistoryEntry(downloadId);
      const completedState: FirmwareDownloadState = {
        downloadId,
        romUrl: options.localFile?.fullPath || variant.romUrl,
        romName: options.localFile?.fileName || variant.romName,
        status: response.status || 'completed',
        mode: existing?.mode || options.mode,
        dryRun: existing?.dryRun ?? options.dryRun,
        dataReset: existing?.dataReset || options.dataReset,
        flashTransport: existing?.flashTransport || options.flashTransport,
        qdlStorage: existing?.qdlStorage || options.qdlStorage,
        qdlSerial: existing?.qdlSerial || options.qdlSerial?.trim() || '',
        savePath: response.savePath || existing?.savePath || '',
        downloadedBytes: response.bytesDownloaded ?? existing?.downloadedBytes ?? 0,
        totalBytes: response.totalBytes ?? existing?.totalBytes ?? null,
        speedBytesPerSecond: 0,
        phase: existing?.phase,
        stepIndex: existing?.stepIndex ?? null,
        stepTotal: existing?.stepTotal ?? null,
        stepLabel: existing?.stepLabel || '',
        commandSource: existing?.commandSource || '',
        consoleLine: '',
        consoleTone: undefined,
        error: '',
      };
      this.firmwareDownload.set(completedState);
      this.upsertDownloadHistory(completedState);

      const doneLabel = completedStatusLabel(options.mode, options.dryRun);
      this.ui.status.set(doneLabel);
      this.ui.showToast(doneLabel, 'success', 3200);

      if (
        options.mode === 'rescue-lite' &&
        options.dryRun &&
        'commandPlan' in response &&
        Array.isArray(response.commandPlan) &&
        response.commandPlan.length > 0
      ) {
        const rescueResponse = response as RescueLiteFirmwareResponse;
        this.rescueDryRunPlanDialog.set({
          downloadId,
          romName: options.localFile?.fileName || variant.romName,
          commandSource: rescueResponse.commandSource || 'unknown',
          commands: rescueResponse.commandPlan || [],
          dataReset: options.dataReset,
          flashTransport: options.flashTransport,
          qdlStorage: options.qdlStorage,
          qdlSerial: options.qdlSerial?.trim() || '',
          localFilePath: options.localFile?.fullPath,
        });
      }

      void this.refreshLocalDownloadedFiles();
    } catch (error) {
      if (this.dismissedDownloadIds.has(downloadId)) {
        return;
      }

      const message = this.ui.getErrorMessage(error);
      const existing = this.findDownloadHistoryEntry(downloadId);
      const failedState: FirmwareDownloadState = {
        downloadId,
        romUrl: options.localFile?.fullPath || variant.romUrl,
        romName: options.localFile?.fileName || variant.romName,
        status: 'failed',
        mode: existing?.mode || options.mode,
        dryRun: existing?.dryRun ?? options.dryRun,
        dataReset: existing?.dataReset || options.dataReset,
        flashTransport: existing?.flashTransport || options.flashTransport,
        qdlStorage: existing?.qdlStorage || options.qdlStorage,
        qdlSerial: existing?.qdlSerial || options.qdlSerial?.trim() || '',
        savePath: existing?.savePath || '',
        downloadedBytes: existing?.downloadedBytes || 0,
        totalBytes: existing?.totalBytes ?? null,
        speedBytesPerSecond: 0,
        phase: existing?.phase,
        stepIndex: existing?.stepIndex ?? null,
        stepTotal: existing?.stepTotal ?? null,
        stepLabel: existing?.stepLabel || '',
        commandSource: existing?.commandSource || '',
        consoleLine: '',
        consoleTone: undefined,
        error: message,
      };
      this.firmwareDownload.set(failedState);
      this.upsertDownloadHistory(failedState);
      this.ui.errorMessage.set(message);
      this.ui.status.set('Idle');
      this.showFailureToastOnce(downloadId, message, 4200);
    }
  }

  async cancelDownloadById(downloadId: string) {
    const historyEntry = this.findDownloadHistoryEntry(downloadId);
    const activeDownload = this.firmwareDownload();
    const currentEntry =
      historyEntry ||
      (activeDownload.downloadId === downloadId
        ? {
            ...activeDownload,
            startedAt: Date.now(),
            updatedAt: Date.now(),
          }
        : null);

    if (!currentEntry || !isInProgressStatus(currentEntry.status)) {
      return;
    }

    const cancelingState: FirmwareDownloadState = {
      ...currentEntry,
      status: 'canceling',
      speedBytesPerSecond: 0,
      consoleLine: '',
      consoleTone: undefined,
      error: '',
    };

    if (historyEntry) {
      this.upsertDownloadHistory(cancelingState);
    }
    if (this.firmwareDownload().downloadId === downloadId) {
      this.firmwareDownload.set(cancelingState);
    }
    this.ui.status.set(cancelingStatusLabel(currentEntry.mode));

    try {
      const response = await this.backend.cancelDownload({
        downloadId,
      });

      if (!response.ok && response.status !== 'not_found') {
        throw new Error(response.error || 'Failed to cancel download.');
      }

      const canceledState: FirmwareDownloadState = {
        ...cancelingState,
        status: 'canceled',
        speedBytesPerSecond: 0,
        consoleLine: '',
        consoleTone: undefined,
      };

      if (historyEntry) {
        this.upsertDownloadHistory(canceledState);
      }
      if (this.firmwareDownload().downloadId === downloadId) {
        this.firmwareDownload.set(canceledState);
      }
      this.ui.status.set(canceledStatusLabel(currentEntry.mode));
    } catch (error) {
      const message = this.ui.getErrorMessage(error);
      const failedState: FirmwareDownloadState = {
        ...cancelingState,
        status: 'failed',
        speedBytesPerSecond: 0,
        consoleLine: '',
        consoleTone: undefined,
        error: message,
      };
      if (historyEntry) {
        this.upsertDownloadHistory(failedState);
      }
      if (this.firmwareDownload().downloadId === downloadId) {
        this.firmwareDownload.set(failedState);
      }
      this.ui.errorMessage.set(message);
      this.ui.status.set('Idle');
      this.ui.showToast(message, 'error', 4200);
    }
  }

  async pauseDownload(downloadId: string) {
    const currentEntry = this.findDownloadHistoryEntry(downloadId);
    if (!currentEntry) return;

    try {
      const response = await this.backend.pauseDownload({ downloadId });
      if (!response.ok) {
        throw new Error(response.error || 'Failed to pause download.');
      }
    } catch (error) {
      const message = this.ui.getErrorMessage(error);
      this.ui.showToast(message, 'error', 4200);
    }
  }

  async resumeDownload(downloadId: string) {
    const currentEntry = this.findDownloadHistoryEntry(downloadId);
    if (!currentEntry) return;

    try {
      const response = await this.backend.resumeDownload({ downloadId });
      if (!response.ok) {
        throw new Error(response.error || 'Failed to resume download.');
      }
    } catch (error) {
      const message = this.ui.getErrorMessage(error);
      this.ui.showToast(message, 'error', 4200);
    }
  }

  async deleteLocalFile(file: LocalDownloadedFile) {
    await this.localFiles.deleteLocalFile(file);
  }

  clearDownloadById(downloadId: string) {
    const entry = this.findDownloadHistoryEntry(downloadId);
    if (!entry) {
      return;
    }

    this.dismissedDownloadIds.add(downloadId);
    if (isInProgressStatus(entry.status)) {
      void this.backend.cancelDownload({ downloadId }).catch(() => undefined);
    }

    this.downloadHistory.update((current) =>
      current.filter((candidate) => candidate.downloadId !== downloadId),
    );

    if (this.firmwareDownload().downloadId === downloadId) {
      this.firmwareDownload.set(createIdleDownloadState());
    }
  }

  clearDownloadHistory() {
    for (const entry of this.downloadHistory()) {
      this.dismissedDownloadIds.add(entry.downloadId);
      if (isInProgressStatus(entry.status)) {
        void this.backend.cancelDownload({ downloadId: entry.downloadId }).catch(() => undefined);
      }
    }
    this.downloadHistory.set([]);
    this.firmwareDownload.set(createIdleDownloadState());
  }

  async refreshLocalDownloadedFiles() {
    await this.localFiles.refreshLocalDownloadedFiles();
  }

  private findDownloadHistoryEntry(downloadId: string) {
    return this.downloadHistory().find((entry) => entry.downloadId === downloadId);
  }

  private showFailureToastOnce(downloadId: string, message: string, timeoutMs = 4200) {
    const key = `${downloadId}:${message}`;
    if (this.recentFailureToasts.has(key)) {
      return;
    }
    this.recentFailureToasts.add(key);
    this.ui.showToast(message, 'error', timeoutMs);
    setTimeout(() => {
      this.recentFailureToasts.delete(key);
    }, timeoutMs + 2000);
  }

  private upsertDownloadHistory(state: FirmwareDownloadState) {
    const now = Date.now();
    this.downloadHistory.update((current) => {
      const index = current.findIndex((entry) => entry.downloadId === state.downloadId);
      if (index === -1) {
        const nextEntry: DownloadHistoryEntry = {
          ...state,
          startedAt: now,
          updatedAt: now,
        };
        return [nextEntry, ...current];
      }

      const existing = current[index];
      if (!existing) {
        return current;
      }
      const nextEntry: DownloadHistoryEntry = {
        ...existing,
        ...state,
        startedAt: existing.startedAt ?? now,
        updatedAt: now,
      };
      const next = current.slice();
      next[index] = nextEntry;
      return next;
    });
  }
}
