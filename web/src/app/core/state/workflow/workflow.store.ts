import { inject, Injectable, signal } from '@angular/core';
import { AuthWorkflowService } from './auth-workflow.service';
import { CatalogWorkflowService } from './catalog-workflow.service';
import { DownloadWorkflowService } from './download-workflow.service';
import { WorkflowUiService } from './workflow-ui.service';
import type {
  CategoryFilter,
  DataResetChoice,
  ReadSupportFilter,
  ReadSupportMode,
  RescueDryRunPlanDialog,
  SourceMode,
} from './workflow.types';
import type { FirmwareVariant, LocalDownloadedFile, AppInfo, FrameworkUpdateInfo, DesktopIntegrationStatus } from '../../models/desktop-api.ts';

export type {
  CategoryFilter,
  DownloadStatus,
  DataResetChoice,
  ReadSupportFilter,
  ReadSupportMode,
  SourceMode,
  ThemeMode,
  ToastMessage,
  ToastVariant,
  FirmwareDownloadState,
  RescueDryRunPlanDialog,
} from './workflow.types';

@Injectable({ providedIn: 'root' })
export class WorkflowStore {
  private readonly ui = inject(WorkflowUiService);
  private readonly auth = inject(AuthWorkflowService);
  private readonly catalog = inject(CatalogWorkflowService);
  private readonly download = inject(DownloadWorkflowService);

  readonly callbackUrlOrToken = this.auth.callbackUrlOrToken;
  readonly loginUrl = this.auth.loginUrl;
  readonly authComplete = this.auth.authComplete;
  readonly hasStoredWustToken = this.auth.hasStoredWustToken;
  readonly hasCheckedStoredWustToken = this.auth.hasCheckedStoredWustToken;

  readonly status = this.ui.status;
  readonly errorMessage = this.ui.errorMessage;
  readonly toasts = this.ui.toasts;
  readonly isBusy = this.ui.isBusy;
  readonly isDark = this.ui.isDark;

  readonly sourceMode = this.catalog.sourceMode;
  readonly firmwareVariants = this.catalog.firmwareVariants;
  readonly connectedSummary = this.catalog.connectedSummary;
  readonly models = this.catalog.models;
  readonly selectedModel = this.catalog.selectedModel;
  readonly categoryFilter = this.catalog.categoryFilter;
  readonly readSupportFilter = this.catalog.readSupportFilter;
  readonly searchText = this.catalog.searchText;
  readonly pageIndex = this.catalog.pageIndex;
  readonly countryOptions = this.catalog.countryOptions;
  readonly selectedCountry = this.catalog.selectedCountry;
  readonly manualCatalogResult = this.catalog.manualCatalogResult;
  readonly readSupportHints = this.catalog.readSupportHints;
  readonly readSupportMode = this.catalog.readSupportMode;
  readonly readSupportResult = this.catalog.readSupportResult;
  readonly imei = this.catalog.imei;
  readonly imei2 = this.catalog.imei2;
  readonly sn = this.catalog.sn;
  readonly channelId = this.catalog.channelId;
  readonly requiredParams = this.catalog.requiredParams;
  readonly filteredModels = this.catalog.filteredModels;
  readonly totalPages = this.catalog.totalPages;
  readonly visibleModels = this.catalog.visibleModels;
  readonly selectedModelIsReadSupport = this.catalog.selectedModelIsReadSupport;
  readonly selectedModelSupportsSnLookup = this.catalog.selectedModelSupportsSnLookup;
  readonly recommendedReadSupportMode = this.catalog.recommendedReadSupportMode;

  readonly downloadHistory = this.download.downloadHistory;
  readonly localDownloadedFiles = this.download.localDownloadedFiles;
  readonly rescueDryRunPlanDialog = this.download.rescueDryRunPlanDialog;

  readonly showDesktopPrompt = signal(false);
  readonly desktopPromptReason = signal<'missing' | 'wrong_wmclass'>('missing');
  readonly appInfo = signal<AppInfo | null>(null);

  readonly bridgeHealthy = signal(true);
  readonly bridgeLatencyMs = signal<number | null>(null);
  readonly bridgeStatus = signal('Bridge connected');
  private bridgeReconnectInFlight = false;

