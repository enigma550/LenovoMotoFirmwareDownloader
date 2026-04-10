import { Injectable, inject } from '@angular/core';
import type { BackupRestoreSnapshot } from '../../../core/models/desktop-api';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';
import { DownloadWorkflowService } from '../../downloads/state/download.workflow';
import { BackupRestoreWorkflowService } from './backup-restore.workflow';

@Injectable({ providedIn: 'root' })
export class BackupRestoreFacade {
  private readonly ui = inject(WorkflowUiService);
  private readonly backupRestore = inject(BackupRestoreWorkflowService);
  private readonly download = inject(DownloadWorkflowService);

  readonly isDark = this.ui.isDark;
  readonly status = this.ui.status;
  readonly errorMessage = this.ui.errorMessage;
  readonly isBusy = this.ui.isBusy;
  readonly firmwareDownload = this.download.firmwareDownload;

  readonly backupSnapshots = this.backupRestore.snapshots;
  readonly activeBackupSnapshot = this.backupRestore.activeSnapshot;
  readonly backingUpSnapshotId = this.backupRestore.backingUpSnapshotId;
  readonly backupRootPath = this.backupRestore.backupRootPath;
  readonly backupRootRelativePath = this.backupRestore.backupRootRelativePath;
  readonly backupSnapshotsLoading = this.backupRestore.isLoading;
  readonly connectedBackupPreview = this.backupRestore.connectedPreview;
  readonly connectedBackupPreviewApps = this.backupRestore.connectedPreviewApps;
  readonly connectedBackupPreviewMedia = this.backupRestore.connectedPreviewMedia;
  readonly connectedBackupPreviewContacts = this.backupRestore.connectedPreviewContacts;
  readonly connectedBackupPreviewMessages = this.backupRestore.connectedPreviewMessages;
  readonly connectedBackupPreviewFiles = this.backupRestore.connectedPreviewFiles;
  readonly connectedBackupPreviewSelectedSizeBytes =
    this.backupRestore.selectedConnectedPreviewSizeBytes;
  readonly connectedBackupPreviewVisibleApps = this.backupRestore.connectedPreviewVisibleApps;
  readonly connectedBackupPreviewVisibleMedia = this.backupRestore.connectedPreviewVisibleMedia;
  readonly connectedBackupPreviewVisibleContacts =
    this.backupRestore.connectedPreviewVisibleContacts;
  readonly connectedBackupPreviewVisibleMessages =
    this.backupRestore.connectedPreviewVisibleMessages;
  readonly connectedBackupPreviewVisibleThreads = this.backupRestore.connectedPreviewVisibleThreads;
  readonly connectedBackupPreviewVisibleFiles = this.backupRestore.connectedPreviewVisibleFiles;
  readonly connectedBackupPreviewPageIndex = this.backupRestore.connectedPreviewCurrentPage;
  readonly connectedBackupPreviewTotalPages = this.backupRestore.connectedPreviewTotalPages;
  readonly connectedBackupPreviewSelectedCount = this.backupRestore.connectedPreviewSelectedCount;
  readonly connectedBackupPreviewAllSelected = this.backupRestore.connectedPreviewAllSelected;
  readonly connectedBackupPreviewPageAllSelected =
    this.backupRestore.connectedPreviewPageAllSelected;
  readonly connectedBackupPreviewHasPrevPage = this.backupRestore.connectedPreviewHasPrevPage;
  readonly connectedBackupPreviewHasNextPage = this.backupRestore.connectedPreviewHasNextPage;
  readonly connectedBackupPreviewLoading = this.backupRestore.connectedPreviewLoading;
  readonly connectedBackupPreviewTab = this.backupRestore.connectedPreviewTab;
  readonly connectedBackupPreviewMediaFilter = this.backupRestore.connectedPreviewMediaFilter;
  readonly backupSnapshotTab = this.backupRestore.snapshotTab;
  readonly includeConnectedBackupApps = this.backupRestore.includeConnectedApps;
  readonly includeConnectedBackupMedia = this.backupRestore.includeConnectedMedia;
  readonly includeConnectedBackupContacts = this.backupRestore.includeConnectedContacts;
  readonly includeConnectedBackupMessages = this.backupRestore.includeConnectedMessages;
  readonly includeConnectedBackupFiles = this.backupRestore.includeConnectedFiles;
  readonly canBackupConnectedPreview = this.backupRestore.canBackupConnectedPreview;
  readonly connectedBackupPreviewMediaPageIndex =
    this.backupRestore.connectedPreviewMediaCurrentPage;
  readonly connectedBackupPreviewMediaTotalPages =
    this.backupRestore.connectedPreviewMediaTotalPages;
  readonly connectedBackupPreviewMediaSelectedCount =
    this.backupRestore.connectedPreviewMediaSelectedCount;
  readonly connectedBackupPreviewMediaAllSelected =
    this.backupRestore.connectedPreviewMediaAllSelected;
  readonly connectedBackupPreviewMediaPageAllSelected =
    this.backupRestore.connectedPreviewMediaPageAllSelected;
  readonly connectedBackupPreviewMediaHasPrevPage =
    this.backupRestore.connectedPreviewMediaHasPrevPage;
  readonly connectedBackupPreviewMediaHasNextPage =
    this.backupRestore.connectedPreviewMediaHasNextPage;
  readonly connectedBackupPreviewContactsPageIndex =
    this.backupRestore.connectedPreviewContactsCurrentPage;
  readonly connectedBackupPreviewContactsTotalPages =
    this.backupRestore.connectedPreviewContactsTotalPages;
  readonly connectedBackupPreviewContactsSelectedCount =
    this.backupRestore.connectedPreviewContactsSelectedCount;
  readonly connectedBackupPreviewContactsAllSelected =
    this.backupRestore.connectedPreviewContactsAllSelected;
  readonly connectedBackupPreviewContactsPageAllSelected =
    this.backupRestore.connectedPreviewContactsPageAllSelected;
  readonly connectedBackupPreviewContactsHasPrevPage =
    this.backupRestore.connectedPreviewContactsHasPrevPage;
  readonly connectedBackupPreviewContactsHasNextPage =
    this.backupRestore.connectedPreviewContactsHasNextPage;
  readonly connectedBackupPreviewMessagesPageIndex =
    this.backupRestore.connectedPreviewMessagesCurrentPage;
  readonly connectedBackupPreviewMessagesTotalPages =
    this.backupRestore.connectedPreviewMessagesTotalPages;
  readonly connectedBackupPreviewMessagesSelectedCount =
    this.backupRestore.connectedPreviewMessagesSelectedCount;
  readonly connectedBackupPreviewMessagesAllSelected =
    this.backupRestore.connectedPreviewMessagesAllSelected;
  readonly connectedBackupPreviewMessagesPageAllSelected =
    this.backupRestore.connectedPreviewMessagesPageAllSelected;
  readonly connectedBackupPreviewMessagesHasPrevPage =
    this.backupRestore.connectedPreviewMessagesHasPrevPage;
  readonly connectedBackupPreviewMessagesHasNextPage =
    this.backupRestore.connectedPreviewMessagesHasNextPage;
  readonly selectedConnectedMessageIds = this.backupRestore.selectedConnectedMessageIds;
  readonly selectedConnectedFileIds = this.backupRestore.selectedConnectedFileIds;
  readonly connectedBackupPreviewFilesPageIndex =
    this.backupRestore.connectedPreviewFilesCurrentPage;
  readonly connectedBackupPreviewFilesTotalPages =
    this.backupRestore.connectedPreviewFilesTotalPages;
  readonly connectedBackupPreviewFilesSelectedCount =
    this.backupRestore.connectedPreviewFilesSelectedCount;
  readonly connectedBackupPreviewFilesAllSelected =
    this.backupRestore.connectedPreviewFilesAllSelected;
  readonly connectedBackupPreviewFilesPageAllSelected =
    this.backupRestore.connectedPreviewFilesPageAllSelected;
  readonly connectedBackupPreviewFilesHasPrevPage =
    this.backupRestore.connectedPreviewFilesHasPrevPage;
  readonly connectedBackupPreviewFilesHasNextPage =
    this.backupRestore.connectedPreviewFilesHasNextPage;
  readonly connectedBackupDeviceConnected = this.backupRestore.connectedDeviceConnected;
  readonly connectedBackupDeviceDetail = this.backupRestore.connectedDeviceDetail;
  readonly backupInProgress = this.backupRestore.backupInProgress;
  readonly restoreInProgress = this.backupRestore.restoreInProgress;
  readonly lastRestoreState = this.backupRestore.lastRestoreState;
  readonly canRestoreActiveSnapshot = this.backupRestore.canRestoreActiveSnapshot;
  readonly canDeleteActiveSnapshot = this.backupRestore.canDeleteActiveSnapshot;
  readonly connectedBackupCategoryErrors = this.backupRestore.categoryErrors;

