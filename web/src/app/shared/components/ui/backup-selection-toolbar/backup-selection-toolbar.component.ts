import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { UiActionButtonComponent } from '../ui-action-button/ui-action-button.component';

@Component({
  selector: 'app-backup-selection-toolbar',
  standalone: true,
  imports: [UiActionButtonComponent],
  templateUrl: './backup-selection-toolbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupSelectionToolbarComponent {
  readonly isDark = input(false);
  readonly pageLabel = input('1/1');
  readonly selectAllDisabled = input(false);
  readonly clearAllDisabled = input(true);
  readonly selectPageDisabled = input(false);
  readonly hasPrevPage = input(false);
  readonly hasNextPage = input(false);

  readonly selectAll = output<void>();
  readonly clearAll = output<void>();
  readonly selectPage = output<void>();
  readonly clearPage = output<void>();
  readonly prevPage = output<void>();
  readonly nextPage = output<void>();
}
