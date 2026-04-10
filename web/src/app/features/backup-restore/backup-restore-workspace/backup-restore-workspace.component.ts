import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  BackupRestoreAppEntry,
  BackupRestoreContactEntry,
  BackupRestoreMediaEntry,
  BackupRestoreSnapshot,
} from '../../../core/models/desktop-api';
import { RescueFlashConsoleComponent } from '../../../shared/components/rescue/rescue-flash-console/rescue-flash-console.component';
import { BackupSelectionToolbarComponent } from '../../../shared/components/ui/backup-selection-toolbar/backup-selection-toolbar.component';
import { UiActionButtonComponent } from '../../../shared/components/ui/ui-action-button/ui-action-button.component';
import { formatBytes, formatTime } from '../../../shared/utils/format';
import type { RestoreResultState } from '../state/backup-restore.workflow';
import { BackupRestoreFacade } from '../state/index';
import { BackupFileTreeComponent } from './backup-file-tree/backup-file-tree.component';
import { BackupMessageThreadListComponent } from './backup-message-thread-list/backup-message-thread-list.component';
import { BackupPreviewCategoryControlsComponent } from './components/backup-preview-category-controls/backup-preview-category-controls.component';
import { BackupSnapshotTabSelectorComponent } from './components/backup-snapshot-tab-selector/backup-snapshot-tab-selector.component';
import { buildFileTree } from './utils/build-file-tree';
import { groupMessagesBySender } from './utils/group-messages-by-sender';

const SNAPSHOT_APPS_PER_PAGE = 24;
const SNAPSHOT_MEDIA_PER_PAGE = 24;
const SNAPSHOT_CONTACTS_PER_PAGE = 36;
const SNAPSHOT_MESSAGE_THREADS_PER_PAGE = 10;

