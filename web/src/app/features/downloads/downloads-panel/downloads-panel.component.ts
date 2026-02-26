import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type {
  LocalDownloadedFile,
  RescueFlashTransport,
  RescueQdlStorage,
} from '../../../core/models/desktop-api';
import {
  rescueDialogDescription as getRescueDialogDescription,
  rescueDialogTitle as getRescueDialogTitle,
} from '../../../core/state/workflow/download-utils';
import { RescueDialogDefaultsService } from '../../../core/state/workflow/rescue-dialog-defaults.service';
import { WorkflowStore } from '../../../core/state/workflow/workflow.store';
import type { DataResetChoice } from '../../../core/state/workflow/workflow.types';
import { RescueDryRunPlanDialogComponent } from '../../../shared/components/rescue/rescue-dry-run-plan-dialog/rescue-dry-run-plan-dialog.component';
import { RescueFlashConsoleComponent } from '../../../shared/components/rescue/rescue-flash-console/rescue-flash-console.component';
import { RescueOptionsDialogComponent } from '../../../shared/components/rescue/rescue-options-dialog/rescue-options-dialog.component';
import { UiActionButtonComponent } from '../../../shared/components/ui/ui-action-button/ui-action-button.component';
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
  ],
  templateUrl: './downloads-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DownloadsPanelComponent implements OnInit {
  protected readonly store = inject(WorkflowStore);
  private readonly rescueDialogDefaults = inject(RescueDialogDefaultsService);
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
    await this.store.refreshLocalDownloadedFiles();
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
    const defaults = this.rescueDialogDefaults.createDefaults();
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
