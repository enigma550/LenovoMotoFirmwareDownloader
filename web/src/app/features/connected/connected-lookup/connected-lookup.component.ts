import { Component, inject } from '@angular/core';
import { WorkflowStore } from '../../../core/state/workflow/workflow.store';

@Component({
  selector: 'app-connected-lookup',
  standalone: true,
  templateUrl: './connected-lookup.component.html',
})
export class ConnectedLookupComponent {
  protected readonly store = inject(WorkflowStore);
}
