/**
 * Backup/Restore Workflow Service — orchestrator.
 *
 * Split into focused submodules:
 *   - backup-preview-selection.service.ts — Selection, pagination, tab state for all categories
 *
 * This file keeps backend operations (scan, backup, restore, progress polling)
 * and delegates all selection/pagination state to BackupPreviewSelectionService.
 */
import { computed, Injectable, inject, signal } from '@angular/core';
import { BackupRestoreDesktopApiService } from '../../../core/api/desktop';
import type {
  BackupConnectedDeviceResponse,
  BackupRestoreSnapshot,
  BackupRestoreSnapshotsResponse,
  ConnectedBackupPreviewProgressResponse,
  ConnectedBackupPreviewResponse,
  DeleteBackupSnapshotResponse,
  RestoreBackupSnapshotResponse,
} from '../../../core/models/desktop-api';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';
import { BackupPreviewSelectionService } from './backup-preview-selection.service';
import {
  buildConnectedPreviewSnapshotFromProgress,
  buildConnectedPreviewStatusDetail,
  resolveSnapshotListState,
} from './backup-restore.workflow-helpers';

export interface RestoreResultState {
  response: RestoreBackupSnapshotResponse;
  completedAt: number;
  dismissed: boolean;
}

@Injectable({ providedIn: 'root' })
export class BackupRestoreWorkflowService {
  private readonly backend = inject(BackupRestoreDesktopApiService);
  private readonly ui = inject(WorkflowUiService);
  private readonly selection = inject(BackupPreviewSelectionService);
  private connectedPreviewScanSession = 0;
  private connectedPreviewStatusTicker: ReturnType<typeof setInterval> | null = null;
  private backupSnapshotsTicker: ReturnType<typeof setInterval> | null = null;

  // --- Own state (backend operations) ---
  readonly snapshots = signal<BackupRestoreSnapshot[]>([]);
  readonly backupRootPath = signal('');
  readonly backupRootRelativePath = signal<string | undefined>(undefined);
  readonly activeSnapshotId = signal('');
  readonly backingUpSnapshotId = signal('');
  readonly isLoading = signal(false);
  readonly connectedPreviewLoading = signal(false);
  readonly connectedDeviceConnected = signal(false);
  readonly connectedDeviceDetail = signal('');
  readonly backupInProgress = signal(false);
  readonly restoreInProgress = signal(false);
  readonly categoryErrors = signal<Record<string, string>>({});
  readonly lastRestoreState = signal<RestoreResultState | null>(null);

