import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkflowStore } from '../../../core/state/workflow/workflow.store';

@Component({
  selector: 'app-auth-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './auth-panel.component.html',
})
export class AuthPanelComponent {
  protected readonly store = inject(WorkflowStore);
}
