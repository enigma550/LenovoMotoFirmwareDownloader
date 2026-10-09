import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { CatalogFacade } from '../../catalog/state';

@Component({
  selector: 'app-connected-lookup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './connected-lookup.component.html',
})
export class ConnectedLookupComponent {
  protected readonly store = inject(CatalogFacade);
}