  // --- Delegate selection/pagination to BackupPreviewSelectionService ---
  readonly connectedPreview = this.selection.connectedPreview;
  readonly connectedPreviewTab = this.selection.connectedPreviewTab;
  readonly connectedPreviewMediaFilter = this.selection.connectedPreviewMediaFilter;
  readonly snapshotTab = this.selection.snapshotTab;
  readonly includeConnectedApps = this.selection.includeConnectedApps;
  readonly includeConnectedMedia = this.selection.includeConnectedMedia;
  readonly includeConnectedContacts = this.selection.includeConnectedContacts;
  readonly includeConnectedMessages = this.selection.includeConnectedMessages;
  readonly includeConnectedFiles = this.selection.includeConnectedFiles;
  readonly selectedConnectedPackageNames = this.selection.selectedConnectedPackageNames;
  readonly selectedConnectedMediaIds = this.selection.selectedConnectedMediaIds;
  readonly selectedConnectedContactIds = this.selection.selectedConnectedContactIds;
  readonly selectedConnectedMessageIds = this.selection.selectedConnectedMessageIds;
  readonly selectedConnectedFileIds = this.selection.selectedConnectedFileIds;
  readonly connectedPreviewPageIndex = this.selection.connectedPreviewPageIndex;
  readonly connectedPreviewMediaPageIndex = this.selection.connectedPreviewMediaPageIndex;
  readonly connectedPreviewContactsPageIndex = this.selection.connectedPreviewContactsPageIndex;
  readonly connectedPreviewMessagesPageIndex = this.selection.connectedPreviewMessagesPageIndex;
  readonly connectedPreviewFilesPageIndex = this.selection.connectedPreviewFilesPageIndex;
  readonly connectedPreviewApps = this.selection.connectedPreviewApps;
  readonly connectedPreviewMedia = this.selection.connectedPreviewMedia;
  readonly connectedPreviewContacts = this.selection.connectedPreviewContacts;
  readonly connectedPreviewMessages = this.selection.connectedPreviewMessages;
  readonly connectedPreviewFiles = this.selection.connectedPreviewFiles;
  readonly connectedPreviewTotalPages = this.selection.connectedPreviewTotalPages;
  readonly connectedPreviewCurrentPage = this.selection.connectedPreviewCurrentPage;
  readonly connectedPreviewVisibleApps = this.selection.connectedPreviewVisibleApps;
  readonly connectedPreviewSelectedCount = this.selection.connectedPreviewSelectedCount;
  readonly connectedPreviewHasPrevPage = this.selection.connectedPreviewHasPrevPage;
  readonly connectedPreviewHasNextPage = this.selection.connectedPreviewHasNextPage;
  readonly connectedPreviewAllSelected = this.selection.connectedPreviewAllSelected;
  readonly connectedPreviewPageAllSelected = this.selection.connectedPreviewPageAllSelected;
  readonly connectedPreviewFilteredMedia = this.selection.connectedPreviewFilteredMedia;
  readonly connectedPreviewMediaTotalPages = this.selection.connectedPreviewMediaTotalPages;
  readonly connectedPreviewMediaCurrentPage = this.selection.connectedPreviewMediaCurrentPage;
  readonly connectedPreviewVisibleMedia = this.selection.connectedPreviewVisibleMedia;
  readonly connectedPreviewMediaSelectedCount = this.selection.connectedPreviewMediaSelectedCount;
  readonly connectedPreviewMediaAllSelected = this.selection.connectedPreviewMediaAllSelected;
  readonly connectedPreviewMediaPageAllSelected =
    this.selection.connectedPreviewMediaPageAllSelected;
  readonly connectedPreviewMediaHasPrevPage = this.selection.connectedPreviewMediaHasPrevPage;
  readonly connectedPreviewMediaHasNextPage = this.selection.connectedPreviewMediaHasNextPage;
  readonly connectedPreviewContactsTotalPages = this.selection.connectedPreviewContactsTotalPages;
  readonly connectedPreviewContactsCurrentPage = this.selection.connectedPreviewContactsCurrentPage;
  readonly connectedPreviewVisibleContacts = this.selection.connectedPreviewVisibleContacts;
  readonly connectedPreviewContactsSelectedCount =
    this.selection.connectedPreviewContactsSelectedCount;
  readonly connectedPreviewContactsAllSelected = this.selection.connectedPreviewContactsAllSelected;
  readonly connectedPreviewContactsPageAllSelected =
    this.selection.connectedPreviewContactsPageAllSelected;
  readonly connectedPreviewContactsHasPrevPage = this.selection.connectedPreviewContactsHasPrevPage;
  readonly connectedPreviewContactsHasNextPage = this.selection.connectedPreviewContactsHasNextPage;
  readonly connectedPreviewMessageThreads = this.selection.connectedPreviewMessageThreads;
  readonly connectedPreviewMessagesTotalPages = this.selection.connectedPreviewMessagesTotalPages;
  readonly connectedPreviewMessagesCurrentPage = this.selection.connectedPreviewMessagesCurrentPage;
  readonly connectedPreviewVisibleThreads = this.selection.connectedPreviewVisibleThreads;
  readonly connectedPreviewVisibleMessages = this.selection.connectedPreviewVisibleMessages;
  readonly connectedPreviewMessagesSelectedCount =
    this.selection.connectedPreviewMessagesSelectedCount;
  readonly connectedPreviewMessagesAllSelected = this.selection.connectedPreviewMessagesAllSelected;
  readonly connectedPreviewMessagesPageAllSelected =
    this.selection.connectedPreviewMessagesPageAllSelected;
  readonly connectedPreviewMessagesHasPrevPage = this.selection.connectedPreviewMessagesHasPrevPage;
  readonly connectedPreviewMessagesHasNextPage = this.selection.connectedPreviewMessagesHasNextPage;
  readonly connectedPreviewFilesTotalPages = this.selection.connectedPreviewFilesTotalPages;
  readonly connectedPreviewFilesCurrentPage = this.selection.connectedPreviewFilesCurrentPage;
  readonly connectedPreviewVisibleFiles = this.selection.connectedPreviewVisibleFiles;
  readonly connectedPreviewFilesSelectedCount = this.selection.connectedPreviewFilesSelectedCount;
  readonly connectedPreviewFilesAllSelected = this.selection.connectedPreviewFilesAllSelected;
  readonly connectedPreviewFilesPageAllSelected =
    this.selection.connectedPreviewFilesPageAllSelected;
  readonly connectedPreviewFilesHasPrevPage = this.selection.connectedPreviewFilesHasPrevPage;
  readonly connectedPreviewFilesHasNextPage = this.selection.connectedPreviewFilesHasNextPage;
  readonly connectedBackupHasSelectedCategories =
    this.selection.connectedBackupHasSelectedCategories;
  readonly selectedConnectedPreviewSizeBytes = this.selection.selectedConnectedPreviewSizeBytes;

  // --- Computed (own state) ---
  readonly activeSnapshot = computed<BackupRestoreSnapshot | null>(() => {
    const allSnapshots = this.snapshots();
    if (allSnapshots.length === 0) return null;
    const selectedId = this.activeSnapshotId();
    if (!selectedId) return allSnapshots[0] || null;
    return allSnapshots.find((s) => s.id === selectedId) || allSnapshots[0] || null;
  });

  readonly canRestoreActiveSnapshot = computed(
    () => Boolean(this.activeSnapshot()?.id) && !this.restoreInProgress(),
  );
  readonly canDeleteActiveSnapshot = computed(
    () => Boolean(this.activeSnapshot()?.id) && !this.isLoading() && !this.restoreInProgress(),
  );

  readonly canBackupConnectedPreview = computed(() => {
    if (this.backupInProgress()) return false;
    if (!this.connectedDeviceConnected()) return false;
    if (!this.connectedBackupHasSelectedCategories()) return false;
    const preview = this.connectedPreview();
    if (
      this.includeConnectedApps() &&
      preview &&
      preview.apps.length > 0 &&
      this.connectedPreviewSelectedCount() === 0
    )
      return false;
    if (
      this.includeConnectedMedia() &&
      preview &&
      preview.media.length > 0 &&
      this.connectedPreviewMediaSelectedCount() === 0
    )
      return false;
    if (
      this.includeConnectedContacts() &&
      preview &&
      preview.contacts.length > 0 &&
      this.connectedPreviewContactsSelectedCount() === 0
    )
      return false;
    if (
      this.includeConnectedMessages() &&
      preview &&
      preview.messages.length > 0 &&
      this.connectedPreviewMessagesSelectedCount() === 0
    )
      return false;
    if (
      this.includeConnectedFiles() &&
      preview &&
      preview.files.length > 0 &&
      this.connectedPreviewFilesSelectedCount() === 0
    )
      return false;
    return true;
  });

