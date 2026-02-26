import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { FirmwareVariant, LocalDownloadedFile } from '../../../../../core/models/desktop-api';
import {
  findLookupVariantForLocalFile,
  formatBytes as formatByteSize,
} from '../../../../../core/state/workflow/download-utils';
import { WorkflowStore } from '../../../../../core/state/workflow/workflow.store';

@Component({
  selector: 'app-local-downloaded-file-card',
  standalone: true,
  templateUrl: './local-downloaded-file-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalDownloadedFileCardComponent {
  readonly file = input.required<LocalDownloadedFile>();
  readonly isDark = input(false);
  readonly rescueRequested = output<LocalDownloadedFile>();
  readonly rescueDryRunRequested = output<LocalDownloadedFile>();

  private readonly store = inject(WorkflowStore);
  protected readonly extracting = signal(false);
  protected readonly fetchingRecipe = signal(false);
  protected readonly formatBytes = formatByteSize;

  protected formatTime(timestamp: number) {
    if (!timestamp) {
      return '-';
    }
    return new Date(timestamp).toLocaleString();
  }

  protected isExtracting() {
    return this.extracting();
  }

  protected isFetchingRecipe() {
    return this.fetchingRecipe();
  }

  protected hasRecipeMetadata() {
    return Boolean(this.file().recipeUrl);
  }

  protected hasLookupRecipeCandidate() {
    return Boolean(this.findLookupVariantForFile());
  }

  protected isFileActionInProgress() {
    const activeFile = this.file();
    const targetPath = this.normalizePath(activeFile.fullPath);
    const targetName = this.normalizeName(activeFile.fileName);

    return this.store.downloadHistory().some((entry) => {
      if (!this.isInProgressStatus(entry.status)) {
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

  protected async onExtract() {
    const activeFile = this.file();
    this.extracting.set(true);
    try {
      await this.store.extractLocalFirmware(activeFile);
    } finally {
      this.extracting.set(false);
    }
  }

  protected async onFetchRecipeFromSelectedModel() {
    const activeFile = this.file();
    const selectedModel = this.store.selectedModel();
    if (!selectedModel) {
      this.store.errorMessage.set(
        'Select a model in Model Catalog first, then run "Fetch recipe".',
      );
      return;
    }

    this.fetchingRecipe.set(true);
    try {
      await this.store.attachLocalRecipeFromModel(activeFile, {
        modelName: selectedModel.modelName,
        marketName: selectedModel.marketName,
        category: selectedModel.category,
      });
    } finally {
      this.fetchingRecipe.set(false);
    }
  }

  protected async onFetchRecipeFromLookup() {
    const activeFile = this.file();
    const variant = this.findLookupVariantForFile();
    if (!variant) {
      this.store.errorMessage.set(
        'No recipe-enabled firmware variant in current lookup matches this local archive.',
      );
      return;
    }

    this.fetchingRecipe.set(true);
    try {
      await this.store.attachLocalRecipeFromVariant(activeFile, variant);
    } finally {
      this.fetchingRecipe.set(false);
    }
  }

  protected async onRemove() {
    await this.store.deleteLocalFile(this.file());
  }

  protected onRescueLite() {
    this.rescueRequested.emit(this.file());
  }

  protected onRescueLiteDryRun() {
    this.rescueDryRunRequested.emit(this.file());
  }

  private findLookupVariantForFile(): FirmwareVariant | null {
    return findLookupVariantForLocalFile(this.file(), this.store.firmwareVariants()) ?? null;
  }

  private isInProgressStatus(status: string) {
    return (
      status === 'starting' ||
      status === 'downloading' ||
      status === 'preparing' ||
      status === 'flashing' ||
      status === 'paused' ||
      status === 'canceling'
    );
  }

  private normalizePath(value: string) {
    return value.trim().replace(/\\/g, '/').toLowerCase();
  }

  private normalizeName(value: string) {
    return value.trim().toLowerCase();
  }

  private extractBaseName(pathValue: string) {
    if (!pathValue) {
      return '';
    }
    const parts = pathValue.split('/');
    return this.normalizeName(parts[parts.length - 1] || '');
  }
}