  async refreshBackupSnapshots() {
    await this.backupRestore.refreshSnapshots();
  }

  async scanConnectedBackupPreview(showSuccessToast = true) {
    return this.backupRestore.scanConnectedPreview(showSuccessToast);
  }

  async backupConnectedDevice() {
    return this.backupRestore.backupConnectedDevice();
  }

  async cancelConnectedBackupProcess() {
    return this.backupRestore.cancelConnectedProcess();
  }

  setConnectedBackupPreviewTab(tab: 'apps' | 'media' | 'contacts' | 'messages' | 'files') {
    this.backupRestore.setConnectedPreviewTab(tab);
  }

  setConnectedBackupPreviewMediaFilter(filter: 'all' | 'image' | 'video') {
    this.backupRestore.setConnectedPreviewMediaFilter(filter);
  }

  setBackupSnapshotTab(tab: 'apps' | 'media' | 'contacts' | 'messages' | 'files') {
    this.backupRestore.setSnapshotTab(tab);
  }

  isConnectedBackupCategoryEnabled(category: 'apps' | 'media' | 'contacts' | 'messages' | 'files') {
    return this.backupRestore.isConnectedBackupCategoryEnabled(category);
  }

  toggleConnectedBackupCategory(category: 'apps' | 'media' | 'contacts' | 'messages' | 'files') {
    this.backupRestore.toggleConnectedBackupCategory(category);
  }