  // --- Delegated methods ---
  setConnectedPreviewTab = this.selection.setConnectedPreviewTab.bind(this.selection);
  setConnectedPreviewMediaFilter = this.selection.setConnectedPreviewMediaFilter.bind(
    this.selection,
  );
  setSnapshotTab = this.selection.setSnapshotTab.bind(this.selection);
  isConnectedBackupCategoryEnabled = this.selection.isConnectedBackupCategoryEnabled.bind(
    this.selection,
  );
  toggleConnectedBackupCategory = this.selection.toggleConnectedBackupCategory.bind(this.selection);
  setConnectedPreviewPage = this.selection.setConnectedPreviewPage.bind(this.selection);
  nextConnectedPreviewPage = this.selection.nextConnectedPreviewPage.bind(this.selection);
  prevConnectedPreviewPage = this.selection.prevConnectedPreviewPage.bind(this.selection);
  isConnectedPreviewAppSelected = this.selection.isConnectedPreviewAppSelected.bind(this.selection);
  toggleConnectedPreviewAppSelection = this.selection.toggleConnectedPreviewAppSelection.bind(
    this.selection,
  );
  selectAllConnectedPreviewApps = this.selection.selectAllConnectedPreviewApps.bind(this.selection);
  clearConnectedPreviewAppSelection = this.selection.clearConnectedPreviewAppSelection.bind(
    this.selection,
  );
  selectConnectedPreviewPageApps = this.selection.selectConnectedPreviewPageApps.bind(
    this.selection,
  );
  clearConnectedPreviewPageApps = this.selection.clearConnectedPreviewPageApps.bind(this.selection);
  isCategoryItemSelected = this.selection.isCategoryItemSelected.bind(this.selection);
  toggleCategoryItemSelection = this.selection.toggleCategoryItemSelection.bind(this.selection);
  selectAllCategoryItems = this.selection.selectAllCategoryItems.bind(this.selection);
  clearCategorySelection = this.selection.clearCategorySelection.bind(this.selection);
  selectCategoryPage = this.selection.selectCategoryPage.bind(this.selection);
  clearCategoryPage = this.selection.clearCategoryPage.bind(this.selection);
  setCategoryPage = this.selection.setCategoryPage.bind(this.selection);
  nextCategoryPage = this.selection.nextCategoryPage.bind(this.selection);
  prevCategoryPage = this.selection.prevCategoryPage.bind(this.selection);

  // --- Backend operations ---

  selectSnapshot(snapshotId: string) {
    this.activeSnapshotId.set(snapshotId);
    this.selection.setSnapshotTab('apps');
  }

  getCategoryError(category: string) {
    return this.categoryErrors()[category] || '';
  }

  dismissLastRestoreResult() {
    const current = this.lastRestoreState();
    if (!current) {
      return;
    }
    this.lastRestoreState.set({
      ...current,
      dismissed: true,
    });
  }

  private applySnapshotListResponse(
    response: BackupRestoreSnapshotsResponse,
    options: {
      preserveActiveSelection?: boolean;
      preferredSnapshotId?: string;
    } = {},
  ) {
    const nextState = resolveSnapshotListState(response, this.activeSnapshotId(), options);
    this.backupRootPath.set(nextState.backupRootPath);
    this.backupRootRelativePath.set(nextState.backupRootRelativePath);
    this.snapshots.set(nextState.snapshots);
    this.activeSnapshotId.set(nextState.activeSnapshotId);
  }

  private stopBackupSnapshotsPolling() {
    if (this.backupSnapshotsTicker) {
      clearInterval(this.backupSnapshotsTicker);
      this.backupSnapshotsTicker = null;
    }
  }

  async refreshSnapshots() {
    this.isLoading.set(true);
    try {
      const response = await this.backend.listBackupRestoreSnapshots();
      if (!response.ok) {
        this.applySnapshotListResponse(response);
        this.ui.showToast(response.error || 'Failed to load backup snapshots.', 'error', 3600);
        return;
      }

      this.applySnapshotListResponse(response, { preserveActiveSelection: true });
    } catch (error) {
      this.snapshots.set([]);
      this.activeSnapshotId.set('');
      this.ui.showToast(this.ui.getErrorMessage(error), 'error', 3600);
    } finally {
      this.isLoading.set(false);
    }
  }

