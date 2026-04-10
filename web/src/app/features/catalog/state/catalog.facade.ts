import { Injectable, inject } from '@angular/core';
import type { ModelCatalogEntry } from '../../../core/models/desktop-api';
import type {
  CategoryFilter,
  ReadSupportFilter,
  ReadSupportMode,
  SourceMode,
} from '../../../shared/state/workflow.types';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';
import { BackupRestoreWorkflowService } from '../../backup-restore/state/backup-restore.workflow';
import { DownloadWorkflowService } from '../../downloads/state/download.workflow';
import { CatalogWorkflowService } from './catalog.workflow';

@Injectable({ providedIn: 'root' })
export class CatalogFacade {
  private readonly ui = inject(WorkflowUiService);
  private readonly catalog = inject(CatalogWorkflowService);
  private readonly downloads = inject(DownloadWorkflowService);
  private readonly backupRestore = inject(BackupRestoreWorkflowService);

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

  setSourceMode(mode: SourceMode) {
    this.catalog.setSourceMode(mode);
    if (mode === 'downloads') {
      void this.downloads.refreshLocalDownloadedFiles();
      return;
    }
    if (mode === 'backup-restore') {
      void this.backupRestore.refreshSnapshots();
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

  async selectModel(model: ModelCatalogEntry) {
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
}
