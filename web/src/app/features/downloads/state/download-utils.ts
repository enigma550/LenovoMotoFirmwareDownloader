import {
  fileNameFromUrl,
  findBestLocalFileMatchForVariant as findBestLocalFileMatchForVariantInCore,
  findLookupVariantForLocalFile as findLookupVariantForLocalFileInCore,
  getPreferredVariantFileName,
  getVariantCandidateFileNames as getVariantCandidateFileNamesInCore,
  normalizeFileName,
} from '../../../../../../core/features/downloads/index';
import type {
  FirmwareVariant,
  LocalDownloadedFile,
  RescueFlashTransport,
} from '../../../core/models/desktop-api.ts';
import type {
  DataResetChoice,
  DownloadHistoryEntry,
  DownloadMode,
  DownloadStatus,
} from '../../../shared/state/workflow.types';

export function isInProgressStatus(status: DownloadStatus): boolean {
  return (
    status === 'starting' ||
    status === 'downloading' ||
    status === 'paused' ||
    status === 'preparing' ||
    status === 'flashing' ||
    status === 'canceling'
  );
}

export function isCancelingStatus(status: DownloadStatus) {
  return status === 'canceling';
}

export function cancelButtonLabel(status: DownloadStatus) {
  return isCancelingStatus(status) ? 'DOWNLOADS.CANCELLING' : 'COMMON.CANCEL';
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function dataResetLabel(choice: DataResetChoice) {
  return choice === 'yes' ? 'COMMON.YES' : 'COMMON.NO';
}

export function rescueDialogTitle(dryRun: boolean) {
  return dryRun ? 'RESCUE.DRY_RUN_TITLE' : 'RESCUE.TITLE';
}

export function rescueDialogDescription(dryRun: boolean) {
  return dryRun ? 'RESCUE.DIALOG_DESC_DRY' : 'RESCUE.DIALOG_DESC';
}

export function rescueExecutionLabel(dryRun: boolean) {
  return dryRun ? 'DOWNLOADS.EXEC_DRY_RUN' : 'DOWNLOADS.EXEC_LIVE';
}

export function flashTransportLabel(transport: RescueFlashTransport) {
  if (transport === 'qdl') {
    return 'TRANSPORT.QDL';
  }
  if (transport === 'unisoc') {
    return 'TRANSPORT.UNISOC';
  }
  if (transport === 'mediatek') {
    return 'TRANSPORT.MEDIATEK';
  }
  return 'TRANSPORT.FASTBOOT';
}

export function actionLabelFromMode(mode: DownloadMode, dryRun: boolean) {
  if (mode !== 'rescue-lite') {
    return 'DOWNLOADS.LABEL_DOWNLOAD';
  }
  return dryRun ? 'RESCUE.DRY_RUN_TITLE' : 'RESCUE.TITLE';
}

export function actionLabel(entry: DownloadHistoryEntry) {
  return actionLabelFromMode(entry.mode, entry.dryRun);
}

export function completedStatusLabel(mode: DownloadMode, dryRun: boolean) {
  if (mode !== 'rescue-lite') {
    return 'DOWNLOADS.COMPLETED';
  }
  return dryRun ? 'DOWNLOADS.RESCUE_DRY_COMPLETED' : 'DOWNLOADS.RESCUE_COMPLETED';
}

export function canceledStatusLabel(mode: DownloadMode) {
  return mode === 'rescue-lite' ? 'DOWNLOADS.RESCUE_CANCELED' : 'DOWNLOADS.CANCELED';
}

export function cancelingStatusLabel(mode: DownloadMode) {
  return mode === 'rescue-lite' ? 'DOWNLOADS.CANCELING_RESCUE' : 'DOWNLOADS.CANCELING_DOWNLOAD';
}

export function canceledToastLabel(mode: DownloadMode) {
  return mode === 'rescue-lite' ? 'DOWNLOADS.LABEL_RESCUE' : 'DOWNLOADS.LABEL_DOWNLOAD';
}

export function isRescueLiteEntry(entry: DownloadHistoryEntry) {
  return entry.mode === 'rescue-lite';
}

export function isRecipeGuidedEntry(entry: DownloadHistoryEntry) {
  return entry.commandSource?.includes('recipe-guided') || false;
}

export function rescueStepText(entry: DownloadHistoryEntry) {
  if (!isRescueLiteEntry(entry) || !entry.stepLabel) {
    return '';
  }
  if (
    entry.status === 'flashing' &&
    typeof entry.stepIndex === 'number' &&
    typeof entry.stepTotal === 'number'
  ) {
    return `[${entry.stepIndex}/${entry.stepTotal}] ${entry.stepLabel}`;
  }
  return entry.stepLabel;
}

export { fileNameFromUrl, getPreferredVariantFileName, normalizeFileName };

export function getVariantCandidateFileNames(variant: FirmwareVariant) {
  return getVariantCandidateFileNamesInCore(variant);
}

export function findBestLocalFileMatchForVariant(
  variant: FirmwareVariant,
  files: LocalDownloadedFile[],
) {
  return findBestLocalFileMatchForVariantInCore(variant, files);
}

export function findLookupVariantForLocalFile(
  file: LocalDownloadedFile,
  variants: FirmwareVariant[],
) {
  return findLookupVariantForLocalFileInCore(file.fileName, variants);
}