  async scanConnectedPreview(showSuccessToast = true): Promise<ConnectedBackupPreviewResponse> {
    if (this.connectedPreviewLoading()) {
      this.ui.status.set('Backup preview: scan already running.');
      return {
        ok: false,
        connected: this.connectedDeviceConnected(),
        error: 'Backup preview is already running.',
        detail: 'Wait for the current scan to finish before starting a new one.',
      };
    }

    this.connectedPreviewLoading.set(true);
    const scanSession = ++this.connectedPreviewScanSession;
    this.categoryErrors.set({});
    this.ui.status.set('Backup preview: preparing device scan...');
    let progressPollInFlight = false;
    let lastSeenLogCount = 0;
    let activeRunId = 0;
    let lastProgressUpdateAt = Date.now();
    let lastWaitMessageAt = 0;
    let deviceConnectionConfirmed = false;
    const waitForUiTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    const emitProgressLines = async (lines: string[]) => {
      if (scanSession !== this.connectedPreviewScanSession) {
        return;
      }

      for (const line of lines) {
        if (scanSession !== this.connectedPreviewScanSession) {
          return;
        }
        if (line.includes('Device connection ok.')) {
          deviceConnectionConfirmed = true;
        }
        this.ui.status.set(`Backup preview: ${line}`);
        lastProgressUpdateAt = Date.now();
        await waitForUiTick();
      }
    };

    const pollProgressOnce = async () => {
      if (scanSession !== this.connectedPreviewScanSession) {
        return;
      }

      const progress = await this.backend.getConnectedBackupPreviewProgress();
      if (scanSession !== this.connectedPreviewScanSession || !progress.ok) return;

      const runChanged = progress.runId !== activeRunId;
      if (runChanged) {
        activeRunId = progress.runId;
        lastSeenLogCount = progress.logBaseCount;
      }
      if (progress.running || runChanged) {
        this.applyConnectedPreviewProgress(progress);
      }

      const startCount = Math.max(lastSeenLogCount, progress.logBaseCount);
      const endCount = progress.logCount;
      if (endCount > startCount) {
        const newLines: string[] = [];
        for (let count = startCount; count < endCount; count += 1) {
          const indexInBuffer = count - progress.logBaseCount;
          const line = progress.logs[indexInBuffer];
          if (line) newLines.push(line);
        }
        lastSeenLogCount = endCount;
        if (newLines.length > 0) {
          await emitProgressLines(newLines);
          return;
        }
      }

      if (progress.lastLogLine && progress.logCount > lastSeenLogCount) {
        lastSeenLogCount = progress.logCount;
        await emitProgressLines([progress.lastLogLine]);
      }
    };

    try {
      const baselineProgress = await this.backend.getConnectedBackupPreviewProgress();
      if (baselineProgress.ok) {
        activeRunId = baselineProgress.runId;
        lastSeenLogCount = baselineProgress.logCount;
      }
    } catch {
      // Ignore baseline read failures.
    }

    if (this.connectedPreviewStatusTicker) {
      clearInterval(this.connectedPreviewStatusTicker);
      this.connectedPreviewStatusTicker = null;
    }
    const statusTicker = setInterval(async () => {
      if (scanSession !== this.connectedPreviewScanSession) {
        return;
      }

      if (progressPollInFlight) return;
      progressPollInFlight = true;
      try {
        await pollProgressOnce();
      } catch {
        // Ignore progress polling hiccups.
      } finally {
        progressPollInFlight = false;
      }

      const idleMsSinceProgress = Date.now() - lastProgressUpdateAt;
      if (
        !deviceConnectionConfirmed &&
        idleMsSinceProgress >= 6000 &&
        Date.now() - lastWaitMessageAt >= 5000
      ) {
        lastWaitMessageAt = Date.now();
        this.ui.status.set('Backup preview: waiting for device...');
      }
    }, 1200);
    this.connectedPreviewStatusTicker = statusTicker;

    try {
      this.ui.status.set('Backup preview: scanning connected device...');
      const response = await this.backend.scanConnectedBackupPreview();
      if (scanSession !== this.connectedPreviewScanSession) {
        return {
          ok: false,
          connected: false,
          error: 'Cancelled by user.',
          detail: 'Cancelled by user.',
        };
      }
      try {
        await pollProgressOnce();
      } catch {
        // Ignore final progress read errors.
      }
      const currentApps = this.connectedPreview()?.apps || [];
      this.connectedDeviceConnected.set(response.connected);
      this.connectedDeviceDetail.set(response.detail || response.error || '');
      this.selection.connectedPreview.set(response.snapshot || null);
      if (response.snapshot) {
        this.selection.syncConnectedPreviewSelection(currentApps, response.snapshot.apps);
        this.selection.syncCategorySelection(
          this.selection.selectedConnectedMediaIds,
          response.snapshot.media.map((e) => e.id),
        );
        this.selection.syncCategorySelection(
          this.selection.selectedConnectedContactIds,
          response.snapshot.contacts.map((e) => e.id),
        );
        this.selection.syncCategorySelection(
          this.selection.selectedConnectedMessageIds,
          response.snapshot.messages.map((e) => e.id),
        );
        this.selection.syncCategorySelection(
          this.selection.selectedConnectedFileIds,
          response.snapshot.files.map((e) => e.id),
        );
      } else {
        this.selection.resetAllSelections();
      }

      if (!response.ok) {
        this.ui.status.set(
          `Connected preview failed: ${response.error || response.detail || 'Unknown error.'}`,
        );
        if (response.error) {
          this.ui.showToast(response.error, 'error', 3200);
        }
        return response;
      }

      this.ui.status.set(
        response.detail ||
          `Connected preview ready (${response.snapshot?.apps.length || 0} apps scanned).`,
      );

      if (showSuccessToast) {
        this.ui.showToast(
          response.detail ||
            `Connected preview ready (${response.snapshot?.apps.length || 0} apps).`,
          'success',
          2600,
        );
      }
      return response;
    } catch (error) {
      if (scanSession !== this.connectedPreviewScanSession) {
        return {
          ok: false,
          connected: false,
          error: 'Cancelled by user.',
          detail: 'Cancelled by user.',
        };
      }
      const message = this.ui.getErrorMessage(error);
      this.ui.status.set(`Connected preview failed: ${message}`);
      this.connectedDeviceConnected.set(false);
      this.connectedDeviceDetail.set(message);
      this.selection.connectedPreview.set(null);
      this.selection.resetAllSelections();
      this.ui.showToast(message, 'error', 3600);
      return { ok: false, connected: false, error: message, detail: message };
    } finally {
      clearInterval(statusTicker);
      if (this.connectedPreviewStatusTicker === statusTicker) {
        this.connectedPreviewStatusTicker = null;
      }
      if (scanSession === this.connectedPreviewScanSession) {
        this.connectedPreviewLoading.set(false);
      }
    }
  }

