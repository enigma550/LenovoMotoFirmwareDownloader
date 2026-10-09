import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { ConfirmDialogService } from '../../../state/confirm-dialog.service';
import { WorkflowUiService } from '../../../state/workflow-ui.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './confirm-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  protected readonly confirm = inject(ConfirmDialogService);
  protected readonly ui = inject(WorkflowUiService);

  onBackdropClick() {
    this.confirm.decline();
  }

  onDialogClick(event: MouseEvent) {
    event.stopPropagation();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.confirm.decline();
  }
}