  constructor() {
    if (window.location.protocol === 'views:') {
      void this.checkBridgeHealth(true);
      setInterval(() => {
        void this.checkBridgeHealth(true);
      }, 15000);
    }
  }

  toggleTheme() {
    this.ui.toggleTheme();
  }

  dismissToast(id: number) {
    this.ui.dismissToast(id);
  }

  async openLoginBrowser() {
    await this.auth.openLoginBrowser();
  }

  async submitWustToken() {
    await this.auth.submitWustToken();
  }

  async authenticateWithStoredToken() {
    await this.auth.authenticateWithStoredToken();
  }

  setSourceMode(mode: SourceMode) {
    this.catalog.setSourceMode(mode);
    if (mode === 'downloads') {
      void this.download.refreshLocalDownloadedFiles();
    }
  }

  setCategoryFilter(value: CategoryFilter) {
    this.catalog.setCategoryFilter(value);
  }

  setReadSupportFilter(value: ReadSupportFilter) {
    this.catalog.setReadSupportFilter(value);
  }

  setSearchText(value: string) {
    this.catalog.setSearchText(value);
  }

  setReadSupportMode(mode: ReadSupportMode) {
    this.catalog.setReadSupportMode(mode);
  }

  setRequiredParam(name: string, value: string) {
    this.catalog.setRequiredParam(name, value);
  }

  prevPage() {
    this.catalog.prevPage();
  }

  nextPage() {
    this.catalog.nextPage();
  }

  async loadCatalog(refresh = false) {
    await this.catalog.loadCatalog(refresh);
  }

  async runConnectedLookup() {
    await this.catalog.runConnectedLookup();
  }

  async selectModel(model: Parameters<CatalogWorkflowService['selectModel']>[0]) {
    await this.catalog.selectModel(model);
  }

  async runManualCatalogLookup() {
    await this.catalog.runManualCatalogLookup();
  }

  async runReadSupportLookupByImei() {
    await this.catalog.runReadSupportLookupByImei();
  }

  async runReadSupportLookupBySn() {
    await this.catalog.runReadSupportLookupBySn();
  }

  async runReadSupportLookupByParams() {
    await this.catalog.runReadSupportLookupByParams();
  }

  async downloadFirmwareVariant(
    variant: Parameters<DownloadWorkflowService['downloadFirmwareVariant']>[0],
  ) {
    await this.download.downloadFirmwareVariant(variant);
  }

  async rescueLiteDownloadVariant(
    variant: Parameters<DownloadWorkflowService['rescueLiteDownloadVariant']>[0],
    dataReset: DataResetChoice,
    dryRun = false,
  ) {
    await this.download.rescueLiteDownloadVariant(variant, dataReset, dryRun);
  }

  async rescueLiteLocalFile(file: LocalDownloadedFile, dataReset: DataResetChoice, dryRun = false) {
    await this.download.rescueLiteLocalFile(file, dataReset, dryRun);
  }

  async extractLocalFirmware(file: LocalDownloadedFile) {
    await this.download.extractLocalFirmware(file);
  }

  async attachLocalRecipeFromModel(
    file: LocalDownloadedFile,
    model: { modelName: string; marketName?: string; category?: string },
  ) {
    await this.download.attachLocalRecipeFromModel(file, model);
  }

  async attachLocalRecipeFromVariant(file: LocalDownloadedFile, variant: FirmwareVariant) {
    return this.download.attachLocalRecipeFromVariant(file, variant);
  }

  async attachVariantRecipeToMatchingLocalZip(variant: FirmwareVariant) {
    return this.download.attachVariantRecipeToMatchingLocalZip(variant);
  }

  async cancelDownloadById(downloadId: string) {
    await this.download.cancelDownloadById(downloadId);
  }

  async pauseDownload(downloadId: string) {
    await this.download.pauseDownload(downloadId);
  }

  async resumeDownload(downloadId: string) {
    await this.download.resumeDownload(downloadId);
  }

  async deleteLocalFile(file: LocalDownloadedFile) {
    await this.download.deleteLocalFile(file);
  }