  async cancelConnectedProcess() {
    const restoreWasRunning = this.restoreInProgress();
    const backupWasRunning = this.backupInProgress();
    this.connectedPreviewScanSession += 1;
    if (this.connectedPreviewStatusTicker) {
      clearInterval(this.connectedPreviewStatusTicker);
      this.connectedPreviewStatusTicker = null;
    }
    this.stopBackupSnapshotsPolling();
    try {
      await this.backend.cancelConnectedBackupProcess();
    } catch {
      // Ignore cancel RPC errors.
    }
    this.connectedPreviewLoading.set(false);
    this.backupInProgress.set(false);
    this.restoreInProgress.set(false);
    if (restoreWasRunning) {
      this.ui.status.set('Restore process: Cancelled by user.');
      this.ui.showToast('Restore process cancelled.', 'info', 2600);
      return;
    }
    if (backupWasRunning) {
      this.ui.status.set('Backup process: Cancelled by user.');
      this.ui.showToast('Backup process cancelled.', 'info', 2600);
      return;
    }
    this.ui.status.set('Backup preview: Cancelled by user.');
    this.ui.showToast('Backup preview cancelled.', 'info', 2600);
  }

  async backupConnectedDevice(): Promise<BackupConnectedDeviceResponse> {
    this.backupInProgress.set(true);
    const backupSession = ++this.connectedPreviewScanSession;
    let progressPollInFlight = false;
    let snapshotsPollInFlight = false;
    let lastSeenLogCount = 0;
    let activeRunId = 0;
    const knownSnapshotIds = new Set(this.snapshots().map((snapshot) => snapshot.id));
    let activeBackupSnapshotId = '';
    const waitForUiTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    const emitProgressLines = async (lines: string[]) => {
      if (backupSession !== this.connectedPreviewScanSession) {
        return;
      }

      for (const line of lines) {
        if (backupSession !== this.connectedPreviewScanSession) {
          return;
        }
        this.ui.status.set(`Backup process: ${line}`);
        await waitForUiTick();
      }
    };

    const pollProgressOnce = async () => {
      if (backupSession !== this.connectedPreviewScanSession) {
        return;
      }

      const progress = await this.backend.getConnectedBackupPreviewProgress();
      if (backupSession !== this.connectedPreviewScanSession || !progress.ok) {
        return;
      }

      const runChanged = progress.runId !== activeRunId;
      if (runChanged) {
        activeRunId = progress.runId;
        lastSeenLogCount = progress.logBaseCount;
      }

      const startCount = Math.max(lastSeenLogCount, progress.logBaseCount);
      const endCount = progress.logCount;
      if (endCount > startCount) {
        const newLines: string[] = [];
        for (let count = startCount; count < endCount; count += 1) {
          const indexInBuffer = count - progress.logBaseCount;
          const line = progress.logs[indexInBuffer];
          if (line) {
            newLines.push(line);
          }
        }
        lastSeenLogCount = endCount;
        if (newLines.length > 0) {
          await emitProgressLines(newLines);
          return;
        }
      }

      if (progress.lastLogLine && progress.logCount > lastSeenLogCount) {
        lastSeenLogCount = progress.logCount;
        await emitProgressLines([progress.lastLogLine]);
      }
    };

    const pollSnapshotsOnce = async () => {
      if (backupSession !== this.connectedPreviewScanSession) {
        return;
      }

      const response = await this.backend.listBackupRestoreSnapshots();
      if (backupSession !== this.connectedPreviewScanSession || !response.ok) {
        return;
      }

      if (!activeBackupSnapshotId) {
        const newSnapshot = response.snapshots.find(
          (snapshot) => !knownSnapshotIds.has(snapshot.id),
        );
        if (newSnapshot) {
          activeBackupSnapshotId = newSnapshot.id;
          this.backingUpSnapshotId.set(newSnapshot.id);
        }
      }

      this.applySnapshotListResponse(response, {
        preserveActiveSelection: !activeBackupSnapshotId,
        preferredSnapshotId: activeBackupSnapshotId || undefined,
      });
    };

    try {
      const includeApps = this.includeConnectedApps();
      const includeMedia = this.includeConnectedMedia();
      const includeContacts = this.includeConnectedContacts();
      const includeMessages = this.includeConnectedMessages();

      if (!this.connectedBackupHasSelectedCategories()) {
        const message = 'Select at least one category before starting backup.';
        this.ui.showToast(message, 'error', 3600);
        return { ok: false, connected: true, error: message, detail: message };
      }

      const selectedPackages = includeApps
        ? this.selection.getSelectedConnectedPreviewPackageNames()
        : [];
      const selectedPackagesPayload =
        includeApps && selectedPackages.length > 0 ? selectedPackages : undefined;
      if (includeApps && this.connectedPreview() && selectedPackages.length === 0) {
        const message = 'Select at least one app before starting backup.';
        this.ui.showToast(message, 'error', 3600);
        return { ok: false, connected: true, error: message, detail: message };
      }
      if (
        includeMedia &&
        (this.connectedPreview()?.media.length || 0) > 0 &&
        this.selectedConnectedMediaIds().length === 0
      ) {
        const message = 'Select at least one media item before starting backup.';
        this.ui.showToast(message, 'error', 3600);
        return { ok: false, connected: true, error: message, detail: message };
      }
      if (
        includeContacts &&
        (this.connectedPreview()?.contacts.length || 0) > 0 &&
        this.selectedConnectedContactIds().length === 0
      ) {
        const message = 'Select at least one contact before starting backup.';
        this.ui.showToast(message, 'error', 3600);
        return { ok: false, connected: true, error: message, detail: message };
      }
      if (
        includeMessages &&
        (this.connectedPreview()?.messages.length || 0) > 0 &&
        this.selectedConnectedMessageIds().length === 0
      ) {
        const message = 'Select at least one message before starting backup.';
        this.ui.showToast(message, 'error', 3600);
        return { ok: false, connected: true, error: message, detail: message };
      }
      if (
        this.includeConnectedFiles() &&
        (this.connectedPreview()?.files.length || 0) > 0 &&
        this.selectedConnectedFileIds().length === 0
      ) {
        const message = 'Select at least one file before starting backup.';
        this.ui.showToast(message, 'error', 3600);
        return { ok: false, connected: true, error: message, detail: message };
      }

      try {
        const baselineProgress = await this.backend.getConnectedBackupPreviewProgress();
        if (baselineProgress.ok) {
          activeRunId = baselineProgress.runId;
          lastSeenLogCount = baselineProgress.logCount;
        }
      } catch {
        // Ignore baseline read failures.
      }

      if (this.connectedPreviewStatusTicker) {
        clearInterval(this.connectedPreviewStatusTicker);
        this.connectedPreviewStatusTicker = null;
      }
      const statusTicker = setInterval(async () => {
        if (backupSession !== this.connectedPreviewScanSession) {
          return;
        }
        if (progressPollInFlight) {
          return;
        }
        progressPollInFlight = true;
        try {
          await pollProgressOnce();
        } catch {
          // Ignore progress polling hiccups.
        } finally {
          progressPollInFlight = false;
        }
      }, 900);
      this.connectedPreviewStatusTicker = statusTicker;

      this.stopBackupSnapshotsPolling();
      const snapshotsTicker = setInterval(async () => {
        if (backupSession !== this.connectedPreviewScanSession) {
          return;
        }
        if (snapshotsPollInFlight) {
          return;
        }
        snapshotsPollInFlight = true;
        try {
          await pollSnapshotsOnce();
        } catch {
          // Ignore snapshot polling hiccups.
        } finally {
          snapshotsPollInFlight = false;
        }
      }, 1800);
      this.backupSnapshotsTicker = snapshotsTicker;

      this.ui.status.set('Backup process: preparing backup...');
      const response = await this.backend.backupConnectedDevice({
        includeApps,
        includeMedia,
        includeContacts,
        includeMessages,
        includeFiles: this.includeConnectedFiles(),
        selectedPackages: selectedPackagesPayload,
        selectedMediaPaths: includeMedia
          ? this.connectedPreviewMedia()
              .filter((entry) => this.selectedConnectedMediaIds().includes(entry.id))
              .map((entry) => entry.relativePath)
          : undefined,
        selectedContactIds: includeContacts ? this.selectedConnectedContactIds() : undefined,
        selectedMessageIds: includeMessages ? this.selectedConnectedMessageIds() : undefined,
        selectedFilePaths: this.includeConnectedFiles()
          ? this.connectedPreviewFiles()
              .filter((entry) => this.selectedConnectedFileIds().includes(entry.id))
              .map((entry) => entry.relativePath)
          : undefined,
        maxApps: includeApps && selectedPackages.length > 0 ? selectedPackages.length : undefined,
      });
      try {
        await pollProgressOnce();
      } catch {
        // Ignore final progress read failures.
      }
      try {
        await pollSnapshotsOnce();
      } catch {
        // Ignore final snapshot read failures.
      }

      if (backupSession !== this.connectedPreviewScanSession) {
        return {
          ok: false,
          connected: false,
          error: 'Cancelled by user.',
          detail: 'Cancelled by user.',
        };
      }

      if (!response.ok) {
        this.ui.status.set(
          `Backup process: ${response.error || response.detail || 'Backup failed.'}`,
        );
        this.ui.showToast(response.error || response.detail || 'Backup failed.', 'error', 4200);
        return response;
      }

      await this.refreshSnapshots();
      if (response.snapshotId) {
        this.backingUpSnapshotId.set(response.snapshotId);
        this.activeSnapshotId.set(response.snapshotId);
      }
      const completionStatus = response.detail
        ? `Backup process: ${response.detail}`
        : 'Backup process: Backup completed.';
      if (!this.ui.status().startsWith('Backup process: Backup completed:')) {
        this.ui.status.set(completionStatus);
      }
      this.ui.showToast(response.detail || 'Backup completed.', 'success', 3600);
      return response;
    } catch (error) {
      if (backupSession !== this.connectedPreviewScanSession) {
        return {
          ok: false,
          connected: false,
          error: 'Cancelled by user.',
          detail: 'Cancelled by user.',
        };
      }
      const message = this.ui.getErrorMessage(error);
      this.ui.status.set(`Backup process: ${message}`);
      this.ui.showToast(message, 'error', 4200);
      return { ok: false, connected: false, error: message };
    } finally {
      if (this.connectedPreviewStatusTicker) {
        clearInterval(this.connectedPreviewStatusTicker);
        this.connectedPreviewStatusTicker = null;
      }
      this.stopBackupSnapshotsPolling();
      this.backingUpSnapshotId.set('');
      if (backupSession === this.connectedPreviewScanSession) {
        this.backupInProgress.set(false);
      }
    }
  }