@Component({
  selector: 'app-backup-restore-workspace',
  standalone: true,
  imports: [
    UiActionButtonComponent,
    RescueFlashConsoleComponent,
    BackupSelectionToolbarComponent,
    BackupMessageThreadListComponent,
    BackupFileTreeComponent,
    BackupPreviewCategoryControlsComponent,
    BackupSnapshotTabSelectorComponent,
  ],
  templateUrl: './backup-restore-workspace.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupRestoreWorkspaceComponent {
  protected readonly store = inject(BackupRestoreFacade);
  protected readonly previewLoadingSkeletons = Array.from({ length: 12 }, (_, index) => index);
  protected readonly mediaFilterOptions: { value: 'all' | 'image' | 'video'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'image', label: 'Photos' },
    { value: 'video', label: 'Videos' },
  ];
  private readonly snapshotAppsPageIndex = signal(0);
  private readonly snapshotMediaPageIndex = signal(0);
  private readonly snapshotContactsPageIndex = signal(0);
  private readonly snapshotMessagesPageIndex = signal(0);

  // --- Grouped/tree computed signals ---
  protected readonly connectedMessageThreads = this.store.connectedBackupPreviewVisibleThreads;
  protected readonly snapshotAllMessageThreads = computed(() =>
    groupMessagesBySender(this.store.activeBackupSnapshot()?.messages || []),
  );
  protected readonly snapshotAppsTotalPages = computed(() =>
    Math.max(
      1,
      Math.ceil((this.store.activeBackupSnapshot()?.apps.length || 0) / SNAPSHOT_APPS_PER_PAGE),
    ),
  );
  protected readonly snapshotMediaTotalPages = computed(() =>
    Math.max(
      1,
      Math.ceil((this.store.activeBackupSnapshot()?.media.length || 0) / SNAPSHOT_MEDIA_PER_PAGE),
    ),
  );
  protected readonly snapshotContactsTotalPages = computed(() =>
    Math.max(
      1,
      Math.ceil(
        (this.store.activeBackupSnapshot()?.contacts.length || 0) / SNAPSHOT_CONTACTS_PER_PAGE,
      ),
    ),
  );
  protected readonly snapshotMessagesTotalPages = computed(() =>
    Math.max(
      1,
      Math.ceil(this.snapshotAllMessageThreads().length / SNAPSHOT_MESSAGE_THREADS_PER_PAGE),
    ),
  );
  protected readonly snapshotAppsCurrentPage = computed(() =>
    Math.min(this.snapshotAppsTotalPages() - 1, Math.max(0, this.snapshotAppsPageIndex())),
  );
  protected readonly snapshotMediaCurrentPage = computed(() =>
    Math.min(this.snapshotMediaTotalPages() - 1, Math.max(0, this.snapshotMediaPageIndex())),
  );
  protected readonly snapshotContactsCurrentPage = computed(() =>
    Math.min(this.snapshotContactsTotalPages() - 1, Math.max(0, this.snapshotContactsPageIndex())),
  );
  protected readonly snapshotMessagesCurrentPage = computed(() =>
    Math.min(this.snapshotMessagesTotalPages() - 1, Math.max(0, this.snapshotMessagesPageIndex())),
  );
  protected readonly connectedFileTree = computed(() =>
    buildFileTree(this.store.connectedBackupPreviewFiles()),
  );

  protected readonly selectedMessageIdsSet = computed(
    () => new Set(this.store.selectedConnectedMessageIds()),
  );

  protected readonly selectedFileIdsSet = computed(
    () => new Set(this.store.selectedConnectedFileIds()),
  );
  protected readonly activeSnapshotRestoreState = computed<RestoreResultState | null>(() => {
    const activeSnapshot = this.store.activeBackupSnapshot();
    const lastState = this.store.lastRestoreState();
    if (!activeSnapshot || !lastState || lastState.dismissed) {
      return null;
    }
    return lastState.response.snapshotId === activeSnapshot.id ? lastState : null;
  });

  // --- Format helpers (delegate to shared utils) ---
  protected formatTime = formatTime;
  protected formatBytes = formatBytes;

  // --- Page labels ---
  protected connectedPreviewPageLabel() {
    return `${this.store.connectedBackupPreviewPageIndex() + 1}/${this.store.connectedBackupPreviewTotalPages()}`;
  }

  protected connectedMediaPageLabel() {
    return `${this.store.connectedBackupPreviewMediaPageIndex() + 1}/${this.store.connectedBackupPreviewMediaTotalPages()}`;
  }

  protected connectedContactsPageLabel() {
    return `${this.store.connectedBackupPreviewContactsPageIndex() + 1}/${this.store.connectedBackupPreviewContactsTotalPages()}`;
  }

  protected connectedMessagesPageLabel() {
    return `${this.store.connectedBackupPreviewMessagesPageIndex() + 1}/${this.store.connectedBackupPreviewMessagesTotalPages()}`;
  }

  // --- Snapshot preview slicers ---
  protected snapshotPageLabel(category: 'apps' | 'media' | 'contacts' | 'messages') {
    if (category === 'apps') {
      return `${this.snapshotAppsCurrentPage() + 1}/${this.snapshotAppsTotalPages()}`;
    }
    if (category === 'media') {
      return `${this.snapshotMediaCurrentPage() + 1}/${this.snapshotMediaTotalPages()}`;
    }
    if (category === 'contacts') {
      return `${this.snapshotContactsCurrentPage() + 1}/${this.snapshotContactsTotalPages()}`;
    }
    if (category === 'messages') {
      return `${this.snapshotMessagesCurrentPage() + 1}/${this.snapshotMessagesTotalPages()}`;
    }
    return '1/1';
  }

  protected snapshotHasPrevPage(category: 'apps' | 'media' | 'contacts' | 'messages') {
    if (category === 'apps') return this.snapshotAppsCurrentPage() > 0;
    if (category === 'media') return this.snapshotMediaCurrentPage() > 0;
    if (category === 'contacts') return this.snapshotContactsCurrentPage() > 0;
    if (category === 'messages') return this.snapshotMessagesCurrentPage() > 0;
    return false;
  }

  protected snapshotHasNextPage(category: 'apps' | 'media' | 'contacts' | 'messages') {
    if (category === 'apps')
      return this.snapshotAppsCurrentPage() + 1 < this.snapshotAppsTotalPages();
    if (category === 'media') {
      return this.snapshotMediaCurrentPage() + 1 < this.snapshotMediaTotalPages();
    }
    if (category === 'contacts') {
      return this.snapshotContactsCurrentPage() + 1 < this.snapshotContactsTotalPages();
    }
    if (category === 'messages') {
      return this.snapshotMessagesCurrentPage() + 1 < this.snapshotMessagesTotalPages();
    }
    return false;
  }

  protected prevSnapshotPage(category: 'apps' | 'media' | 'contacts' | 'messages') {
    if (category === 'apps') {
      this.snapshotAppsPageIndex.set(this.snapshotAppsCurrentPage() - 1);
      return;
    }
    if (category === 'media') {
      this.snapshotMediaPageIndex.set(this.snapshotMediaCurrentPage() - 1);
      return;
    }
    if (category === 'contacts') {
      this.snapshotContactsPageIndex.set(this.snapshotContactsCurrentPage() - 1);
      return;
    }
    if (category === 'messages') {
      this.snapshotMessagesPageIndex.set(this.snapshotMessagesCurrentPage() - 1);
      return;
    }
  }

  protected nextSnapshotPage(category: 'apps' | 'media' | 'contacts' | 'messages') {
    if (category === 'apps') {
      this.snapshotAppsPageIndex.set(this.snapshotAppsCurrentPage() + 1);
      return;
    }
    if (category === 'media') {
      this.snapshotMediaPageIndex.set(this.snapshotMediaCurrentPage() + 1);
      return;
    }
    if (category === 'contacts') {
      this.snapshotContactsPageIndex.set(this.snapshotContactsCurrentPage() + 1);
      return;
    }
    if (category === 'messages') {
      this.snapshotMessagesPageIndex.set(this.snapshotMessagesCurrentPage() + 1);
      return;
    }
  }

  protected snapshotAppItems() {
    const snapshot = this.store.activeBackupSnapshot();
    if (!snapshot) {
      return [] as BackupRestoreAppEntry[];
    }
    const start = this.snapshotAppsCurrentPage() * SNAPSHOT_APPS_PER_PAGE;
    return snapshot.apps.slice(start, start + SNAPSHOT_APPS_PER_PAGE);
  }

  protected snapshotMediaItems() {
    const snapshot = this.store.activeBackupSnapshot();
    if (!snapshot) {
      return [] as BackupRestoreMediaEntry[];
    }
    const start = this.snapshotMediaCurrentPage() * SNAPSHOT_MEDIA_PER_PAGE;
    return snapshot.media.slice(start, start + SNAPSHOT_MEDIA_PER_PAGE);
  }

  protected snapshotContactItems() {
    const snapshot = this.store.activeBackupSnapshot();
    if (!snapshot) {
      return [] as BackupRestoreContactEntry[];
    }
    const start = this.snapshotContactsCurrentPage() * SNAPSHOT_CONTACTS_PER_PAGE;
    return snapshot.contacts.slice(start, start + SNAPSHOT_CONTACTS_PER_PAGE);
  }

  protected snapshotMessageThreads() {
    const start = this.snapshotMessagesCurrentPage() * SNAPSHOT_MESSAGE_THREADS_PER_PAGE;
    return this.snapshotAllMessageThreads().slice(start, start + SNAPSHOT_MESSAGE_THREADS_PER_PAGE);
  }

  protected snapshotFileTree() {
    const snapshot = this.store.activeBackupSnapshot();
    if (!snapshot) {
      return buildFileTree([]);
    }
    return buildFileTree(snapshot.files);
  }

  protected isSnapshotBeingBackedUp(snapshot: BackupRestoreSnapshot) {
    return this.store.backupInProgress() && this.store.backingUpSnapshotId() === snapshot.id;
  }

  protected restoreRowStatus(
    attempted: number,
    restored: number,
    failed: number,
  ): 'idle' | 'success' | 'partial' | 'failed' {
    if (attempted === 0) {
      return 'idle';
    }
    if (failed === 0 && restored === attempted) {
      return 'success';
    }
    if (restored === 0) {
      return 'failed';
    }
    return 'partial';
  }

  protected dismissRestoreSummary() {
    this.store.dismissLastRestoreResult();
  }

  // --- Connected preview items ---
  protected connectedPreviewAppItems() {
    return this.store.connectedBackupPreviewVisibleApps();
  }

  protected connectedPreviewMediaItems() {
    return this.store.connectedBackupPreviewVisibleMedia();
  }

  protected connectedPreviewContactItems() {
    return this.store.connectedBackupPreviewVisibleContacts();
  }

  // --- App selection helpers ---
  protected isConnectedPreviewAppSelected(app: BackupRestoreAppEntry) {
    return this.store.isConnectedBackupPreviewAppSelected(app.packageName);
  }

  protected toggleConnectedPreviewAppSelection(app: BackupRestoreAppEntry) {
    this.store.toggleConnectedBackupPreviewAppSelection(app.packageName);
  }

  // --- Display helpers ---
  protected appInitials(entry: BackupRestoreAppEntry) {
    const normalized = entry.appName.replace(/[^a-zA-Z0-9 ]+/g, ' ').trim();
    if (!normalized) return 'APP';
    const parts = normalized.split(/\s+/).slice(0, 2);
    return (
      parts.map((value) => value[0]?.toUpperCase() || '').join('') ||
      normalized.slice(0, 3).toUpperCase()
    );
  }

  protected mediaTypeLabel(entry: BackupRestoreMediaEntry) {
    if (entry.mediaType === 'image') return 'Image';
    if (entry.mediaType === 'video') return 'Video';
    if (entry.mediaType === 'audio') return 'Audio';
    if (entry.mediaType === 'document') return 'Document';
    return 'File';
  }

  protected isConnectedPreviewMediaSelected(entry: BackupRestoreMediaEntry) {
    return this.store.isCategoryItemSelected('media', entry.id);
  }

  protected toggleConnectedPreviewMediaSelection(entry: BackupRestoreMediaEntry) {
    this.store.toggleCategoryItemSelection('media', entry.id);
  }

  protected isConnectedPreviewContactSelected(entry: BackupRestoreContactEntry) {
    return this.store.isCategoryItemSelected('contacts', entry.id);
  }

  protected toggleConnectedPreviewContactSelection(entry: BackupRestoreContactEntry) {
    this.store.toggleCategoryItemSelection('contacts', entry.id);
  }

  protected contactInitials(entry: BackupRestoreContactEntry) {
    const normalized = entry.displayName.replace(/[^a-zA-Z0-9 ]+/g, ' ').trim();
    if (!normalized) return 'CT';
    const parts = normalized.split(/\s+/).slice(0, 2);
    return (
      parts.map((value) => value[0]?.toUpperCase() || '').join('') ||
      normalized.slice(0, 2).toUpperCase()
    );
  }

  protected contactSubtitle(entry: BackupRestoreContactEntry) {
    if (entry.phoneNumber) return entry.phoneNumber;
    if (entry.email) return entry.email;
    return 'No phone or email';
  }

  // --- Message thread toggle (all messages in a thread) ---
  protected onToggleMessageThread(sender: string) {
    const thread = this.connectedMessageThreads().find((t) => t.sender === sender);
    if (!thread) return;
    const selected = this.selectedMessageIdsSet();
    const allSelected = thread.messages.every((m) => selected.has(m.id));
    for (const message of thread.messages) {
      const isSelected = selected.has(message.id);
      if (allSelected ? isSelected : !isSelected) {
        this.store.toggleCategoryItemSelection('messages', message.id);
      }
    }
  }

  protected onToggleMessage(messageId: string) {
    this.store.toggleCategoryItemSelection('messages', messageId);
  }

  // --- File tree toggle (folder = batch toggle all files) ---
  protected onToggleFile(fileId: string) {
    this.store.toggleCategoryItemSelection('files', fileId);
  }

  protected onToggleFolder(fileIds: string[]) {
    const selected = this.selectedFileIdsSet();
    const allSelected = fileIds.every((id) => selected.has(id));
    for (const id of fileIds) {
      const isSelected = selected.has(id);
      if (allSelected ? isSelected : !isSelected) {
        this.store.toggleCategoryItemSelection('files', id);
      }
    }
  }

  protected onSnapshotCardKeydown(snapshot: BackupRestoreSnapshot, event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    this.selectSnapshot(snapshot);
  }

  protected async onDeleteSnapshot(snapshot: BackupRestoreSnapshot, event: Event) {
    event.stopPropagation();

    const confirmed = window.confirm(`Delete snapshot "${snapshot.title}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    this.selectSnapshot(snapshot);
    await this.store.deleteActiveBackupSnapshot();
  }

  protected selectSnapshot(snapshot: BackupRestoreSnapshot) {
    this.snapshotAppsPageIndex.set(0);
    this.snapshotMediaPageIndex.set(0);
    this.snapshotContactsPageIndex.set(0);
    this.snapshotMessagesPageIndex.set(0);
    this.store.selectBackupSnapshot(snapshot);
  }
}
