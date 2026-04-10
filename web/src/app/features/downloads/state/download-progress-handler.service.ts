/**
 * Download progress event handler.
 * Processes desktop bridge progress events and updates download/history state.
 */
import { Injectable, inject } from '@angular/core';
import { mapDownloadProgressMessage } from '../../../core/api/desktop-response.mapper';
import type { FirmwareDownloadState } from '../../../shared/state/workflow.types';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';
import { canceledToastLabel, completedStatusLabel } from './download-utils';

const DOWNLOAD_PROGRESS_EVENT_NAME = 'desktop-download-progress';
type DesktopBridgePayload = object | string | number | boolean | null | undefined;

export type DownloadStateAccessor = {
  firmwareDownload: () => FirmwareDownloadState;
  setFirmwareDownload: (state: FirmwareDownloadState) => void;
  findDownloadHistoryEntry: (downloadId: string) => FirmwareDownloadState | undefined;
  upsertDownloadHistory: (state: FirmwareDownloadState) => void;
  isDismissed: (downloadId: string) => boolean;
  removeDismissed: (downloadId: string) => void;
  isDownloadActive: () => boolean;
  showFailureToastOnce: (downloadId: string, message: string, timeoutMs?: number) => void;
};

@Injectable({ providedIn: 'root' })
export class DownloadProgressHandlerService {
  private readonly ui = inject(WorkflowUiService);
  private accessor: DownloadStateAccessor | null = null;

  registerAccessor(accessor: DownloadStateAccessor) {
    this.accessor = accessor;
  }

  startListening() {
    window.addEventListener(
      DOWNLOAD_PROGRESS_EVENT_NAME,
      this.handleDownloadProgressEvent as EventListener,
    );
  }

  private readonly handleDownloadProgressEvent = (event: Event) => {
    const accessor = this.accessor;
    if (!accessor) return;

    const customEvent = event as CustomEvent<DesktopBridgePayload>;
    const payload = mapDownloadProgressMessage(customEvent.detail);
    if (!payload) return;

    if (accessor.isDismissed(payload.downloadId)) {
      if (
        payload.status === 'completed' ||
        payload.status === 'failed' ||
        payload.status === 'canceled'
      ) {
        accessor.removeDismissed(payload.downloadId);
      }
      return;
    }

    const existing = accessor.findDownloadHistoryEntry(payload.downloadId);
    const currentDownload = accessor.firmwareDownload();
    const fallback = currentDownload.downloadId === payload.downloadId ? currentDownload : null;
    const isStandaloneExtract = payload.commandSource === 'local-extract' && !existing;

    const nextState: FirmwareDownloadState = {
      downloadId: payload.downloadId,
      romUrl: payload.romUrl,
      romName: payload.romName,
      status: payload.status,
      mode: isStandaloneExtract ? 'rescue-lite' : existing?.mode || fallback?.mode || 'download',
      dryRun: payload.dryRun ?? existing?.dryRun ?? fallback?.dryRun ?? false,
      dataReset: existing?.dataReset || fallback?.dataReset || 'no',
      flashTransport:
        payload.flashTransport ||
        existing?.flashTransport ||
        fallback?.flashTransport ||
        'fastboot',
      qdlStorage: payload.qdlStorage || existing?.qdlStorage || fallback?.qdlStorage || 'auto',
      qdlSerial: payload.qdlSerial || existing?.qdlSerial || fallback?.qdlSerial || '',
      savePath: payload.savePath || existing?.savePath || fallback?.savePath || '',
      publishDate: existing?.publishDate || fallback?.publishDate,
      romMatchIdentifier: existing?.romMatchIdentifier || fallback?.romMatchIdentifier,
      downloadedBytes: payload.downloadedBytes,
      totalBytes: payload.totalBytes || existing?.totalBytes || fallback?.totalBytes || null,
      speedBytesPerSecond:
        payload.speedBytesPerSecond ||
        existing?.speedBytesPerSecond ||
        fallback?.speedBytesPerSecond ||
        0,
      phase: payload.phase || existing?.phase || fallback?.phase,
      stepIndex: payload.stepIndex || existing?.stepIndex || fallback?.stepIndex || null,
      stepTotal: payload.stepTotal || existing?.stepTotal || fallback?.stepTotal || null,
      stepLabel: payload.stepLabel || existing?.stepLabel || fallback?.stepLabel || '',
      commandSource:
        payload.commandSource || existing?.commandSource || fallback?.commandSource || '',
      consoleLine: payload.consoleLine || '',
      consoleTone: payload.consoleTone,
      error: payload.error || '',
    };

    accessor.setFirmwareDownload(nextState);
    if (!isStandaloneExtract) {
      accessor.upsertDownloadHistory(nextState);
    }

    if (isStandaloneExtract && payload.status === 'starting') {
      this.ui.status.set('Starting extraction...');
    } else if (payload.status === 'downloading') {
      this.ui.status.set('Downloading');
    } else if (payload.status === 'preparing') {
      this.ui.status.set(
        payload.stepLabel ||
          (isStandaloneExtract ? 'Extracting firmware package...' : 'Preparing rescue package...'),
      );
    } else if (payload.status === 'flashing') {
      const progressText =
        typeof nextState.stepIndex === 'number' && typeof nextState.stepTotal === 'number'
          ? ` (${nextState.stepIndex}/${nextState.stepTotal})`
          : '';
      this.ui.status.set(`Flashing${progressText}`);
    } else if (payload.status === 'completed') {
      if (isStandaloneExtract) {
        this.ui.status.set('Extraction completed.');
      } else {
        this.ui.status.set(completedStatusLabel(nextState.mode, nextState.dryRun));
      }
    } else if (payload.status === 'failed') {
      const message =
        payload.error || (isStandaloneExtract ? 'Extraction failed.' : 'Download failed.');
      this.ui.errorMessage.set(message);
      accessor.showFailureToastOnce(payload.downloadId, message, 4200);
      if (!accessor.isDownloadActive()) {
        this.ui.status.set('Idle');
      }
    } else if (payload.status === 'canceled') {
      this.ui.errorMessage.set('');
      if (isStandaloneExtract) {
        this.ui.status.set('Extraction canceled.');
        this.ui.showToast(`Extraction canceled: ${nextState.romName}`, 'info', 2600);
      } else {
        const label = canceledToastLabel(nextState.mode);
        this.ui.status.set(`${label} canceled: ${nextState.romName}.`);
        this.ui.showToast(`${label} canceled: ${nextState.romName}`, 'info', 2600);
      }
    }
  };
}
