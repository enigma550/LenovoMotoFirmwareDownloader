import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { BackupRestoreSnapshot } from '../../../../../core/models/desktop-api';
import { BackupRestoreFacade } from '../../../state/index';

type BackupSnapshotTab = 'apps' | 'media' | 'contacts' | 'messages' | 'files';

@Component({
  selector: 'app-backup-snapshot-tab-selector',
  standalone: true,
  templateUrl: './backup-snapshot-tab-selector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupSnapshotTabSelectorComponent {
  protected readonly store = inject(BackupRestoreFacade);
  readonly snapshot = input.required<BackupRestoreSnapshot>();
  protected readonly tabs: readonly BackupSnapshotTab[] = [
    'apps',
    'media',
    'contacts',
    'messages',
    'files',
  ];
}
