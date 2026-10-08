import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DownloadsDesktopApiService } from '../../../core/api/desktop';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import type {
  LocalDownloadedFile,
  RescueFlashTransport,
  RescueQdlStorage,
  StorageUsageResponse,
} from '../../../core/models/desktop-api';
import {
  rescueDialogDescription as getRescueDialogDescription,
  rescueDialogTitle as getRescueDialogTitle,
} from '../../../features/downloads/state/download-utils';
import { RescueDialogDefaultsService } from '../../../features/downloads/state/rescue-dialog-defaults.service';
import { RescueDryRunPlanDialogComponent } from '../../../shared/components/rescue/rescue-dry-run-plan-dialog/rescue-dry-run-plan-dialog.component';
import { RescueFlashConsoleComponent } from '../../../shared/components/rescue/rescue-flash-console/rescue-flash-console.component';
import { RescueOptionsDialogComponent } from '../../../shared/components/rescue/rescue-options-dialog/rescue-options-dialog.component';
import { UiActionButtonComponent } from '../../../shared/components/ui/ui-action-button/ui-action-button.component';
import type { DataResetChoice } from '../../../shared/state/workflow.types';
import { formatBytes } from '../../../shared/utils/format';
import { DownloadsFacade } from '../state';
import { DownloadHistoryEntryCardComponent } from './components/download-history-entry-card/download-history-entry-card.component';
import { LocalDownloadedFileCardComponent } from './components/local-downloaded-file-card/local-downloaded-file-card.component';

