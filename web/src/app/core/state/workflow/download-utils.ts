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
} from '../../models/desktop-api.ts';
import type {
  DataResetChoice,
  DownloadHistoryEntry,
  DownloadMode,
  DownloadStatus,
} from './workflow.types';

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
  return isCancelingStatus(status) ? 'Cancelling...' : 'Cancel';
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
  return choice === 'yes' ? 'Yes' : 'No';
}

export function rescueDialogTitle(dryRun: boolean) {
  return dryRun ? 'Rescue Lite (Dry run)' : 'Rescue Lite';
}

export function rescueDialogDescription(dryRun: boolean) {
  if (dryRun) {
    return 'Dry run only parses rescue commands and prints the planned command sequence. No flashing is executed.';
  }
  return 'Rescue Lite executes firmware rescue commands from the selected package.';
}

export function rescueExecutionLabel(dryRun: boolean) {
  return dryRun ? 'Dry run' : 'Live flash';
}

export function flashTransportLabel(transport: RescueFlashTransport) {
  if (transport === 'qdl') {
    return 'QDL (EDL/Firehose)';
  }
  if (transport === 'unisoc') {
    return 'Unisoc PAC';
  }
  if (transport === 'mediatek') {
    return 'MediaTek (Fastboot)';
  }
  return 'Fastboot';
}

export function actionLabelFromMode(mode: DownloadMode, dryRun: boolean) {
  if (mode !== 'rescue-lite') {
    return 'Download';
  }
  return dryRun ? 'Rescue Lite (Dry run)' : 'Rescue Lite';
}

export function actionLabel(entry: DownloadHistoryEntry) {
  return actionLabelFromMode(entry.mode, entry.dryRun);
}

export function completedStatusLabel(mode: DownloadMode, dryRun: boolean) {
  if (mode !== 'rescue-lite') {
    return 'Download completed.';
  }
  return dryRun ? 'Rescue dry run completed.' : 'Rescue completed.';
}

export function canceledStatusLabel(mode: DownloadMode) {
  return mode === 'rescue-lite' ? 'Rescue canceled.' : 'Download canceled.';
}

export function cancelingStatusLabel(mode: DownloadMode) {
  return mode === 'rescue-lite' ? 'Cancelling rescue...' : 'Cancelling download...';
}

export function canceledToastLabel(mode: DownloadMode) {
  return mode === 'rescue-lite' ? 'Rescue' : 'Download';
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
