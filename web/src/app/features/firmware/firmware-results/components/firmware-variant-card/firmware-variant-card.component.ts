import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { FirmwareVariant } from '../../../../../core/models/desktop-api';
import {
  findBestLocalFileMatchForVariant,
  isInProgressStatus,
} from '../../../../../core/state/workflow/download-utils';
import { WorkflowStore } from '../../../../../core/state/workflow/workflow.store';
import type { DownloadHistoryEntry } from '../../../../../core/state/workflow/workflow.types';

@Component({
  selector: 'app-firmware-variant-card',
  standalone: true,
  imports: [KeyValuePipe],
  templateUrl: './firmware-variant-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirmwareVariantCardComponent {
  readonly variant = input.required<FirmwareVariant>();
  readonly isDark = input(false);
  readonly rescueRequested = output<FirmwareVariant>();
  readonly rescueDryRunRequested = output<FirmwareVariant>();

  private readonly store = inject(WorkflowStore);
  protected readonly linkingVariantRecipe = signal(false);

  protected onStartDownload() {
    void this.store.downloadFirmwareVariant(this.variant());
  }

  protected onRequestRescue() {
    this.rescueRequested.emit(this.variant());
  }

  protected onRequestRescueDryRun() {
    this.rescueDryRunRequested.emit(this.variant());
  }

  protected hasRecipeAvailable() {
    return Boolean(this.variant().recipeUrl);
  }

  protected canAttachRecipeToLocalZip() {
    const activeVariant = this.variant();
    if (!activeVariant.recipeUrl) {
      return false;
    }
    const match = this.findLocalFileMatchForVariant();
    return Boolean(match && !match.recipeUrl);
  }

  protected hasLocalZipForVariant() {
    return Boolean(this.findLocalFileMatchForVariant());
  }

  protected isVariantDownloadActive() {
    return this.store
      .downloadHistory()
      .some((entry) => entry.romUrl === this.variant().romUrl && isInProgressStatus(entry.status));
  }

  protected isVariantDownloadTracked() {
    return this.getLatestVariantDownload()?.status !== undefined;
  }

  protected getVariantStatus() {
    return this.getLatestVariantDownload()?.status || '';
  }

  protected getVariantMode() {
    return this.getLatestVariantDownload()?.mode || 'download';
  }

  protected getVariantDryRun() {
    return this.getLatestVariantDownload()?.dryRun ?? false;
  }

  protected async onAttachRecipeToLocalZip() {
    if (this.linkingVariantRecipe()) {
      return;
    }

    this.linkingVariantRecipe.set(true);
    try {
      if (this.store.localDownloadedFiles().length === 0) {
        await this.store.refreshLocalDownloadedFiles();
      }
      await this.store.attachVariantRecipeToMatchingLocalZip(this.variant());
    } finally {
      this.linkingVariantRecipe.set(false);
    }
  }

  private getLatestVariantDownload(): DownloadHistoryEntry | undefined {
    const activeVariant = this.variant();
    const matches = this.store
      .downloadHistory()
      .filter((entry) => entry.romUrl === activeVariant.romUrl);
    if (matches.length === 0) {
      return undefined;
    }
    return matches.reduce((latest, current) =>
      current.updatedAt > latest.updatedAt ? current : latest,
    );
  }

  private findLocalFileMatchForVariant() {
    return findBestLocalFileMatchForVariant(this.variant(), this.store.localDownloadedFiles());
  }
}
