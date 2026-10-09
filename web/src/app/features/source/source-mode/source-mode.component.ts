import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { CatalogFacade } from '../../catalog/state';

@Component({
  selector: 'app-source-mode',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './source-mode.component.html',
})
export class SourceModeComponent {
  protected readonly store = inject(CatalogFacade);
}
