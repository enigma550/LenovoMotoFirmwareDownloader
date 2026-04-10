/**
 * Connected backup preview selection and pagination state management.
 * Manages per-category (apps, media, contacts, messages, files) selection
 * and pagination signals.
 */
import { computed, Injectable, signal } from '@angular/core';
import type {
  BackupRestoreAppEntry,
  BackupRestoreContactEntry,
  BackupRestoreFileEntry,
  BackupRestoreMediaEntry,
  BackupRestoreMessageEntry,
  BackupRestoreSnapshot,
} from '../../../core/models/desktop-api';
import {
  groupMessagesBySender,
  type MessageThread,
} from '../../../features/backup-restore/backup-restore-workspace/utils/group-messages-by-sender';

const CONNECTED_PREVIEW_APPS_PER_PAGE = 24;
const CONNECTED_PREVIEW_MEDIA_PER_PAGE = 24;
const CONNECTED_PREVIEW_CONTACTS_PER_PAGE = 36;
const CONNECTED_PREVIEW_MESSAGE_THREADS_PER_PAGE = 10;
const CONNECTED_PREVIEW_FILES_PER_PAGE = 30;
const textEncoder = new TextEncoder();

export type BackupPreviewTab = 'apps' | 'media' | 'contacts' | 'messages' | 'files';
export type ConnectedBackupCategory = BackupPreviewTab;

@Injectable({ providedIn: 'root' })
export class BackupPreviewSelectionService {
  // --- Source snapshot (written by workflow service) ---
  readonly connectedPreview = signal<BackupRestoreSnapshot | null>(null);

  // --- Tab state ---
  readonly connectedPreviewTab = signal<BackupPreviewTab>('apps');
  readonly connectedPreviewMediaFilter = signal<'all' | 'image' | 'video'>('all');
  readonly snapshotTab = signal<BackupPreviewTab>('apps');

  // --- Category include toggles ---
  readonly includeConnectedApps = signal(true);
  readonly includeConnectedMedia = signal(true);
  readonly includeConnectedContacts = signal(true);
  readonly includeConnectedMessages = signal(true);
  readonly includeConnectedFiles = signal(true);

  // --- Selection signals ---
  readonly selectedConnectedPackageNames = signal<string[]>([]);
  readonly selectedConnectedMediaIds = signal<string[]>([]);
  readonly selectedConnectedContactIds = signal<string[]>([]);
  readonly selectedConnectedMessageIds = signal<string[]>([]);
  readonly selectedConnectedFileIds = signal<string[]>([]);

  // --- Page index signals ---
  readonly connectedPreviewPageIndex = signal(0);
  readonly connectedPreviewMediaPageIndex = signal(0);
  readonly connectedPreviewContactsPageIndex = signal(0);
  readonly connectedPreviewMessagesPageIndex = signal(0);
  readonly connectedPreviewFilesPageIndex = signal(0);

  // --- Computed: source data ---
  readonly connectedPreviewApps = computed<BackupRestoreAppEntry[]>(
    () => this.connectedPreview()?.apps || [],
  );
  readonly connectedPreviewMedia = computed<BackupRestoreMediaEntry[]>(
    () => this.connectedPreview()?.media || [],
  );
  readonly connectedPreviewContacts = computed<BackupRestoreContactEntry[]>(
    () => this.connectedPreview()?.contacts || [],
  );
  readonly connectedPreviewMessages = computed<BackupRestoreMessageEntry[]>(
    () => this.connectedPreview()?.messages || [],
  );
  readonly connectedPreviewFiles = computed<BackupRestoreFileEntry[]>(
    () => this.connectedPreview()?.files || [],
  );
  readonly selectedConnectedPreviewSizeBytes = computed(() => {
    const appBytes = this.includeConnectedApps()
      ? this.sumSelectedApps(this.connectedPreviewApps(), this.selectedConnectedPackageNames())
      : 0;
    const mediaBytes = this.includeConnectedMedia()
      ? this.sumSelectedById(this.connectedPreviewMedia(), this.selectedConnectedMediaIds())
      : 0;
    const contactBytes = this.includeConnectedContacts()
      ? this.estimateSelectedContactsBytes(
          this.connectedPreviewContacts(),
          this.selectedConnectedContactIds(),
        )
      : 0;
    const messageBytes = this.includeConnectedMessages()
      ? this.estimateSelectedMessagesBytes(
          this.connectedPreviewMessages(),
          this.selectedConnectedMessageIds(),
        )
      : 0;
    const fileBytes = this.includeConnectedFiles()
      ? this.sumSelectedById(this.connectedPreviewFiles(), this.selectedConnectedFileIds())
      : 0;
    const manifestBytes =
      this.hasAnySelectedConnectedItems() && this.connectedPreview()
        ? this.estimateConnectedManifestBytes()
        : 0;

    return appBytes + mediaBytes + contactBytes + messageBytes + fileBytes + manifestBytes;
  });

