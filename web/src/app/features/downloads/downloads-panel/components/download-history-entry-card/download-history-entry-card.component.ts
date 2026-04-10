import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import {
  formatBytes as formatByteSize,
  dataResetLabel as formatDataResetLabel,
  flashTransportLabel as formatFlashTransportLabel,
  actionLabel as getActionLabel,
  cancelButtonLabel as getCancelButtonLabel,
  rescueExecutionLabel as getRescueExecutionLabel,
  rescueStepText as getRescueStepText,
  isCancelingStatus,
  isInProgressStatus,
  isRecipeGuidedEntry,
  isRescueLiteEntry,
} from '../../../../../features/downloads/state/download-utils';
import { ProgressBarComponent } from '../../../../../shared/components/progress-bar/progress-bar.component';
import { UiActionButtonComponent } from '../../../../../shared/components/ui/ui-action-button/ui-action-button.component';
import type { DownloadHistoryEntry } from '../../../../../shared/state/workflow.types';
import { DownloadsFacade } from '../../../state';

@Component({
  selector: 'app-download-history-entry-card',
  standalone: true,
  imports: [ProgressBarComponent, UiActionButtonComponent],
  templateUrl: './download-history-entry-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DownloadHistoryEntryCardComponent {
  readonly entry = input.required<DownloadHistoryEntry>();
  readonly isDark = input(false);

  private readonly store = inject(DownloadsFacade);

  protected readonly formatBytes = formatByteSize;
  protected readonly dataResetLabel = formatDataResetLabel;
  protected readonly flashTransportLabel = formatFlashTransportLabel;
  protected readonly isRescueLite = isRescueLiteEntry;
  protected readonly isRecipeGuided = isRecipeGuidedEntry;
  protected readonly actionLabel = getActionLabel;
  protected readonly rescueStepText = getRescueStepText;

  protected isInProgress() {
    return isInProgressStatus(this.entry().status);
  }

  protected isCanceling() {
    return isCancelingStatus(this.entry().status);
  }

  protected cancelButtonLabel() {
    return getCancelButtonLabel(this.entry().status);
  }

  protected rescueExecutionLabel() {
    return getRescueExecutionLabel(this.entry().dryRun);
  }

  protected formatTime(timestamp: number) {
    if (!timestamp) {
      return '-';
    }
    return new Date(timestamp).toLocaleString();
  }

  protected downloadPercent() {
    const activeEntry = this.entry();
    if (!activeEntry.totalBytes || activeEntry.totalBytes <= 0) {
      return null;
    }
    return Math.min(100, (activeEntry.downloadedBytes / activeEntry.totalBytes) * 100);
  }

  protected showsByteProgress() {
    const entry = this.entry();
    if (entry.commandSource === 'local-extract') {
      return false;
    }
    if (entry.mode === 'rescue-lite') {
      return entry.phase === 'download';
    }
    return (
      entry.status === 'downloading' || entry.status === 'paused' || entry.status === 'canceling'
    );
  }

  protected onPause() {
    void this.store.pauseDownload(this.entry().downloadId);
  }

  protected onResume() {
    void this.store.resumeDownload(this.entry().downloadId);
  }

  protected onCancel() {
    void this.store.cancelDownloadById(this.entry().downloadId);
  }

  protected onClear() {
    this.store.clearDownloadById(this.entry().downloadId);
  }
}
