import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogFacade } from '../../../../../state';

@Component({
  selector: 'app-catalog-selected-model-read-support',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './catalog-selected-model-read-support.component.html',
})
export class CatalogSelectedModelReadSupportComponent {
  protected readonly store = inject(CatalogFacade);
}
