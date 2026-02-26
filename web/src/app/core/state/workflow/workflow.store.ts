import { Injectable, inject } from '@angular/core';
import type {
  FirmwareVariant,
  LocalDownloadedFile,
  RescueFlashTransport,
  RescueQdlStorage,
} from '../../models/desktop-api.ts';
import { AuthWorkflowService } from './auth-workflow.service';
import { CatalogWorkflowService } from './catalog-workflow.service';
import { DownloadWorkflowService } from './download-workflow.service';
import { SystemWorkflowService } from './system-workflow.service';
import type {
  CategoryFilter,
  DataResetChoice,
  ReadSupportFilter,
  ReadSupportMode,
  SourceMode,
} from './workflow.types';
import { WorkflowUiService } from './workflow-ui.service';

export type {
  CategoryFilter,
  DataResetChoice,
  DownloadStatus,
  FirmwareDownloadState,
  ReadSupportFilter,
  ReadSupportMode,
  RescueDryRunPlanDialog,
  SourceMode,
  ThemeMode,
  ToastMessage,
  ToastVariant,
} from './workflow.types';

@Injectable({ providedIn: 'root' })
export class WorkflowStore {
  private readonly ui = inject(WorkflowUiService);
  private readonly auth = inject(AuthWorkflowService);
  private readonly catalog = inject(CatalogWorkflowService);
  private readonly download = inject(DownloadWorkflowService);
  private readonly system = inject(SystemWorkflowService);

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

  readonly showDesktopPrompt = this.system.showDesktopPrompt;
  readonly desktopPromptReason = this.system.desktopPromptReason;
  readonly appInfo = this.system.appInfo;
  readonly bridgeHealthy = this.system.bridgeHealthy;
  readonly bridgeLatencyMs = this.system.bridgeLatencyMs;
  readonly bridgeStatus = this.system.bridgeStatus;

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
    flashTransport: RescueFlashTransport = 'fastboot',
    qdlStorage: RescueQdlStorage = 'auto',
    qdlSerial = '',
  ) {
    await this.download.rescueLiteDownloadVariant(
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
    await this.download.rescueLiteLocalFile(
      file,
      dataReset,
      dryRun,
      flashTransport,
      qdlStorage,
      qdlSerial,
    );
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
    return this.system.checkDesktopIntegration();
  }

  async createDesktopIntegration() {
    return this.system.createDesktopIntegration();
  }

  async getDesktopPromptPreference() {
    return this.system.getDesktopPromptPreference();
  }

  async setDesktopPromptPreference(ask: boolean) {
    return this.system.setDesktopPromptPreference(ask);
  }

  async loadAppInfo() {
    return this.system.loadAppInfo();
  }

  async openUrl(url: string) {
    return this.system.openUrl(url);
  }

  async checkFrameworkUpdate() {
    return this.system.checkFrameworkUpdate();
  }

  async downloadFrameworkUpdate() {
    return this.system.downloadFrameworkUpdate();
  }

  async applyFrameworkUpdate() {
    return this.system.applyFrameworkUpdate();
  }

  async installWindowsEdlDriver() {
    return this.system.installWindowsEdlDriver();
  }
}
