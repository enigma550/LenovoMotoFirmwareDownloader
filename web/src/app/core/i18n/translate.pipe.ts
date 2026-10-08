import { inject, Pipe, type PipeTransform } from '@angular/core';
import { TranslationService } from './translation.service';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false, // Re-evaluates when signal changes
})
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(TranslationService);

  transform(key: string, fallback?: string): string {
    // Reading the signal currentLang ensures tracking if used in reactive contexts
    this.i18n.currentLang();
    return this.i18n.translate(key, fallback);
  }
}