  // --- Apps pagination ---
  readonly connectedPreviewTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.connectedPreviewApps().length / CONNECTED_PREVIEW_APPS_PER_PAGE)),
  );
  readonly connectedPreviewCurrentPage = computed(() =>
    Math.min(this.connectedPreviewTotalPages() - 1, Math.max(0, this.connectedPreviewPageIndex())),
  );
  readonly connectedPreviewVisibleApps = computed<BackupRestoreAppEntry[]>(() => {
    const start = this.connectedPreviewCurrentPage() * CONNECTED_PREVIEW_APPS_PER_PAGE;
    return this.connectedPreviewApps().slice(start, start + CONNECTED_PREVIEW_APPS_PER_PAGE);
  });
  readonly connectedPreviewSelectedCount = computed(() => {
    const selectedSet = new Set(this.selectedConnectedPackageNames());
    return this.connectedPreviewApps().filter((app) => {
      const packageName = app.packageName?.trim() || '';
      return packageName.length > 0 && selectedSet.has(packageName);
    }).length;
  });
  readonly connectedPreviewHasPrevPage = computed(() => this.connectedPreviewCurrentPage() > 0);
  readonly connectedPreviewHasNextPage = computed(
    () => this.connectedPreviewCurrentPage() + 1 < this.connectedPreviewTotalPages(),
  );
  readonly connectedPreviewAllSelected = computed(() => {
    const apps = this.connectedPreviewApps();
    if (apps.length === 0) return false;
    const selectedSet = new Set(this.selectedConnectedPackageNames());
    return apps.every((app) => {
      const packageName = app.packageName?.trim() || '';
      return packageName.length > 0 && selectedSet.has(packageName);
    });
  });
  readonly connectedPreviewPageAllSelected = computed(() => {
    const visibleApps = this.connectedPreviewVisibleApps();
    if (visibleApps.length === 0) return false;
    const selectedSet = new Set(this.selectedConnectedPackageNames());
    return visibleApps.every((app) => {
      const packageName = app.packageName?.trim() || '';
      return packageName.length > 0 && selectedSet.has(packageName);
    });
  });

  // --- Media pagination & selection ---
  readonly connectedPreviewFilteredMedia = computed<BackupRestoreMediaEntry[]>(() => {
    const all = this.connectedPreviewMedia();
    const filter = this.connectedPreviewMediaFilter();
    if (filter === 'all') return all;
    return all.filter((entry) => entry.mediaType === filter);
  });
  private readonly mediaPageHelper = this.buildCategoryPageHelper(
    this.connectedPreviewFilteredMedia,
    this.selectedConnectedMediaIds,
    this.connectedPreviewMediaPageIndex,
    CONNECTED_PREVIEW_MEDIA_PER_PAGE,
  );
  readonly connectedPreviewMediaTotalPages = this.mediaPageHelper.totalPages;
  readonly connectedPreviewMediaCurrentPage = this.mediaPageHelper.currentPage;
  readonly connectedPreviewVisibleMedia = this.mediaPageHelper.visibleItems;
  readonly connectedPreviewMediaSelectedCount = this.mediaPageHelper.selectedCount;
  readonly connectedPreviewMediaAllSelected = this.mediaPageHelper.allSelected;
  readonly connectedPreviewMediaPageAllSelected = this.mediaPageHelper.pageAllSelected;
  readonly connectedPreviewMediaHasPrevPage = this.mediaPageHelper.hasPrevPage;
  readonly connectedPreviewMediaHasNextPage = this.mediaPageHelper.hasNextPage;

  // --- Contacts pagination & selection ---
  private readonly contactsPageHelper = this.buildCategoryPageHelper(
    this.connectedPreviewContacts,
    this.selectedConnectedContactIds,
    this.connectedPreviewContactsPageIndex,
    CONNECTED_PREVIEW_CONTACTS_PER_PAGE,
  );
  readonly connectedPreviewContactsTotalPages = this.contactsPageHelper.totalPages;
  readonly connectedPreviewContactsCurrentPage = this.contactsPageHelper.currentPage;
  readonly connectedPreviewVisibleContacts = this.contactsPageHelper.visibleItems;
  readonly connectedPreviewContactsSelectedCount = this.contactsPageHelper.selectedCount;
  readonly connectedPreviewContactsAllSelected = this.contactsPageHelper.allSelected;
  readonly connectedPreviewContactsPageAllSelected = this.contactsPageHelper.pageAllSelected;
  readonly connectedPreviewContactsHasPrevPage = this.contactsPageHelper.hasPrevPage;
  readonly connectedPreviewContactsHasNextPage = this.contactsPageHelper.hasNextPage;

  // --- Messages pagination & selection (thread-based) ---
  readonly connectedPreviewMessageThreads = computed<MessageThread[]>(() =>
    groupMessagesBySender(this.connectedPreviewMessages()),
  );
  readonly connectedPreviewMessagesTotalPages = computed(() =>
    Math.max(
      1,
      Math.ceil(
        this.connectedPreviewMessageThreads().length / CONNECTED_PREVIEW_MESSAGE_THREADS_PER_PAGE,
      ),
    ),
  );
  readonly connectedPreviewMessagesCurrentPage = computed(() =>
    Math.min(
      this.connectedPreviewMessagesTotalPages() - 1,
      Math.max(0, this.connectedPreviewMessagesPageIndex()),
    ),
  );
  readonly connectedPreviewVisibleThreads = computed<MessageThread[]>(() => {
    const start =
      this.connectedPreviewMessagesCurrentPage() * CONNECTED_PREVIEW_MESSAGE_THREADS_PER_PAGE;
    return this.connectedPreviewMessageThreads().slice(
      start,
      start + CONNECTED_PREVIEW_MESSAGE_THREADS_PER_PAGE,
    );
  });
  readonly connectedPreviewVisibleMessages = computed<BackupRestoreMessageEntry[]>(() =>
    this.connectedPreviewVisibleThreads().flatMap((t) => t.messages),
  );
  readonly connectedPreviewMessagesSelectedCount = computed(() => {
    const ids = new Set(this.selectedConnectedMessageIds());
    return this.connectedPreviewMessages().filter((m) => ids.has(m.id)).length;
  });
  readonly connectedPreviewMessagesAllSelected = computed(() => {
    const all = this.connectedPreviewMessages();
    if (all.length === 0) return false;
    const ids = new Set(this.selectedConnectedMessageIds());
    return all.every((m) => ids.has(m.id));
  });
  readonly connectedPreviewMessagesPageAllSelected = computed(() => {
    const visible = this.connectedPreviewVisibleMessages();
    if (visible.length === 0) return false;
    const ids = new Set(this.selectedConnectedMessageIds());
    return visible.every((m) => ids.has(m.id));
  });
  readonly connectedPreviewMessagesHasPrevPage = computed(
    () => this.connectedPreviewMessagesCurrentPage() > 0,
  );
  readonly connectedPreviewMessagesHasNextPage = computed(
    () =>
      this.connectedPreviewMessagesCurrentPage() + 1 < this.connectedPreviewMessagesTotalPages(),
  );

  // --- Files pagination & selection ---
  private readonly filesPageHelper = this.buildCategoryPageHelper(
    this.connectedPreviewFiles,
    this.selectedConnectedFileIds,
    this.connectedPreviewFilesPageIndex,
    CONNECTED_PREVIEW_FILES_PER_PAGE,
  );
  readonly connectedPreviewFilesTotalPages = this.filesPageHelper.totalPages;
  readonly connectedPreviewFilesCurrentPage = this.filesPageHelper.currentPage;
  readonly connectedPreviewVisibleFiles = this.filesPageHelper.visibleItems;
  readonly connectedPreviewFilesSelectedCount = this.filesPageHelper.selectedCount;
  readonly connectedPreviewFilesAllSelected = this.filesPageHelper.allSelected;
  readonly connectedPreviewFilesPageAllSelected = this.filesPageHelper.pageAllSelected;
  readonly connectedPreviewFilesHasPrevPage = this.filesPageHelper.hasPrevPage;
  readonly connectedPreviewFilesHasNextPage = this.filesPageHelper.hasNextPage;

  // --- Aggregate computed ---
  readonly connectedBackupHasSelectedCategories = computed(
    () =>
      this.includeConnectedApps() ||
      this.includeConnectedMedia() ||
      this.includeConnectedContacts() ||
      this.includeConnectedMessages() ||
      this.includeConnectedFiles(),
  );

  // --- Public methods ---

  setConnectedPreviewTab(tab: BackupPreviewTab) {
    this.connectedPreviewTab.set(tab);
  }

  setConnectedPreviewMediaFilter(filter: 'all' | 'image' | 'video') {
    this.connectedPreviewMediaFilter.set(filter);
    this.connectedPreviewMediaPageIndex.set(0);
  }

  setSnapshotTab(tab: BackupPreviewTab) {
    this.snapshotTab.set(tab);
  }

  isConnectedBackupCategoryEnabled(category: ConnectedBackupCategory) {
    if (category === 'apps') return this.includeConnectedApps();
    if (category === 'media') return this.includeConnectedMedia();
    if (category === 'contacts') return this.includeConnectedContacts();
    if (category === 'files') return this.includeConnectedFiles();
    return this.includeConnectedMessages();
  }

  toggleConnectedBackupCategory(category: ConnectedBackupCategory) {
    if (category === 'apps') {
      this.includeConnectedApps.set(!this.includeConnectedApps());
      return;
    }
    if (category === 'media') {
      this.includeConnectedMedia.set(!this.includeConnectedMedia());
      return;
    }
    if (category === 'contacts') {
      this.includeConnectedContacts.set(!this.includeConnectedContacts());
      return;
    }
    if (category === 'files') {
      this.includeConnectedFiles.set(!this.includeConnectedFiles());
      return;
    }
    this.includeConnectedMessages.set(!this.includeConnectedMessages());
  }

  setConnectedPreviewPage(pageIndex: number) {
    const totalPages = this.connectedPreviewTotalPages();
    this.connectedPreviewPageIndex.set(Math.max(0, Math.min(totalPages - 1, pageIndex)));
  }

  nextConnectedPreviewPage() {
    this.setConnectedPreviewPage(this.connectedPreviewCurrentPage() + 1);
  }

  prevConnectedPreviewPage() {
    this.setConnectedPreviewPage(this.connectedPreviewCurrentPage() - 1);
  }

  isConnectedPreviewAppSelected(packageName: string | undefined) {
    const normalized = packageName?.trim() || '';
    if (!normalized) return false;
    return this.selectedConnectedPackageNames().includes(normalized);
  }

  toggleConnectedPreviewAppSelection(packageName: string | undefined) {
    const normalized = packageName?.trim() || '';
    if (!normalized) return;
    const current = new Set(this.selectedConnectedPackageNames());
    if (current.has(normalized)) {
      current.delete(normalized);
    } else {
      current.add(normalized);
    }
    this.selectedConnectedPackageNames.set([...current]);
  }

  selectAllConnectedPreviewApps() {
    const packageNames = this.connectedPreviewApps()
      .map((app) => app.packageName?.trim() || '')
      .filter((v) => v.length > 0);
    this.selectedConnectedPackageNames.set(Array.from(new Set(packageNames)));
  }

  clearConnectedPreviewAppSelection() {
    this.selectedConnectedPackageNames.set([]);
  }

  selectConnectedPreviewPageApps() {
    const current = new Set(this.selectedConnectedPackageNames());
    for (const app of this.connectedPreviewVisibleApps()) {
      const packageName = app.packageName?.trim() || '';
      if (packageName) current.add(packageName);
    }
    this.selectedConnectedPackageNames.set([...current]);
  }

  clearConnectedPreviewPageApps() {
    const visibleSet = new Set(
      this.connectedPreviewVisibleApps()
        .map((app) => app.packageName?.trim() || '')
        .filter((v) => v.length > 0),
    );
    this.selectedConnectedPackageNames.set(
      this.selectedConnectedPackageNames().filter((name) => !visibleSet.has(name)),
    );
  }

  // --- Generic category selection/pagination ---
  isCategoryItemSelected(category: 'media' | 'contacts' | 'messages' | 'files', id: string) {
    return this.getCategorySelectedSignal(category)().includes(id);
  }

  toggleCategoryItemSelection(category: 'media' | 'contacts' | 'messages' | 'files', id: string) {
    const sig = this.getCategorySelectedSignal(category);
    const current = new Set(sig());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    sig.set([...current]);
  }

  selectAllCategoryItems(category: 'media' | 'contacts' | 'messages' | 'files') {
    const sig = this.getCategorySelectedSignal(category);
    sig.set(this.getCategoryItems(category).map((item) => item.id));
  }

  clearCategorySelection(category: 'media' | 'contacts' | 'messages' | 'files') {
    this.getCategorySelectedSignal(category).set([]);
  }

  selectCategoryPage(category: 'media' | 'contacts' | 'messages' | 'files') {
    const sig = this.getCategorySelectedSignal(category);
    const current = new Set(sig());
    for (const item of this.getCategoryVisibleItems(category)) current.add(item.id);
    sig.set([...current]);
  }

  clearCategoryPage(category: 'media' | 'contacts' | 'messages' | 'files') {
    const sig = this.getCategorySelectedSignal(category);
    const visible = new Set(this.getCategoryVisibleItems(category).map((item) => item.id));
    sig.set(sig().filter((id) => !visible.has(id)));
  }

  setCategoryPage(category: 'media' | 'contacts' | 'messages' | 'files', pageIndex: number) {
    const pageSig = this.getCategoryPageSignal(category);
    const totalPages = this.getCategoryHelper(category).totalPages();
    pageSig.set(Math.max(0, Math.min(totalPages - 1, pageIndex)));
  }

  nextCategoryPage(category: 'media' | 'contacts' | 'messages' | 'files') {
    this.setCategoryPage(category, this.getCategoryHelper(category).currentPage() + 1);
  }

  prevCategoryPage(category: 'media' | 'contacts' | 'messages' | 'files') {
    this.setCategoryPage(category, this.getCategoryHelper(category).currentPage() - 1);
  }

  // --- Sync helpers (called by workflow service after scans) ---

  syncConnectedPreviewSelection(
    previousApps: BackupRestoreAppEntry[],
    nextApps: BackupRestoreAppEntry[],
  ) {
    const nextPackageNames = nextApps
      .map((app) => app.packageName?.trim() || '')
      .filter((v) => v.length > 0);
    const nextPackageSet = new Set(nextPackageNames);

    if (nextPackageNames.length === 0) {
      this.selectedConnectedPackageNames.set([]);
      return;
    }

    const previousPackageNames = previousApps
      .map((app) => app.packageName?.trim() || '')
      .filter((v) => v.length > 0);
    const currentSelected = this.selectedConnectedPackageNames();
    const selectedInNext = currentSelected.filter((name) => nextPackageSet.has(name));
    const previousSelectedCount = previousPackageNames.filter((name) =>
      currentSelected.includes(name),
    ).length;
    const hadAllPreviousSelected =
      previousPackageNames.length > 0 && previousSelectedCount === previousPackageNames.length;

    if (selectedInNext.length === 0 || hadAllPreviousSelected) {
      this.selectedConnectedPackageNames.set(Array.from(new Set(nextPackageNames)));
      return;
    }

    this.selectedConnectedPackageNames.set(selectedInNext);
  }

  syncCategorySelection(selectedSignal: ReturnType<typeof signal<string[]>>, newIds: string[]) {
    const current = selectedSignal();
    if (current.length === 0) {
      selectedSignal.set(newIds);
      return;
    }
    const newIdSet = new Set(newIds);
    selectedSignal.set(current.filter((id) => newIdSet.has(id)));
  }

  getSelectedConnectedPreviewPackageNames() {
    const available = new Set(
      this.connectedPreviewApps()
        .map((app) => app.packageName?.trim() || '')
        .filter((v) => v.length > 0),
    );
    return this.selectedConnectedPackageNames().filter((name) => available.has(name));
  }

  resetAllSelections() {
    this.selectedConnectedPackageNames.set([]);
    this.selectedConnectedMediaIds.set([]);
    this.selectedConnectedContactIds.set([]);
    this.selectedConnectedMessageIds.set([]);
    this.selectedConnectedFileIds.set([]);
    this.connectedPreviewPageIndex.set(0);
  }

  // --- Private helpers ---

  private getCategorySelectedSignal(category: 'media' | 'contacts' | 'messages' | 'files') {
    if (category === 'media') return this.selectedConnectedMediaIds;
    if (category === 'contacts') return this.selectedConnectedContactIds;
    if (category === 'messages') return this.selectedConnectedMessageIds;
    return this.selectedConnectedFileIds;
  }

  private getCategoryPageSignal(category: 'media' | 'contacts' | 'messages' | 'files') {
    if (category === 'media') return this.connectedPreviewMediaPageIndex;
    if (category === 'contacts') return this.connectedPreviewContactsPageIndex;
    if (category === 'messages') return this.connectedPreviewMessagesPageIndex;
    return this.connectedPreviewFilesPageIndex;
  }

  private getCategoryHelper(category: 'media' | 'contacts' | 'messages' | 'files') {
    if (category === 'media') return this.mediaPageHelper;
    if (category === 'contacts') return this.contactsPageHelper;
    if (category === 'messages')
      return {
        totalPages: this.connectedPreviewMessagesTotalPages,
        currentPage: this.connectedPreviewMessagesCurrentPage,
        visibleItems: this.connectedPreviewVisibleMessages,
      };
    return this.filesPageHelper;
  }

  private getCategoryItems(category: 'media' | 'contacts' | 'messages' | 'files') {
    if (category === 'media') return this.connectedPreviewMedia();
    if (category === 'contacts') return this.connectedPreviewContacts();
    if (category === 'messages') return this.connectedPreviewMessages();
    return this.connectedPreviewFiles();
  }

  private getCategoryVisibleItems(category: 'media' | 'contacts' | 'messages' | 'files') {
    return this.getCategoryHelper(category).visibleItems();
  }

  private buildCategoryPageHelper<T extends { id: string }>(
    allItems: () => T[],
    selectedIds: () => string[],
    pageIndexSignal: () => number,
    perPage: number,
  ) {
    const totalPages = computed(() => Math.max(1, Math.ceil(allItems().length / perPage)));
    const currentPage = computed(() => Math.min(totalPages() - 1, Math.max(0, pageIndexSignal())));
    const visibleItems = computed(() => {
      const start = currentPage() * perPage;
      return allItems().slice(start, start + perPage);
    });
    const selectedCount = computed(() => {
      const ids = new Set(selectedIds());
      return allItems().filter((item) => ids.has(item.id)).length;
    });
    const allSelected = computed(() => {
      const items = allItems();
      if (items.length === 0) return false;
      const ids = new Set(selectedIds());
      return items.every((item) => ids.has(item.id));
    });
    const pageAllSelected = computed(() => {
      const items = visibleItems();
      if (items.length === 0) return false;
      const ids = new Set(selectedIds());
      return items.every((item) => ids.has(item.id));
    });
    const hasPrevPage = computed(() => currentPage() > 0);
    const hasNextPage = computed(() => currentPage() + 1 < totalPages());
    return {
      totalPages,
      currentPage,
      visibleItems,
      selectedCount,
      allSelected,
      pageAllSelected,
      hasPrevPage,
      hasNextPage,
    };
  }

  private hasAnySelectedConnectedItems() {
    return (
      (this.includeConnectedApps() && this.selectedConnectedPackageNames().length > 0) ||
      (this.includeConnectedMedia() && this.selectedConnectedMediaIds().length > 0) ||
      (this.includeConnectedContacts() && this.selectedConnectedContactIds().length > 0) ||
      (this.includeConnectedMessages() && this.selectedConnectedMessageIds().length > 0) ||
      (this.includeConnectedFiles() && this.selectedConnectedFileIds().length > 0)
    );
  }

  private sumSelectedApps(apps: BackupRestoreAppEntry[], selectedPackageNames: string[]) {
    const selectedSet = new Set(selectedPackageNames);
    let totalBytes = 0;

    for (const app of apps) {
      const packageName = app.packageName?.trim() || '';
      if (!packageName || !selectedSet.has(packageName)) {
        continue;
      }

      totalBytes += app.sizeBytes || 0;
      totalBytes += this.estimateDataUrlBytes(app.iconDataUrl);
    }

    return totalBytes;
  }

  private sumSelectedById<T extends { id: string; sizeBytes?: number }>(
    items: T[],
    selectedIds: string[],
  ) {
    const selectedSet = new Set(selectedIds);
    let totalBytes = 0;

    for (const item of items) {
      if (selectedSet.has(item.id)) {
        totalBytes += item.sizeBytes || 0;
      }
    }

    return totalBytes;
  }

  private estimateSelectedContactsBytes(
    contacts: BackupRestoreContactEntry[],
    selectedIds: string[],
  ) {
    const selectedContacts = this.selectItemsById(contacts, selectedIds);
    if (selectedContacts.length === 0) {
      return 0;
    }

    return (
      textEncoder.encode(JSON.stringify(selectedContacts, null, 2)).length +
      textEncoder.encode(this.contactsToVcf(selectedContacts)).length
    );
  }

  private estimateSelectedMessagesBytes(
    messages: BackupRestoreMessageEntry[],
    selectedIds: string[],
  ) {
    const selectedMessages = this.selectItemsById(messages, selectedIds);
    if (selectedMessages.length === 0) {
      return 0;
    }

    return textEncoder.encode(JSON.stringify(selectedMessages, null, 2)).length;
  }

  private selectItemsById<T extends { id: string }>(items: T[], selectedIds: string[]) {
    const selectedSet = new Set(selectedIds);
    return items.filter((item) => selectedSet.has(item.id));
  }

  private estimateDataUrlBytes(dataUrl: string | undefined) {
    if (!dataUrl) {
      return 0;
    }

    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex < 0) {
      return 0;
    }

    const payload = dataUrl.slice(commaIndex + 1);
    const paddingLength = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - paddingLength);
  }

  private contactsToVcf(contacts: BackupRestoreContactEntry[]) {
    return contacts
      .map((contact) => {
        const lines = [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `FN:${this.escapeVcfValue(contact.displayName)}`,
        ];
        if (contact.phoneNumber) {
          lines.push(`TEL:${contact.phoneNumber}`);
        }
        if (contact.email) {
          lines.push(`EMAIL:${contact.email}`);
        }
        lines.push('END:VCARD');
        return lines.join('\r\n');
      })
      .join('\r\n');
  }

  private escapeVcfValue(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
  }

  private estimateConnectedManifestBytes() {
    const preview = this.connectedPreview();
    if (!preview) {
      return 0;
    }

    return textEncoder.encode(
      JSON.stringify(
        {
          title: preview.title,
          deviceName: preview.deviceName,
          androidVersion: preview.androidVersion,
          categories: {
            apps: this.includeConnectedApps(),
            media: this.includeConnectedMedia(),
            contacts: this.includeConnectedContacts(),
            messages: this.includeConnectedMessages(),
            files: this.includeConnectedFiles(),
          },
          counts: {
            apps: this.includeConnectedApps() ? this.selectedConnectedPackageNames().length : 0,
            media: this.includeConnectedMedia() ? this.selectedConnectedMediaIds().length : 0,
            contacts: this.includeConnectedContacts()
              ? this.selectedConnectedContactIds().length
              : 0,
            messages: this.includeConnectedMessages()
              ? this.selectedConnectedMessageIds().length
              : 0,
            files: this.includeConnectedFiles() ? this.selectedConnectedFileIds().length : 0,
          },
        },
        null,
        2,
      ),
    ).length;
  }
}
