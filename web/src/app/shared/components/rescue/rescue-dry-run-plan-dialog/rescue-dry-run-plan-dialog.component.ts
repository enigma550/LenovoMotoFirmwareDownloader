import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { flashTransportLabel as formatFlashTransportLabel } from '../../../../core/state/workflow/download-utils';
import type { RescueDryRunPlanDialog } from '../../../../core/state/workflow/workflow.types';
import { RescueDialogButtonComponent } from '../rescue-dialog-button/rescue-dialog-button.component';

@Component({
  selector: 'app-rescue-dry-run-plan-dialog',
  standalone: true,
  imports: [RescueDialogButtonComponent],
  templateUrl: './rescue-dry-run-plan-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RescueDryRunPlanDialogComponent {
  readonly plan = input<RescueDryRunPlanDialog | null>(null);
  readonly isDark = input(false);
  readonly close = output<void>();
  protected readonly flashTransportLabel = formatFlashTransportLabel;

  protected onBackdropClick() {
    this.close.emit();
  }

  protected onDialogClick(event: Event) {
    event.stopPropagation();
  }
}
