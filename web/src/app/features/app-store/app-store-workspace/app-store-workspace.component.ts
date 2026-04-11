import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { PlayStoreDownloadGroup } from '../../../core/models/desktop-api';
import { UiActionButtonComponent } from '../../../shared/components/ui/ui-action-button/ui-action-button.component';
import { formatBytes, formatTime } from '../../../shared/utils/format';
import { AppStoreFacade } from '../state';

@Component({
  selector: 'app-app-store-workspace',
  standalone: true,
  imports: [UiActionButtonComponent],
  templateUrl: './app-store-workspace.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppStoreWorkspaceComponent implements OnInit {
  protected readonly store = inject(AppStoreFacade);
  protected readonly formatBytes = formatBytes;
  protected readonly formatTime = formatTime;

  async ngOnInit() {
    await this.store.initialize();
  }

  protected onSearchQueryInput(event: Event) {
    const target = event.target as HTMLInputElement | null;
    this.store.setSearchQuery(target?.value || '');
  }

  protected async onDownloadSelectionChange(event: Event, download: PlayStoreDownloadGroup) {
    event.stopPropagation();
    await this.store.toggleDownloadSelection(download);
  }

  protected async onDownloadRowClick(download: PlayStoreDownloadGroup) {
    await this.store.toggleDownloadExpanded(download);
  }

  protected visibleArtifacts(download: PlayStoreDownloadGroup) {
    return this.store.isDownloadExpanded(download.id)
      ? download.artifacts
      : download.artifacts.slice(0, 1);
  }

  protected hiddenArtifactCount(download: PlayStoreDownloadGroup) {
    return Math.max(0, download.artifacts.length - this.visibleArtifacts(download).length);
  }

  protected shouldShowToolStatus() {
    return this.store.toolStatus()?.toolSource !== 'bundled';
  }

  protected toolStatusMessage() {
    const source = this.store.toolStatus()?.toolSource;
    const status = this.store.toolStatus();
    if (!status) return '';
    if (!status.available) return 'gplaydl mangler.';
    if (source === 'custom') {
      return 'Bruger custom gplaydl.';
    }
    if (source === 'system') {
      return 'Bruger system gplaydl.';
    }
    return '';
  }
}
