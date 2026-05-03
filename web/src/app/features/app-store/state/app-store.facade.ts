import { Injectable, inject } from '@angular/core';
import type { PlayStoreDownloadGroup } from '../../../core/models/desktop-api';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';
import { AppStoreWorkflowService } from './app-store.workflow';

@Injectable({ providedIn: 'root' })
export class AppStoreFacade {
  private readonly ui = inject(WorkflowUiService);
  private readonly appStore = inject(AppStoreWorkflowService);

  readonly isDark = this.ui.isDark;
  readonly isBusy = this.ui.isBusy;
  readonly toolStatus = this.appStore.toolStatus;
  readonly searchQuery = this.appStore.searchQuery;
  readonly searchResults = this.appStore.searchResults;
  readonly selectedResult = this.appStore.selectedResult;
  readonly selectedDetails = this.appStore.selectedDetails;
  readonly selectedArch = this.appStore.selectedArch;
  readonly downloadRoot = this.appStore.downloadRoot;
  readonly downloads = this.appStore.downloads;
  readonly selectedDownloadIds = this.appStore.selectedDownloadIds;
  readonly selectedDownloads = this.appStore.selectedDownloads;
  readonly selectedDownloadCount = this.appStore.selectedDownloadCount;
  readonly lastInstall = this.appStore.lastInstall;
  readonly activeDownloads = this.appStore.activeDownloads;
  readonly searchInProgress = this.appStore.searchInProgress;
  readonly installInProgress = this.appStore.installInProgress;
  readonly selectedAppIsDownloading = this.appStore.selectedAppIsDownloading;

  async initialize() {
    await this.appStore.initialize();
  }

  setSearchQuery(query: string) {
    this.appStore.setSearchQuery(query);
  }

  setSelectedArch(arch: 'arm64' | 'armv7') {
    this.appStore.setSelectedArch(arch);
  }

  async search() {
    await this.appStore.search();
  }

  async selectResult(packageResult: { title: string; packageName: string }) {
    await this.appStore.selectResult(packageResult);
  }

  async downloadSelectedApp() {
    await this.appStore.downloadSelectedApp();
  }

  async deleteDownload(download: PlayStoreDownloadGroup) {
    await this.appStore.deleteDownload(download);
  }

  isDownloadExpanded(downloadId: string) {
    return this.appStore.isDownloadExpanded(downloadId);
  }

  isDownloadSelected(downloadId: string) {
    return this.appStore.isDownloadSelected(downloadId);
  }

  isDownloadDeleteInProgress(downloadId: string) {
    return this.appStore.isDownloadDeleteInProgress(downloadId);
  }

  async toggleDownloadSelection(download: PlayStoreDownloadGroup) {
    await this.appStore.toggleDownloadSelection(download);
  }

  async toggleDownloadExpanded(download: PlayStoreDownloadGroup) {
    await this.appStore.toggleDownloadExpanded(download);
  }

  async installSelectedDownloads(mode: 'standard' | 'microg' = 'standard') {
    await this.appStore.installSelectedDownloads(mode);
  }
}
