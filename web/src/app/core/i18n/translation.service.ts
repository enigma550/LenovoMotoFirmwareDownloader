import { Injectable, signal } from '@angular/core';
import { enUS } from './translations/en-us';
import { ptBR } from './translations/pt-br';

export type SupportedLanguage = 'pt-BR' | 'en-US';

const STORAGE_KEY = 'lmfd_language';

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private readonly defaultLang: SupportedLanguage = this.resolveInitialLanguage();
  readonly currentLang = signal<SupportedLanguage>(this.defaultLang);

  private readonly dictionaries: Record<SupportedLanguage, Record<string, string>> = {
    'pt-BR': ptBR,
    'en-US': enUS,
  };

  private resolveInitialLanguage(): SupportedLanguage {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'pt-BR' || saved === 'en-US') {
        return saved;
      }
      const navLang = navigator.language?.toLowerCase() || '';
      if (navLang.startsWith('pt')) {
        return 'pt-BR';
      }
    } catch {
      // Fallback
    }
    return 'pt-BR'; // Default to PT-BR as requested
  }

  setLanguage(lang: SupportedLanguage) {
    this.currentLang.set(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Best-effort
    }
  }

  toggleLanguage() {
    this.setLanguage(this.currentLang() === 'pt-BR' ? 'en-US' : 'pt-BR');
  }

  translate(key: string, paramsOrFallback?: Record<string, string | number> | string): string {
    const dict = this.dictionaries[this.currentLang()];
    let value = dict ? dict[key] : undefined;
    // Fallback to English dictionary
    if (typeof value !== 'string' && this.currentLang() !== 'en-US') {
      value = enUS[key];
    }

    const fallback = typeof paramsOrFallback === 'string' ? paramsOrFallback : undefined;
    const params =
      paramsOrFallback && typeof paramsOrFallback === 'object' ? paramsOrFallback : undefined;

    if (typeof value !== 'string') {
      return fallback ?? key;
    }
    if (!params) {
      return value;
    }
    return value.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : match,
    );
  }
}
