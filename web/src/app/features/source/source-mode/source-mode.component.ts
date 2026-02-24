import { Component, inject } from '@angular/core';
import { WorkflowStore } from '../../../core/state/workflow/workflow.store';

@Component({
  selector: 'app-source-mode',
  standalone: true,
  templateUrl: './source-mode.component.html',
})
export class SourceModeComponent {
  protected readonly store = inject(WorkflowStore);
}
