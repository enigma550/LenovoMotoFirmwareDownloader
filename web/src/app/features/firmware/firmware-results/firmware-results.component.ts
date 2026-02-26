import type { OnInit } from '@angular/core';
import { Component, computed, inject } from '@angular/core';
import type {
  FirmwareVariant,
  RescueFlashTransport,
  RescueQdlStorage,
} from '../../../core/models/desktop-api';
import {
  rescueDialogDescription as getRescueDialogDescription,
  rescueDialogTitle as getRescueDialogTitle,
  isInProgressStatus,
} from '../../../core/state/workflow/download-utils';
import { RescueDialogDefaultsService } from '../../../core/state/workflow/rescue-dialog-defaults.service';
import { WorkflowStore } from '../../../core/state/workflow/workflow.store';
import type { DataResetChoice } from '../../../core/state/workflow/workflow.types';
import { RescueDryRunPlanDialogComponent } from '../../../shared/components/rescue/rescue-dry-run-plan-dialog/rescue-dry-run-plan-dialog.component';
import { RescueOptionsDialogComponent } from '../../../shared/components/rescue/rescue-options-dialog/rescue-options-dialog.component';
import { FirmwareActiveDownloadCardComponent } from './components/firmware-active-download-card/firmware-active-download-card.component';
import { FirmwareVariantCardComponent } from './components/firmware-variant-card/firmware-variant-card.component';

@Component({
  selector: 'app-firmware-results',
  standalone: true,
  imports: [
    FirmwareActiveDownloadCardComponent,
    FirmwareVariantCardComponent,
    RescueDryRunPlanDialogComponent,
    RescueOptionsDialogComponent,
  ],
  templateUrl: './firmware-results.component.html',
})
export class FirmwareResultsComponent implements OnInit {
  protected readonly store = inject(WorkflowStore);
  private readonly rescueDialogDefaults = inject(RescueDialogDefaultsService);
  protected rescueDialogOpen = false;
  protected rescueDialogVariant: FirmwareVariant | null = null;
  protected rescueDialogDryRun = false;
  protected rescueDialogDataReset: DataResetChoice = 'yes';
  protected rescueDialogFlashTransport: RescueFlashTransport = 'fastboot';
  protected rescueDialogQdlStorage: RescueQdlStorage = 'auto';
  protected rescueDialogQdlSerial = '';
  protected installingWindowsDriver = false;
  protected readonly activeVariantDownloads = computed(() => {
    const variantUrls = new Set(this.store.firmwareVariants().map((variant) => variant.romUrl));
    return this.store
      .downloadHistory()
      .filter((entry) => variantUrls.has(entry.romUrl) && isInProgressStatus(entry.status));
  });

  async ngOnInit() {
    await this.store.refreshLocalDownloadedFiles();
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

  protected setRescueDialogFlashTransport(transport: RescueFlashTransport) {
    this.rescueDialogFlashTransport = transport;
  }

  protected setRescueDialogQdlStorage(storage: RescueQdlStorage) {
    this.rescueDialogQdlStorage = storage;
  }

  protected setRescueDialogQdlSerial(serial: string) {
    this.rescueDialogQdlSerial = serial;
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
      this.rescueDialogFlashTransport,
      this.rescueDialogQdlStorage,
      this.rescueDialogQdlSerial,
    );
    this.closeRescueDialog();
  }

  protected closeDryRunPlanDialog() {
    this.store.clearRescueDryRunPlanDialog();
  }

  protected async installWindowsDriver() {
    if (this.installingWindowsDriver) {
      return;
    }

    this.installingWindowsDriver = true;
    try {
      await this.store.installWindowsEdlDriver();
    } finally {
      this.installingWindowsDriver = false;
    }
  }

  protected rescueDialogTitle() {
    return getRescueDialogTitle(this.rescueDialogDryRun);
  }

  protected rescueDialogDescription() {
    return getRescueDialogDescription(this.rescueDialogDryRun);
  }

  private openRescueDialog(variant: FirmwareVariant, dryRun: boolean) {
    const defaults = this.rescueDialogDefaults.createDefaults();
    this.rescueDialogVariant = variant;
    this.rescueDialogDryRun = dryRun;
    this.rescueDialogDataReset = defaults.dataReset;
    this.rescueDialogFlashTransport = defaults.flashTransport;
    this.rescueDialogQdlStorage = defaults.qdlStorage;
    this.rescueDialogQdlSerial = defaults.qdlSerial;
    this.rescueDialogOpen = true;
  }
}
