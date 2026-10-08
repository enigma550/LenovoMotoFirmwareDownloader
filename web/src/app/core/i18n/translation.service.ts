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

  translate(key: string, fallback?: string): string {
    const dict = this.dictionaries[this.currentLang()];
    const directVal = dict ? dict[key] : undefined;
    if (typeof directVal === 'string') {
      return directVal;
    }
    // Fallback to English dictionary
    if (this.currentLang() !== 'en-US') {
      const enVal = enUS[key];
      if (typeof enVal === 'string') {
        return enVal;
      }
    }
    return fallback ?? key;
  }
}
