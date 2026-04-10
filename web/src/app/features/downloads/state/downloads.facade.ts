import { Injectable, inject } from '@angular/core';
import type {
  FirmwareVariant,
  LocalDownloadedFile,
  RescueFlashTransport,
  RescueQdlStorage,
} from '../../../core/models/desktop-api';
import type { DataResetChoice } from '../../../shared/state/workflow.types';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';
import { CatalogWorkflowService } from '../../catalog/state/catalog.workflow';
import { SystemWorkflowService } from '../../system/state/system.workflow';
import { DownloadWorkflowService } from './download.workflow';

@Injectable({ providedIn: 'root' })
export class DownloadsFacade {
  private readonly ui = inject(WorkflowUiService);
  private readonly downloads = inject(DownloadWorkflowService);
  private readonly system = inject(SystemWorkflowService);
  private readonly catalog = inject(CatalogWorkflowService);

  readonly isDark = this.ui.isDark;
  readonly status = this.ui.status;
  readonly errorMessage = this.ui.errorMessage;
  readonly appInfo = this.system.appInfo;
  readonly firmwareDownload = this.downloads.firmwareDownload;
  readonly downloadHistory = this.downloads.downloadHistory;
  readonly localDownloadedFiles = this.downloads.localDownloadedFiles;
  readonly rescueDryRunPlanDialog = this.downloads.rescueDryRunPlanDialog;
  readonly selectedModel = this.catalog.selectedModel;
  readonly firmwareVariants = this.catalog.firmwareVariants;

  async refreshLocalDownloadedFiles() {
    await this.downloads.refreshLocalDownloadedFiles();
  }

  async downloadFirmwareVariant(variant: FirmwareVariant) {
    await this.downloads.downloadFirmwareVariant(variant);
  }

  async rescueLiteDownloadVariant(
    variant: FirmwareVariant,
    dataReset: DataResetChoice,
    dryRun = false,
    flashTransport: RescueFlashTransport = 'fastboot',
    qdlStorage: RescueQdlStorage = 'auto',
    qdlSerial = '',
  ) {
    await this.downloads.rescueLiteDownloadVariant(
      variant,
      dataReset,
      dryRun,
      flashTransport,
      qdlStorage,
      qdlSerial,
    );
  }

  async rescueLiteLocalFile(
    file: LocalDownloadedFile,
    dataReset: DataResetChoice,
    dryRun = false,
    flashTransport: RescueFlashTransport = 'fastboot',
    qdlStorage: RescueQdlStorage = 'auto',
    qdlSerial = '',
  ) {
    await this.downloads.rescueLiteLocalFile(
      file,
      dataReset,
      dryRun,
      flashTransport,
      qdlStorage,
      qdlSerial,
    );
  }

  async extractLocalFirmware(file: LocalDownloadedFile) {
    await this.downloads.extractLocalFirmware(file);
  }

  async attachLocalRecipeFromModel(
    file: LocalDownloadedFile,
    model: { modelName: string; marketName?: string; category?: string },
  ) {
    await this.downloads.attachLocalRecipeFromModel(file, model);
  }

  async attachLocalRecipeFromVariant(file: LocalDownloadedFile, variant: FirmwareVariant) {
    await this.downloads.attachLocalRecipeFromVariant(file, variant);
  }

  async attachVariantRecipeToMatchingLocalZip(variant: FirmwareVariant) {
    await this.downloads.attachVariantRecipeToMatchingLocalZip(variant);
  }

  clearRescueDryRunPlanDialog() {
    this.downloads.clearRescueDryRunPlanDialog();
  }

  async cancelDownloadById(downloadId: string) {
    await this.downloads.cancelDownloadById(downloadId);
  }

  async pauseDownload(downloadId: string) {
    await this.downloads.pauseDownload(downloadId);
  }

  async resumeDownload(downloadId: string) {
    await this.downloads.resumeDownload(downloadId);
  }

  clearDownloadById(downloadId: string) {
    this.downloads.clearDownloadById(downloadId);
  }

  clearDownloadHistory() {
    this.downloads.clearDownloadHistory();
  }

  async deleteLocalFile(file: LocalDownloadedFile) {
    await this.downloads.deleteLocalFile(file);
  }

  async getWindowsQdloaderDriverStatus() {
    return this.system.getWindowsQdloaderDriverStatus();
  }

  async installWindowsQdloaderDriver() {
    return this.system.installWindowsQdloaderDriver();
  }

  async installWindowsSpdDriver() {
    return this.system.installWindowsSpdDriver();
  }

  async installWindowsMtkDriver() {
    return this.system.installWindowsMtkDriver();
  }
}
