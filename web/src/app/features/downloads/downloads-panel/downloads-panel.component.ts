import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import type { FirmwareVariant, LocalDownloadedFile } from '../../../core/models/desktop-api.ts';
import type {
  DataResetChoice,
  DownloadHistoryEntry,
} from '../../../core/state/workflow/workflow.types';
import {
  actionLabel as getActionLabel,
  cancelButtonLabel as getCancelButtonLabel,
  dataResetLabel as formatDataResetLabel,
  findLookupVariantForLocalFile,
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
  selector: 'app-downloads-panel',
  standalone: true,
  imports: [ProgressBarComponent],
  templateUrl: './downloads-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DownloadsPanelComponent implements OnInit {
  protected readonly store = inject(WorkflowStore);
  protected readonly extractingFiles = signal<Record<string, boolean>>({});
  protected readonly fetchingRecipeFiles = signal<Record<string, boolean>>({});
  protected rescueDialogOpen = false;
  protected rescueDialogFile: LocalDownloadedFile | null = null;
  protected rescueDialogDryRun = false;
  protected rescueDialogDataReset: DataResetChoice = 'yes';
  protected readonly formatBytes = formatByteSize;
  protected readonly dataResetLabel = formatDataResetLabel;
  protected readonly isInProgress = (entry: DownloadHistoryEntry) =>
    isInProgressStatus(entry.status);
  protected readonly isRescueLite = isRescueLiteEntry;
  protected readonly rescueExecutionLabel = (entry: DownloadHistoryEntry) =>
    getRescueExecutionLabel(entry.dryRun);
  protected readonly rescueStepText = getRescueStepText;
  protected readonly isRecipeGuided = isRecipeGuidedEntry;
  protected readonly actionLabel = getActionLabel;
  protected readonly isCanceling = (entry: DownloadHistoryEntry) => isCancelingStatus(entry.status);
  protected readonly cancelButtonLabel = (entry: DownloadHistoryEntry) =>
    getCancelButtonLabel(entry.status);

  protected downloadPercent(entry: DownloadHistoryEntry) {
    if (!entry.totalBytes || entry.totalBytes <= 0) {
      return null;
    }
    return Math.min(100, (entry.downloadedBytes / entry.totalBytes) * 100);
  }

  async ngOnInit() {
    await this.store.refreshLocalDownloadedFiles();
  }

  protected formatTime(timestamp: number) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString();
  }

  protected cancelEntry(entry: DownloadHistoryEntry) {
    void this.store.cancelDownloadById(entry.downloadId);
  }

  protected clearEntry(entry: DownloadHistoryEntry) {
    this.store.clearDownloadById(entry.downloadId);
  }

  protected startRescueLiteFromLocal(file: LocalDownloadedFile) {
    this.openRescueDialog(file, false);
  }

  protected startRescueLiteDryRunFromLocal(file: LocalDownloadedFile) {
    this.openRescueDialog(file, true);
  }

  protected isExtracting(file: LocalDownloadedFile) {
    return Boolean(this.extractingFiles()[file.fullPath]);
  }

  protected isFetchingRecipe(file: LocalDownloadedFile) {
    return Boolean(this.fetchingRecipeFiles()[file.fullPath]);
  }

  protected hasRecipeMetadata(file: LocalDownloadedFile) {
    return Boolean(file.recipeUrl);
  }

  protected hasLookupRecipeCandidate(file: LocalDownloadedFile) {
    return Boolean(this.findLookupVariantForFile(file));
  }

  protected isFileActionInProgress(file: LocalDownloadedFile) {
    const targetPath = this.normalizePath(file.fullPath);
    const targetName = this.normalizeName(file.fileName);

    return this.store.downloadHistory().some((entry) => {
      if (!isInProgressStatus(entry.status)) {
        return false;
      }

      const savePath = this.normalizePath(entry.savePath || '');
      const romUrl = this.normalizePath(entry.romUrl || '');
      const saveName = this.extractBaseName(savePath);
      const romUrlName = this.extractBaseName(romUrl);

      return (
        (savePath !== '' && savePath === targetPath) ||
        (romUrl !== '' && romUrl === targetPath) ||
        (saveName !== '' && saveName === targetName) ||
        (romUrlName !== '' && romUrlName === targetName)
      );
    });
  }

  protected async extractLocalFile(file: LocalDownloadedFile) {
    this.extractingFiles.update((current) => ({ ...current, [file.fullPath]: true }));
    try {
      await this.store.extractLocalFirmware(file);
    } finally {
      this.extractingFiles.update((current) => ({ ...current, [file.fullPath]: false }));
    }
  }

  protected async fetchRecipeFromSelectedModel(file: LocalDownloadedFile) {
    const selectedModel = this.store.selectedModel();
    if (!selectedModel) {
      this.store.errorMessage.set(
        'Select a model in Model Catalog first, then run "Fetch recipe".',
      );
      return;
    }

    this.fetchingRecipeFiles.update((current) => ({ ...current, [file.fullPath]: true }));
    try {
      await this.store.attachLocalRecipeFromModel(file, {
        modelName: selectedModel.modelName,
        marketName: selectedModel.marketName,
        category: selectedModel.category,
      });
    } finally {
      this.fetchingRecipeFiles.update((current) => ({ ...current, [file.fullPath]: false }));
    }
  }

  protected async fetchRecipeFromLookup(file: LocalDownloadedFile) {
    const variant = this.findLookupVariantForFile(file);
    if (!variant) {
      this.store.errorMessage.set(
        'No recipe-enabled firmware variant in current lookup matches this local ZIP.',
      );
      return;
    }

    this.fetchingRecipeFiles.update((current) => ({ ...current, [file.fullPath]: true }));
    try {
      await this.store.attachLocalRecipeFromVariant(file, variant);
    } finally {
      this.fetchingRecipeFiles.update((current) => ({ ...current, [file.fullPath]: false }));
    }
  }

  protected rescueDialogTitle() {
    return getRescueDialogTitle(this.rescueDialogDryRun);
  }

  protected rescueDialogDescription() {
    return getRescueDialogDescription(this.rescueDialogDryRun);
  }

  protected setRescueDialogDataReset(choice: DataResetChoice) {
    this.rescueDialogDataReset = choice;
  }

  protected closeRescueDialog() {
    this.rescueDialogOpen = false;
    this.rescueDialogFile = null;
  }

  protected confirmRescueDialog() {
    const file = this.rescueDialogFile;
    if (!file) {
      return;
    }
    void this.store.rescueLiteLocalFile(file, this.rescueDialogDataReset, this.rescueDialogDryRun);
    this.closeRescueDialog();
  }

  protected closeDryRunPlanDialog() {
    this.store.clearRescueDryRunPlanDialog();
  }

  protected async removeFile(file: LocalDownloadedFile) {
    await this.store.deleteLocalFile(file);
  }

  protected pauseEntry(entry: DownloadHistoryEntry) {
    void this.store.pauseDownload(entry.downloadId);
  }

  protected resumeEntry(entry: DownloadHistoryEntry) {
    void this.store.resumeDownload(entry.downloadId);
  }

  private openRescueDialog(file: LocalDownloadedFile, dryRun: boolean) {
    this.rescueDialogFile = file;
    this.rescueDialogDryRun = dryRun;
    this.rescueDialogDataReset = 'yes';
    this.rescueDialogOpen = true;
  }

  private findLookupVariantForFile(file: LocalDownloadedFile): FirmwareVariant | null {
    return findLookupVariantForLocalFile(file, this.store.firmwareVariants());
  }

  private normalizePath(value: string) {
    return value.trim().replace(/\\/g, '/').toLowerCase();
  }

  private normalizeName(value: string) {
    return value.trim().toLowerCase();
  }

  private extractBaseName(path: string) {
    if (!path) {
      return '';
    }
    const parts = path.split('/');
    return this.normalizeName(parts[parts.length - 1] || '');
  }
}
