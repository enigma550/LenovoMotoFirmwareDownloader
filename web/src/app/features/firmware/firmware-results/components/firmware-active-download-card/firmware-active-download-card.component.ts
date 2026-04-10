import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import {
  dataResetLabel as formatDataResetLabel,
  flashTransportLabel as formatFlashTransportLabel,
  actionLabel as getActionLabel,
  cancelButtonLabel as getCancelButtonLabel,
  rescueExecutionLabel as getRescueExecutionLabel,
  rescueStepText as getRescueStepText,
  isCancelingStatus,
  isRecipeGuidedEntry,
  isRescueLiteEntry,
} from '../../../../../features/downloads/state/download-utils';
import { ProgressBarComponent } from '../../../../../shared/components/progress-bar/progress-bar.component';
import { UiActionButtonComponent } from '../../../../../shared/components/ui/ui-action-button/ui-action-button.component';
import type { DownloadHistoryEntry } from '../../../../../shared/state/workflow.types';
import { DownloadsFacade } from '../../../../downloads/state';

@Component({
  selector: 'app-firmware-active-download-card',
  standalone: true,
  imports: [ProgressBarComponent, UiActionButtonComponent],
  templateUrl: './firmware-active-download-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirmwareActiveDownloadCardComponent {
  readonly download = input.required<DownloadHistoryEntry>();
  readonly isDark = input(false);

  private readonly store = inject(DownloadsFacade);

  protected readonly isRescueLite = isRescueLiteEntry;
  protected readonly isRecipeGuided = isRecipeGuidedEntry;
  protected readonly actionLabel = getActionLabel;
  protected readonly rescueStepText = getRescueStepText;
  protected readonly dataResetLabel = formatDataResetLabel;
  protected readonly flashTransportLabel = formatFlashTransportLabel;

  protected isCanceling() {
    return isCancelingStatus(this.download().status);
  }

  protected cancelButtonLabel() {
    return getCancelButtonLabel(this.download().status);
  }

  protected rescueExecutionLabel() {
    return getRescueExecutionLabel(this.download().dryRun);
  }

  protected downloadPercent() {
    const entry = this.download();
    if (!entry.totalBytes || entry.totalBytes <= 0) {
      return null;
    }
    return Math.min(100, (entry.downloadedBytes / entry.totalBytes) * 100);
  }

  protected showsByteProgress() {
    const entry = this.download();
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
    void this.store.pauseDownload(this.download().downloadId);
  }

  protected onResume() {
    void this.store.resumeDownload(this.download().downloadId);
  }

  protected onCancel() {
    void this.store.cancelDownloadById(this.download().downloadId);
  }

  protected onClear() {
    this.store.clearDownloadById(this.download().downloadId);
  }
}
