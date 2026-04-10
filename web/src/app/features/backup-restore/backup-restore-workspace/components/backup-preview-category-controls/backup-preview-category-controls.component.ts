import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { BackupRestoreSnapshot } from '../../../../../core/models/desktop-api';
import { BackupRestoreFacade } from '../../../state/index';

type BackupPreviewCategory = 'apps' | 'media' | 'contacts' | 'messages' | 'files';

@Component({
  selector: 'app-backup-preview-category-controls',
  standalone: true,
  templateUrl: './backup-preview-category-controls.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupPreviewCategoryControlsComponent {
  protected readonly store = inject(BackupRestoreFacade);
  readonly snapshot = input.required<BackupRestoreSnapshot>();
  protected readonly previewTabs: readonly BackupPreviewCategory[] = [
    'apps',
    'media',
    'contacts',
    'messages',
    'files',
  ];
  protected readonly categoryTabs: readonly BackupPreviewCategory[] = [
    'apps',
    'media',
    'contacts',
    'messages',
    'files',
  ];

  protected categoryLabel(category: BackupPreviewCategory) {
    if (category === 'apps') return 'Apps';
    if (category === 'media') return 'Media';
    if (category === 'contacts') return 'Contacts';
    if (category === 'messages') return 'Messages';
    return 'Files';
  }

  protected connectedCategorySelectedCount(category: BackupPreviewCategory) {
    if (category === 'apps') return this.store.connectedBackupPreviewSelectedCount();
    if (category === 'media') return this.store.connectedBackupPreviewMediaSelectedCount();
    if (category === 'contacts') return this.store.connectedBackupPreviewContactsSelectedCount();
    if (category === 'messages') return this.store.connectedBackupPreviewMessagesSelectedCount();
    return this.store.connectedBackupPreviewFilesSelectedCount();
  }

  protected connectedCategoryTotalCount(category: BackupPreviewCategory) {
    const connectedSnapshot = this.snapshot();
    if (category === 'apps') return connectedSnapshot.apps.length;
    if (category === 'media') return connectedSnapshot.media.length;
    if (category === 'contacts') return connectedSnapshot.contacts.length;
    if (category === 'messages') return connectedSnapshot.messages.length;
    return connectedSnapshot.files.length;
  }
}