  async restoreActiveSnapshot(): Promise<RestoreBackupSnapshotResponse> {
    const selectedSnapshot = this.activeSnapshot();
    if (!selectedSnapshot) {
      const message = 'Select a snapshot before restore.';
      this.ui.showToast(message, 'error', 3200);
      this.lastRestoreState.set(null);
      return {
        ok: false,
        connected: false,
        snapshotId: '',
        attemptedApps: 0,
        restoredApps: 0,
        failedApps: 0,
        attemptedMedia: 0,
        restoredMedia: 0,
        failedMedia: 0,
        attemptedContacts: 0,
        restoredContacts: 0,
        failedContacts: 0,
        attemptedMessages: 0,
        restoredMessages: 0,
        failedMessages: 0,
        attemptedFiles: 0,
        restoredFiles: 0,
        failedFiles: 0,
        error: message,
      };
    }

    this.restoreInProgress.set(true);
    this.lastRestoreState.set(null);
    const restoreSession = ++this.connectedPreviewScanSession;
    let progressPollInFlight = false;
    let lastSeenLogCount = 0;
    let activeRunId = 0;
    const waitForUiTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    const emitProgressLines = async (lines: string[]) => {
      if (restoreSession !== this.connectedPreviewScanSession) {
        return;
      }

      for (const line of lines) {
        if (restoreSession !== this.connectedPreviewScanSession) {
          return;
        }
        this.ui.status.set(`Restore process: ${line}`);
        await waitForUiTick();
      }
    };

    const pollProgressOnce = async () => {
      if (restoreSession !== this.connectedPreviewScanSession) {
        return;
      }

      const progress = await this.backend.getConnectedBackupPreviewProgress();
      if (restoreSession !== this.connectedPreviewScanSession || !progress.ok) {
        return;
      }

      const runChanged = progress.runId !== activeRunId;
      if (runChanged) {
        activeRunId = progress.runId;
        lastSeenLogCount = progress.logBaseCount;
      }

      const startCount = Math.max(lastSeenLogCount, progress.logBaseCount);
      const endCount = progress.logCount;
      if (endCount > startCount) {
        const newLines: string[] = [];
        for (let count = startCount; count < endCount; count += 1) {
          const indexInBuffer = count - progress.logBaseCount;
          const line = progress.logs[indexInBuffer];
          if (line) {
            newLines.push(line);
          }
        }
        lastSeenLogCount = endCount;
        if (newLines.length > 0) {
          await emitProgressLines(newLines);
          return;
        }
      }

      if (progress.lastLogLine && progress.logCount > lastSeenLogCount) {
        lastSeenLogCount = progress.logCount;
        await emitProgressLines([progress.lastLogLine]);
      }
    };

    try {
      const baselineProgress = await this.backend.getConnectedBackupPreviewProgress();
      if (baselineProgress.ok) {
        activeRunId = baselineProgress.runId;
        lastSeenLogCount = baselineProgress.logCount;
      }
    } catch {
      // Ignore baseline read failures.
    }

    if (this.connectedPreviewStatusTicker) {
      clearInterval(this.connectedPreviewStatusTicker);
      this.connectedPreviewStatusTicker = null;
    }
    const statusTicker = setInterval(async () => {
      if (restoreSession !== this.connectedPreviewScanSession) {
        return;
      }
      if (progressPollInFlight) {
        return;
      }
      progressPollInFlight = true;
      try {
        await pollProgressOnce();
      } catch {
        // Ignore progress polling hiccups.
      } finally {
        progressPollInFlight = false;
      }
    }, 900);
    this.connectedPreviewStatusTicker = statusTicker;

    this.ui.status.set('Restore process: preparing restore...');
    try {
      const response = await this.backend.restoreBackupSnapshot({
        snapshotId: selectedSnapshot.id,
        restoreApps: selectedSnapshot.apps.length > 0,
        restoreMedia: selectedSnapshot.media.length > 0,
        restoreContacts: selectedSnapshot.contacts.length > 0,
        restoreMessages: selectedSnapshot.messages.length > 0,
        restoreFiles: selectedSnapshot.files.length > 0,
      });

      try {
        await pollProgressOnce();
      } catch {
        // Ignore final progress read failures.
      }

      if (restoreSession !== this.connectedPreviewScanSession) {
        return {
          ok: false,
          connected: false,
          snapshotId: selectedSnapshot.id,
          attemptedApps: 0,
          restoredApps: 0,
          failedApps: 0,
          attemptedMedia: 0,
          restoredMedia: 0,
          failedMedia: 0,
          attemptedContacts: 0,
          restoredContacts: 0,
          failedContacts: 0,
          attemptedMessages: 0,
          restoredMessages: 0,
          failedMessages: 0,
          attemptedFiles: 0,
          restoredFiles: 0,
          failedFiles: 0,
          error: 'Cancelled by user.',
          detail: 'Cancelled by user.',
        };
      }

      if (!response.ok) {
        if (response.detail === 'Cancelled by user.' || response.error === 'Cancelled by user.') {
          return response;
        }
        this.lastRestoreState.set({
          response,
          completedAt: Date.now(),
          dismissed: false,
        });
        this.ui.status.set(
          `Restore process: ${response.error || response.detail || 'Restore failed.'}`,
        );
        this.ui.showToast(response.error || response.detail || 'Restore failed.', 'error', 4200);
        return response;
      }

      const summary =
        response.detail || `Restored ${response.restoredApps}/${response.attemptedApps} apps.`;
      this.lastRestoreState.set({
        response,
        completedAt: Date.now(),
        dismissed: false,
      });
      if (!this.ui.status().startsWith('Restore process: Restore completed')) {
        this.ui.status.set(`Restore process: ${summary}`);
      }
      this.ui.showToast(summary, 'success', 3600);
      return response;
    } catch (error) {
      if (restoreSession !== this.connectedPreviewScanSession) {
        return {
          ok: false,
          connected: false,
          snapshotId: selectedSnapshot.id,
          attemptedApps: 0,
          restoredApps: 0,
          failedApps: 0,
          attemptedMedia: 0,
          restoredMedia: 0,
          failedMedia: 0,
          attemptedContacts: 0,
          restoredContacts: 0,
          failedContacts: 0,
          attemptedMessages: 0,
          restoredMessages: 0,
          failedMessages: 0,
          attemptedFiles: 0,
          restoredFiles: 0,
          failedFiles: 0,
          error: 'Cancelled by user.',
          detail: 'Cancelled by user.',
        };
      }
      const message = this.ui.getErrorMessage(error);
      this.lastRestoreState.set({
        response: {
          ok: false,
          connected: false,
          snapshotId: selectedSnapshot.id,
          attemptedApps: 0,
          restoredApps: 0,
          failedApps: 0,
          attemptedMedia: 0,
          restoredMedia: 0,
          failedMedia: 0,
          attemptedContacts: 0,
          restoredContacts: 0,
          failedContacts: 0,
          attemptedMessages: 0,
          restoredMessages: 0,
          failedMessages: 0,
          attemptedFiles: 0,
          restoredFiles: 0,
          failedFiles: 0,
          error: message,
        },
        completedAt: Date.now(),
        dismissed: false,
      });
      this.ui.status.set(`Restore process: ${message}`);
      this.ui.showToast(message, 'error', 4200);
      return {
        ok: false,
        connected: false,
        snapshotId: selectedSnapshot.id,
        attemptedApps: 0,
        restoredApps: 0,
        failedApps: 0,
        attemptedMedia: 0,
        restoredMedia: 0,
        failedMedia: 0,
        attemptedContacts: 0,
        restoredContacts: 0,
        failedContacts: 0,
        attemptedMessages: 0,
        restoredMessages: 0,
        failedMessages: 0,
        attemptedFiles: 0,
        restoredFiles: 0,
        failedFiles: 0,
        error: message,
      };
    } finally {
      clearInterval(statusTicker);
      if (this.connectedPreviewStatusTicker === statusTicker) {
        this.connectedPreviewStatusTicker = null;
      }
      if (restoreSession === this.connectedPreviewScanSession) {
        this.restoreInProgress.set(false);
      }
    }
  }