@Component({
  selector: 'app-downloads-panel',
  standalone: true,
  imports: [
    DownloadHistoryEntryCardComponent,
    LocalDownloadedFileCardComponent,
    RescueDryRunPlanDialogComponent,
    RescueFlashConsoleComponent,
    RescueOptionsDialogComponent,
    UiActionButtonComponent,
    TranslatePipe,
  ],
  templateUrl: './downloads-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DownloadsPanelComponent implements OnInit {
  protected readonly store = inject(DownloadsFacade);
  private readonly rescueDialogDefaults = inject(RescueDialogDefaultsService);
  private readonly downloadsApi = inject(DownloadsDesktopApiService);

  protected readonly formatBytes = formatBytes;
  protected readonly storageInfo = signal<StorageUsageResponse | null>(null);
  protected readonly cleaningStorage = signal(false);
  protected readonly cleanFeedback = signal<string | null>(null);

  protected rescueDialogOpen = false;
  protected rescueDialogFile: LocalDownloadedFile | null = null;
  protected rescueDialogDryRun = false;
  protected rescueDialogDataReset: DataResetChoice = 'yes';
  protected rescueDialogFlashTransport: RescueFlashTransport = 'fastboot';
  protected rescueDialogQdlStorage: RescueQdlStorage = 'auto';
  protected rescueDialogQdlSerial = '';
  protected installingWindowsQdloaderDriver = false;
  protected installingWindowsSpdDriver = false;
  protected installingWindowsMtkDriver = false;
  protected windowsQdloaderDriverInstalled = false;
  protected windowsSpdDriverInstalled = false;
  protected windowsMtkDriverInstalled = false;

  async ngOnInit() {
    await Promise.all([this.store.refreshLocalDownloadedFiles(), this.loadStorageUsage()]);
  }

  protected async loadStorageUsage() {
    try {
      const info = await this.downloadsApi.getStorageUsage();
      this.storageInfo.set(info);
    } catch {
      // ignore
    }
  }

  protected async cleanExtractedFirmwares() {
    if (this.cleaningStorage()) return;
    this.cleaningStorage.set(true);
    this.cleanFeedback.set(null);
    try {
      const res = await this.downloadsApi.cleanExtractedFirmwares();
      if (res.ok) {
        if (res.freedBytes > 0) {
          this.cleanFeedback.set(
            `✓ ${this.formatBytes(res.freedBytes)} liberados (${res.cleanedCount} pastas).`,
          );
        } else {
          this.cleanFeedback.set('Nenhum arquivo temporário para limpar.');
        }
        await this.loadStorageUsage();
      }
    } catch (e) {
      this.cleanFeedback.set(`Erro ao limpar: ${e}`);
    } finally {
      this.cleaningStorage.set(false);
      setTimeout(() => this.cleanFeedback.set(null), 5000);
    }
  }

  protected startRescueLiteFromLocal(file: LocalDownloadedFile) {
    this.openRescueDialog(file, false);
  }

  protected startRescueLiteDryRunFromLocal(file: LocalDownloadedFile) {
    this.openRescueDialog(file, true);
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

  protected setRescueDialogFlashTransport(transport: RescueFlashTransport) {
    this.rescueDialogFlashTransport = transport;
  }

  protected setRescueDialogQdlStorage(storage: RescueQdlStorage) {
    this.rescueDialogQdlStorage = storage;
  }

  protected setRescueDialogQdlSerial(serial: string) {
    this.rescueDialogQdlSerial = serial;
  }

  protected rescueDialogTargetLabel() {
    if (!this.rescueDialogFile) {
      return '';
    }
    return `${this.rescueDialogFile.fileName} | ${this.rescueDialogFile.fullPath}`;
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
    void this.store.rescueLiteLocalFile(
      file,
      this.rescueDialogDataReset,
      this.rescueDialogDryRun,
      this.rescueDialogFlashTransport,
      this.rescueDialogQdlStorage,
      this.rescueDialogQdlSerial,
    );
    this.closeRescueDialog();
  }

  protected closeDryRunPlanDialog() {
    this.store.clearRescueDryRunPlanDialog();
  }

  protected async installWindowsQdloaderDriver() {
    if (this.installingWindowsQdloaderDriver) {
      return;
    }

    this.installingWindowsQdloaderDriver = true;
    try {
      const response = await this.store.installWindowsQdloaderDriver();
      if (response.ok) {
        this.windowsQdloaderDriverInstalled = true;
      } else {
        await this.refreshWindowsQdloaderDriverStatus();
      }
    } finally {
      this.installingWindowsQdloaderDriver = false;
    }
  }

  protected async installWindowsSpdDriver() {
    if (this.installingWindowsSpdDriver) {
      return;
    }

    this.installingWindowsSpdDriver = true;
    try {
      const response = await this.store.installWindowsSpdDriver();
      this.windowsSpdDriverInstalled = response.ok;
    } finally {
      this.installingWindowsSpdDriver = false;
    }
  }

  protected async installWindowsMtkDriver() {
    if (this.installingWindowsMtkDriver) {
      return;
    }

    this.installingWindowsMtkDriver = true;
    try {
      const response = await this.store.installWindowsMtkDriver();
      this.windowsMtkDriverInstalled = response.ok;
    } finally {
      this.installingWindowsMtkDriver = false;
    }
  }

  private openRescueDialog(file: LocalDownloadedFile, dryRun: boolean) {
    const defaults = this.rescueDialogDefaults.createDefaults(file);
    this.rescueDialogFile = file;
    this.rescueDialogDryRun = dryRun;
    this.rescueDialogDataReset = defaults.dataReset;
    this.rescueDialogFlashTransport = defaults.flashTransport;
    this.rescueDialogQdlStorage = defaults.qdlStorage;
    this.rescueDialogQdlSerial = defaults.qdlSerial;
    this.windowsQdloaderDriverInstalled = false;
    this.windowsSpdDriverInstalled = false;
    this.windowsMtkDriverInstalled = false;
    void this.refreshWindowsQdloaderDriverStatus();
    this.rescueDialogOpen = true;
  }

  private async refreshWindowsQdloaderDriverStatus() {
    const status = await this.store.getWindowsQdloaderDriverStatus();
    this.windowsQdloaderDriverInstalled = status.ok && status.installed;
  }
}
