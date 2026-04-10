import { Component, inject } from '@angular/core';
import { CatalogFacade } from '../../catalog/state';

@Component({
  selector: 'app-source-mode',
  standalone: true,
  templateUrl: './source-mode.component.html',
})
export class SourceModeComponent {
  protected readonly store = inject(CatalogFacade);
}