  getConnectedBackupCategoryError(category: string) {
    return this.backupRestore.getCategoryError(category);
  }

  setConnectedBackupPreviewPage(pageIndex: number) {
    this.backupRestore.setConnectedPreviewPage(pageIndex);
  }

  nextConnectedBackupPreviewPage() {
    this.backupRestore.nextConnectedPreviewPage();
  }

  prevConnectedBackupPreviewPage() {
    this.backupRestore.prevConnectedPreviewPage();
  }

  isConnectedBackupPreviewAppSelected(packageName: string | undefined) {
    return this.backupRestore.isConnectedPreviewAppSelected(packageName);
  }

  toggleConnectedBackupPreviewAppSelection(packageName: string | undefined) {
    this.backupRestore.toggleConnectedPreviewAppSelection(packageName);
  }

  selectAllConnectedBackupPreviewApps() {
    this.backupRestore.selectAllConnectedPreviewApps();
  }

  clearConnectedBackupPreviewAppSelection() {
    this.backupRestore.clearConnectedPreviewAppSelection();
  }

  selectConnectedBackupPreviewPageApps() {
    this.backupRestore.selectConnectedPreviewPageApps();
  }

  clearConnectedBackupPreviewPageApps() {
    this.backupRestore.clearConnectedPreviewPageApps();
  }

  isCategoryItemSelected(category: 'media' | 'contacts' | 'messages' | 'files', id: string) {
    return this.backupRestore.isCategoryItemSelected(category, id);
  }

  toggleCategoryItemSelection(category: 'media' | 'contacts' | 'messages' | 'files', id: string) {
    this.backupRestore.toggleCategoryItemSelection(category, id);
  }

  selectAllCategoryItems(category: 'media' | 'contacts' | 'messages' | 'files') {
    this.backupRestore.selectAllCategoryItems(category);
  }

  clearCategorySelection(category: 'media' | 'contacts' | 'messages' | 'files') {
    this.backupRestore.clearCategorySelection(category);
  }

  selectCategoryPage(category: 'media' | 'contacts' | 'messages' | 'files') {
    this.backupRestore.selectCategoryPage(category);
  }

  clearCategoryPage(category: 'media' | 'contacts' | 'messages' | 'files') {
    this.backupRestore.clearCategoryPage(category);
  }

  nextCategoryPage(category: 'media' | 'contacts' | 'messages' | 'files') {
    this.backupRestore.nextCategoryPage(category);
  }

  prevCategoryPage(category: 'media' | 'contacts' | 'messages' | 'files') {
    this.backupRestore.prevCategoryPage(category);
  }

  async restoreActiveBackupSnapshot() {
    return this.backupRestore.restoreActiveSnapshot();
  }

  dismissLastRestoreResult() {
    this.backupRestore.dismissLastRestoreResult();
  }

  async deleteActiveBackupSnapshot() {
    return this.backupRestore.deleteActiveSnapshot();
  }

  selectBackupSnapshot(snapshot: BackupRestoreSnapshot) {
    this.backupRestore.selectSnapshot(snapshot.id);
  }

  async cancelDownloadById(downloadId: string) {
    await this.download.cancelDownloadById(downloadId);
  }
}