  clearDownloadById(downloadId: string) {
    this.download.clearDownloadById(downloadId);
  }

  clearDownloadHistory() {
    this.download.clearDownloadHistory();
  }

  async refreshLocalDownloadedFiles() {
    await this.download.refreshLocalDownloadedFiles();
  }

  clearRescueDryRunPlanDialog() {
    this.download.clearRescueDryRunPlanDialog();
  }

  async checkDesktopIntegration() {
    if (window.desktopApi) {
      return window.desktopApi.checkDesktopIntegration();
    }
    return { ok: false, status: 'missing' } as DesktopIntegrationStatus;
  }

  async createDesktopIntegration() {
    if (window.desktopApi) {
      return window.desktopApi.createDesktopIntegration();
    }
    return { ok: false, status: 'missing' } as DesktopIntegrationStatus;
  }

  async getDesktopPromptPreference() {
    if (window.desktopApi) {
      return window.desktopApi.getDesktopPromptPreference();
    }
    return false;
  }

  async setDesktopPromptPreference(ask: boolean) {
    if (window.desktopApi) {
      return window.desktopApi.setDesktopPromptPreference({ ask });
    }
    return false;
  }

  async loadAppInfo() {
    if (window.desktopApi) {
      const info = await window.desktopApi.getAppInfo();
      this.appInfo.set(info);
      return info;
    }
    return null;
  }

  async openUrl(url: string) {
    if (window.desktopApi) {
      return window.desktopApi.openUrl(url);
    }
    return { ok: false, error: 'Desktop API not available' };
  }

  async checkFrameworkUpdate(): Promise<FrameworkUpdateInfo | null> {
    if (window.desktopApi) {
      return await window.desktopApi.checkFrameworkUpdate();
    }
    return null;
  }

  async downloadFrameworkUpdate() {
    if (window.desktopApi) {
      return await window.desktopApi.downloadFrameworkUpdate();
    }
  }

  async applyFrameworkUpdate() {
    if (window.desktopApi) {
      return await window.desktopApi.applyFrameworkUpdate();
    }
  }

  private async checkBridgeHealth(silent: boolean) {
    const startedAt = performance.now();
    try {
      const response = await this.auth.ping();
      if (!response.ok) {
        throw new Error(response.error || 'Bridge ping failed.');
      }

      const latency = Math.max(0, Math.round(performance.now() - startedAt));
      this.bridgeHealthy.set(true);
      this.bridgeLatencyMs.set(latency);
      this.bridgeStatus.set(`Bridge connected (${latency} ms)`);
      return;
    } catch {
      this.bridgeHealthy.set(false);
      this.bridgeLatencyMs.set(null);
      this.bridgeStatus.set('Bridge disconnected. Reconnecting...');
    }

    if (this.bridgeReconnectInFlight) {
      return;
    }

    this.bridgeReconnectInFlight = true;
    try {
      const reconnected = await this.auth.reconnectDesktopBridge();
      if (!reconnected) {
        this.bridgeStatus.set('Bridge reconnect failed. Retry on next check.');
        if (!silent) {
          this.ui.showToast('Desktop bridge reconnect failed.', 'error', 2600);
        }
        return;
      }

      const startedAt = performance.now();
      const response = await this.auth.ping();
      if (!response.ok) {
        throw new Error(response.error || 'Bridge ping failed after reconnect.');
      }
      const latency = Math.max(0, Math.round(performance.now() - startedAt));
      this.bridgeHealthy.set(true);
      this.bridgeLatencyMs.set(latency);
      this.bridgeStatus.set(`Bridge reconnected (${latency} ms)`);
      if (!silent) {
        this.ui.showToast('Desktop bridge reconnected.', 'success', 2200);
      }
    } catch {
      this.bridgeHealthy.set(false);
      this.bridgeLatencyMs.set(null);
      this.bridgeStatus.set('Bridge reconnect failed. Retry on next check.');
      if (!silent) {
        this.ui.showToast('Desktop bridge reconnect failed.', 'error', 2600);
      }
    } finally {
      this.bridgeReconnectInFlight = false;
    }
  }
}