  async deleteActiveSnapshot(): Promise<DeleteBackupSnapshotResponse> {
    const selectedSnapshot = this.activeSnapshot();
    if (!selectedSnapshot) {
      const message = 'Select a snapshot before deleting.';
      this.ui.showToast(message, 'error', 3200);
      return {
        ok: false,
        snapshotId: '',
        error: message,
      };
    }

    this.isLoading.set(true);
    try {
      const response = await this.backend.deleteBackupSnapshot({
        snapshotId: selectedSnapshot.id,
      });

      if (!response.ok) {
        this.ui.showToast(response.error || response.detail || 'Delete failed.', 'error', 4200);
        return response;
      }

      await this.refreshSnapshots();
      this.ui.showToast(response.detail || 'Snapshot deleted.', 'success', 3200);
      return response;
    } catch (error) {
      const message = this.ui.getErrorMessage(error);
      this.ui.showToast(message, 'error', 4200);
      return {
        ok: false,
        snapshotId: selectedSnapshot.id,
        error: message,
      };
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- Private helpers ---

  private applyConnectedPreviewProgress(progress: ConnectedBackupPreviewProgressResponse) {
    const nextSnapshot = buildConnectedPreviewSnapshotFromProgress(
      progress,
      this.connectedPreview(),
    );
    if (!nextSnapshot) return;

    const previousSnapshot = this.connectedPreview();
    this.selection.connectedPreview.set(nextSnapshot);
    this.connectedDeviceConnected.set(true);

    const nextDetail = buildConnectedPreviewStatusDetail(progress, nextSnapshot);
    if (nextDetail) {
      this.connectedDeviceDetail.set(nextDetail);
    }

    this.selection.syncConnectedPreviewSelection(previousSnapshot?.apps || [], nextSnapshot.apps);
    this.selection.syncCategorySelection(
      this.selection.selectedConnectedMediaIds,
      nextSnapshot.media.map((e) => e.id),
    );
    this.selection.syncCategorySelection(
      this.selection.selectedConnectedContactIds,
      nextSnapshot.contacts.map((e) => e.id),
    );
    this.selection.syncCategorySelection(
      this.selection.selectedConnectedMessageIds,
      nextSnapshot.messages.map((e) => e.id),
    );
    this.selection.syncCategorySelection(
      this.selection.selectedConnectedFileIds,
      nextSnapshot.files.map((e) => e.id),
    );

    if (progress.categoryErrors && Object.keys(progress.categoryErrors).length > 0) {
      this.categoryErrors.set({ ...progress.categoryErrors });
    }
  }
}
