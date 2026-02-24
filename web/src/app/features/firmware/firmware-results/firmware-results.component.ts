import { KeyValuePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import type { FirmwareVariant } from '../../../core/models/desktop-api.ts';
import type {
  DataResetChoice,
  DownloadHistoryEntry,
} from '../../../core/state/workflow/workflow.types';
import {
  actionLabel as getActionLabel,
  cancelButtonLabel as getCancelButtonLabel,
  dataResetLabel as formatDataResetLabel,
  findBestLocalFileMatchForVariant,
  formatBytes as formatByteSize,
  isCancelingStatus,
  isInProgressStatus,
  isRecipeGuidedEntry,
  isRescueLiteEntry,
  rescueDialogDescription as getRescueDialogDescription,
  rescueDialogTitle as getRescueDialogTitle,
  rescueExecutionLabel as getRescueExecutionLabel,
  rescueStepText as getRescueStepText,
} from '../../../core/state/workflow/download-utils';
import { ProgressBarComponent } from '../../../shared/components/progress-bar/progress-bar.component';
import { WorkflowStore } from '../../../core/state/workflow/workflow.store';

@Component({
  selector: 'app-firmware-results',
  standalone: true,
  imports: [KeyValuePipe, ProgressBarComponent],
  templateUrl: './firmware-results.component.html',
})
export class FirmwareResultsComponent implements OnInit {
  protected readonly store = inject(WorkflowStore);
  protected readonly linkingVariantRecipes = signal<Record<string, boolean>>({});
  protected rescueDialogOpen = false;
  protected rescueDialogVariant: FirmwareVariant | null = null;
  protected rescueDialogDryRun = false;
  protected rescueDialogDataReset: DataResetChoice = 'yes';
  protected readonly formatBytes = formatByteSize;
  protected readonly dataResetLabel = formatDataResetLabel;
  protected readonly isCanceling = (entry: DownloadHistoryEntry) => isCancelingStatus(entry.status);
  protected readonly cancelButtonLabel = (entry: DownloadHistoryEntry) =>
    getCancelButtonLabel(entry.status);
  protected readonly isRescueLite = isRescueLiteEntry;
  protected readonly isRecipeGuided = isRecipeGuidedEntry;
  protected readonly actionLabel = getActionLabel;
  protected readonly rescueExecutionLabel = (entry: DownloadHistoryEntry) =>
    getRescueExecutionLabel(entry.dryRun);
  protected readonly rescueStepText = getRescueStepText;
  protected readonly activeVariantDownloads = computed(() => {
    const variantUrls = new Set(this.store.firmwareVariants().map((variant) => variant.romUrl));
    return this.store
      .downloadHistory()
      .filter((entry) => variantUrls.has(entry.romUrl) && isInProgressStatus(entry.status));
  });

  async ngOnInit() {
    await this.store.refreshLocalDownloadedFiles();
  }

  protected startDownload(variant: FirmwareVariant) {
    void this.store.downloadFirmwareVariant(variant);
  }

  protected startRescueLite(variant: FirmwareVariant) {
    this.openRescueDialog(variant, false);
  }

  protected startRescueLiteDryRun(variant: FirmwareVariant) {
    this.openRescueDialog(variant, true);
  }

  protected closeRescueDialog() {
    this.rescueDialogOpen = false;
    this.rescueDialogVariant = null;
  }

  protected setRescueDialogDataReset(choice: DataResetChoice) {
    this.rescueDialogDataReset = choice;
  }

  protected confirmRescueDialog() {
    const variant = this.rescueDialogVariant;
    if (!variant) {
      return;
    }
    void this.store.rescueLiteDownloadVariant(
      variant,
      this.rescueDialogDataReset,
      this.rescueDialogDryRun,
    );
    this.closeRescueDialog();
  }

  protected closeDryRunPlanDialog() {
    this.store.clearRescueDryRunPlanDialog();
  }

  protected rescueDialogTitle() {
    return getRescueDialogTitle(this.rescueDialogDryRun);
  }

  protected rescueDialogDescription() {
    return getRescueDialogDescription(this.rescueDialogDryRun);
  }

  private openRescueDialog(variant: FirmwareVariant, dryRun: boolean) {
    this.rescueDialogVariant = variant;
    this.rescueDialogDryRun = dryRun;
    this.rescueDialogDataReset = 'yes';
    this.rescueDialogOpen = true;
  }

  protected cancelDownloadById(downloadId: string) {
    void this.store.cancelDownloadById(downloadId);
  }

  protected pauseEntry(entry: DownloadHistoryEntry) {
    void this.store.pauseDownload(entry.downloadId);
  }

  protected resumeEntry(entry: DownloadHistoryEntry) {
    void this.store.resumeDownload(entry.downloadId);
  }

  protected clearDownloadById(downloadId: string) {
    this.store.clearDownloadById(downloadId);
  }

  protected downloadPercent(entry: DownloadHistoryEntry) {
    if (!entry.totalBytes || entry.totalBytes <= 0) {
      return null;
    }
    return Math.min(100, (entry.downloadedBytes / entry.totalBytes) * 100);
  }

  protected isVariantDownloadActive(variant: FirmwareVariant) {
    return this.store
      .downloadHistory()
      .some((entry) => entry.romUrl === variant.romUrl && isInProgressStatus(entry.status));
  }

  protected isVariantDownloadTracked(variant: FirmwareVariant) {
    return this.getLatestVariantDownload(variant)?.status !== undefined;
  }

  protected getVariantStatus(variant: FirmwareVariant) {
    return this.getLatestVariantDownload(variant)?.status || '';
  }

  protected getVariantMode(variant: FirmwareVariant) {
    return this.getLatestVariantDownload(variant)?.mode || 'download';
  }

  protected getVariantDryRun(variant: FirmwareVariant) {
    return this.getLatestVariantDownload(variant)?.dryRun ?? false;
  }

  protected hasRecipeAvailable(variant: FirmwareVariant) {
    return Boolean(variant.recipeUrl);
  }

  protected canAttachRecipeToLocalZip(variant: FirmwareVariant) {
    if (!variant.recipeUrl) {
      return false;
    }
    const match = this.findLocalFileMatchForVariant(variant);
    return Boolean(match && !match.recipeUrl);
  }

  protected hasLocalZipForVariant(variant: FirmwareVariant) {
    return Boolean(this.findLocalFileMatchForVariant(variant));
  }

  protected isAttachingRecipeToLocalZip(variant: FirmwareVariant) {
    return Boolean(this.linkingVariantRecipes()[variant.romUrl]);
  }

  protected attachRecipeToLocalZip(variant: FirmwareVariant) {
    if (this.isAttachingRecipeToLocalZip(variant)) {
      return;
    }
    this.linkingVariantRecipes.update((current) => ({ ...current, [variant.romUrl]: true }));
    void (async () => {
      try {
        if (this.store.localDownloadedFiles().length === 0) {
          await this.store.refreshLocalDownloadedFiles();
        }
        await this.store.attachVariantRecipeToMatchingLocalZip(variant);
      } finally {
        this.linkingVariantRecipes.update((current) => ({ ...current, [variant.romUrl]: false }));
      }
    })();
  }

  private getLatestVariantDownload(variant: FirmwareVariant): DownloadHistoryEntry | undefined {
    const matches = this.store.downloadHistory().filter((entry) => entry.romUrl === variant.romUrl);
    if (matches.length === 0) {
      return undefined;
    }
    return matches.reduce((latest, current) =>
      current.updatedAt > latest.updatedAt ? current : latest,
    );
  }

  private findLocalFileMatchForVariant(variant: FirmwareVariant) {
    return findBestLocalFileMatchForVariant(variant, this.store.localDownloadedFiles());
  }
}
