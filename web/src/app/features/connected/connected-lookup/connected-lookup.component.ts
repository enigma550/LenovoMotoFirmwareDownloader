import { Component, inject } from '@angular/core';
import { CatalogFacade } from '../../catalog/state';

@Component({
  selector: 'app-connected-lookup',
  standalone: true,
  templateUrl: './connected-lookup.component.html',
})
export class ConnectedLookupComponent {
  protected readonly store = inject(CatalogFacade);
}
